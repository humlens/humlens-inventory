import { prisma } from '@/lib/prisma';
import { listLowStockItems } from 'models/item';
import { hasOpenAgentAction, logAgentAction, proposeAction } from 'models/agentAction';
import { canAutoReorder } from '@/lib/ai/policy';
import { getConnection } from '@/lib/connections';
import { raiseProcurementRequests } from '@/lib/ai/agents/procurementReorder';

// Scans every item below its reorder point and prepares a purchase order
// draft for each one: created straight away when the auto-reorder policy
// allows it, otherwise waiting in the inbox for approval. Items it can't
// draft for (no preferred supplier) become findings. When the team buys through
// Humlens Procurement, it raises a purchase request there instead — same "always leave an
// explainable trail" pattern as the procurement app's approval agent.
// Intended to run on submit-adjacent triggers and on a schedule (see
// workers/agentScheduler.ts) since low stock isn't a single discrete event.
export async function runReorderAgent(teamId: string) {
  const lowStockItems = await listLowStockItems(teamId);

  // Buying happens in Humlens Procurement: raise requests there instead.
  const procurement = await getConnection(teamId, 'PROCUREMENT');
  if (procurement?.options.routeReorders) return raiseProcurementRequests(teamId, procurement, lowStockItems);

  const actions = [];

  for (const item of lowStockItems) {
    // One open suggestion per item: don't repeat it every run.
    if (await hasOpenAgentAction(teamId, 'AUTO_REORDER_SUGGESTION', item.id)) continue;

    const evidence = [
      { label: 'On hand', value: item.totalOnHand },
      { label: 'Reorder point', value: item.reorderPoint },
      { label: 'Order quantity', value: item.reorderQty },
    ];

    if (!item.preferredSupplierId) {
      actions.push(
        await logAgentAction({
          teamId,
          type: 'AUTO_REORDER_SUGGESTION',
          status: 'PROPOSED',
          agent: 'reorder',
          title: `${item.name} (${item.sku}) is low, but has no preferred supplier`,
          itemId: item.id,
          evidence,
          input: { onHand: item.totalOnHand, reorderPoint: item.reorderPoint },
          reasoning: `${item.name} (${item.sku}) is at ${item.totalOnHand} units, at or below its reorder point of ${item.reorderPoint}. Set a preferred supplier on this item so the agent can draft a purchase order for it.`,
        })
      );
      continue;
    }

    const warehouse =
      (await prisma.warehouse.findFirst({ where: { teamId, isDefault: true } })) ??
      (await prisma.warehouse.findFirst({ where: { teamId } }));

    if (!warehouse) {
      actions.push(
        await logAgentAction({
          teamId,
          type: 'AUTO_REORDER_SUGGESTION',
          status: 'REJECTED_BY_POLICY',
          agent: 'reorder',
          title: 'Add a warehouse so the agent can reorder',
          itemId: item.id,
          reasoning: 'No warehouse configured for this team yet.',
        })
      );
      continue;
    }

    const estimatedAmount = item.reorderQty * Number(item.costPrice);
    const decision = await canAutoReorder({
      teamId,
      estimatedAmount,
      categoryIds: item.categoryId ? [item.categoryId] : [],
    });

    // The draft is always prepared. Policy only decides whether the agent
    // may create it on its own or has to ask first.
    actions.push(
      await proposeAction({
        teamId,
        type: 'AUTO_REORDER_SUGGESTION',
        agent: 'reorder',
        tool: 'purchaseOrder.draft',
        itemId: item.id,
        autoApply: decision.allowed,
        args: {
          supplierId: item.preferredSupplierId,
          warehouseId: warehouse.id,
          currency: 'USD',
          lineItems: [
            {
              itemId: item.id,
              description: `${item.name} (${item.sku}) — auto-reorder`,
              quantity: Math.max(1, item.reorderQty),
              unitPrice: Number(item.costPrice),
            },
          ],
        },
        evidence: [...evidence, { label: 'Estimated cost', value: estimatedAmount.toFixed(2) }],
        reasoning: decision.allowed
          ? `${item.name} (${item.sku}) is at ${item.totalOnHand} units, at or below its reorder point of ${item.reorderPoint}. Drafted a purchase order for ${item.reorderQty} from the preferred supplier, within the team's auto-reorder policy. The PO still needs approval before it's issued.`
          : `${item.name} (${item.sku}) is at ${item.totalOnHand} units, at or below its reorder point of ${item.reorderPoint}. The agent needs you to approve this draft: ${decision.reason ?? 'the auto-reorder policy does not cover it.'}`,
        confidence: 0.9,
      })
    );
  }

  return actions;
}
