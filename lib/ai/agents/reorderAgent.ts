import { prisma } from '@/lib/prisma';
import { listLowStockItems } from 'models/item';
import { createPurchaseOrder } from 'models/purchaseOrder';
import { logAgentAction } from 'models/agentAction';
import { canAutoReorder } from '@/lib/ai/policy';

// Scans every item below its reorder point and, for each one, either drafts
// a purchase order automatically (when policy allows and the item has a
// preferred supplier) or logs why it didn't — same "always leave an
// explainable trail" pattern as the procurement app's approval agent.
// Intended to run on submit-adjacent triggers and on a schedule (see
// workers/agentScheduler.ts) since low stock isn't a single discrete event.
export async function runReorderAgent(teamId: string) {
  const lowStockItems = await listLowStockItems(teamId);
  const actions = [];

  for (const item of lowStockItems) {
    if (!item.preferredSupplierId) {
      actions.push(
        await logAgentAction({
          teamId,
          type: 'AUTO_REORDER_SUGGESTION',
          status: 'PROPOSED',
          itemId: item.id,
          input: { onHand: item.totalOnHand, reorderPoint: item.reorderPoint },
          reasoning: `${item.name} (${item.sku}) is at ${item.totalOnHand} units, at or below its reorder point of ${item.reorderPoint}. Set a preferred supplier on this item to let the agent draft a purchase order automatically.`,
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

    if (!decision.allowed) {
      actions.push(
        await logAgentAction({
          teamId,
          type: 'AUTO_REORDER_SUGGESTION',
          status: 'REJECTED_BY_POLICY',
          itemId: item.id,
          input: { onHand: item.totalOnHand, reorderPoint: item.reorderPoint, estimatedAmount },
          reasoning: decision.reason ?? undefined,
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
          itemId: item.id,
          reasoning: 'No warehouse configured for this team yet.',
        })
      );
      continue;
    }

    const po = await createPurchaseOrder({
      teamId,
      createdById: item.createdById,
      supplierId: item.preferredSupplierId,
      warehouseId: warehouse.id,
      currency: 'USD',
      tax: 0,
      shipping: 0,
      lineItems: [
        {
          itemId: item.id,
          description: `${item.name} (${item.sku}) — auto-reorder`,
          quantity: item.reorderQty,
          unitPrice: Number(item.costPrice),
        },
      ],
    });

    actions.push(
      await logAgentAction({
        teamId,
        type: 'AUTO_REORDER_SUGGESTION',
        status: 'EXECUTED',
        itemId: item.id,
        purchaseOrderId: po.id,
        input: { onHand: item.totalOnHand, reorderPoint: item.reorderPoint, reorderQty: item.reorderQty },
        output: { purchaseOrderId: po.id, poNumber: po.poNumber },
        reasoning: `Drafted ${po.poNumber} for ${item.reorderQty} units from the preferred supplier — within the team's auto-reorder policy. Still requires approval before it's issued.`,
        confidence: 0.9,
      })
    );
  }

  return actions;
}
