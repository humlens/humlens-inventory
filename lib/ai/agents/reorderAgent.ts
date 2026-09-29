import { generateObject } from 'ai';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { listLowStockItems } from 'models/item';
import { hasOpenAgentAction, logAgentAction, proposeAction } from 'models/agentAction';
import { canAutoReorder } from '@/lib/ai/policy';
import { getConnection } from '@/lib/connections';
import { raiseProcurementRequests } from '@/lib/ai/agents/procurementReorder';
import { getDemandSummary, type DemandRow } from '@/lib/ai/demand';
import { withJudgement } from '@/lib/ai/judgement';

// Scans every item below its reorder point and prepares a purchase order
// draft for each one: created straight away when the auto-reorder policy
// allows it, otherwise waiting in the inbox for approval. Items it can't
// draft for (no preferred supplier) become findings. When the team buys through
// Humlens Procurement, it raises a purchase request there instead — same "always leave an
// explainable trail" pattern as the procurement app's approval agent.
// Intended to run on submit-adjacent triggers and on a schedule (see
// workers/agentScheduler.ts) since low stock isn't a single discrete event.
//
// The rule decides *whether* to reorder (below the reorder point, and not
// already covered by open purchase orders). The model decides *how much*,
// from recent sales, lead time and what's on order, within bounds the rule
// sets; the spending policy is then checked against the model's figure.
// Without a model the item's fixed order quantity is used.

const DEMAND_DAYS = 60;
/** The model may order between 1 and this many times the item's usual quantity. */
const MAX_MULTIPLE = 3;

type Sizing = { quantity: number; reasoning: string; confidence: number };

const sizingSchema = z.object({
  orders: z.array(
    z.object({
      sku: z.string(),
      quantity: z.number().int().positive().describe('Units to order now'),
      reasoning: z.string().describe('One or two plain sentences a buyer can check, citing the numbers used'),
      confidence: z.number().min(0).max(1),
    })
  ),
});

// One call for the whole batch, so a run costs one request however many items are low.
async function sizeOrders(teamId: string, rows: DemandRow[]) {
  const judged = await withJudgement(teamId, 'reorder sizing', async (ai, abortSignal) => {
    const lines = rows.map(
      (row) =>
        `${row.sku} | ${row.name} | on hand ${row.onHand} | on order ${row.onOrder} | reorder point ${row.reorderPoint} | usual order ${row.reorderQty} | sold ${row.sold} in ${DEMAND_DAYS} days (${row.perDay}/day) | lead time ${row.leadTimeDays ?? 'unknown'} days | unit cost ${row.costPrice}`
    );
    const { object, usage } = await generateObject({
      model: ai.model,
      schema: sizingSchema,
      abortSignal,
      prompt: `You size replenishment orders for a small online seller. Each item below is at or under its reorder point. For each, choose how many units to order now so stock covers the supplier's lead time plus about 30 days of sales, net of what's already on order. Stay between 1 and ${MAX_MULTIPLE}× the usual order. If an item has too little sales history to judge, keep the usual order. Avoid over-ordering slow sellers.

SKU | name | stock and sales
${lines.join('\n')}`,
    });
    return { object, tokens: usage?.totalTokens };
  });
  if (!judged) return { sizes: new Map<string, Sizing>(), ai: null, tokens: undefined };

  const sizes = new Map<string, Sizing>();
  for (const order of judged.value.object.orders) {
    const row = rows.find((r) => r.sku === order.sku);
    if (!row) continue;
    const ceiling = Math.max(1, row.reorderQty) * MAX_MULTIPLE;
    sizes.set(row.itemId, { quantity: Math.min(ceiling, Math.max(1, order.quantity)), reasoning: order.reasoning, confidence: order.confidence });
  }
  return { sizes, ai: judged.ai, tokens: judged.value.tokens };
}

export async function runReorderAgent(teamId: string) {
  const lowStockItems = await listLowStockItems(teamId);

  // Buying happens in Humlens Procurement: raise requests there instead.
  const procurement = await getConnection(teamId, 'PROCUREMENT');
  if (procurement?.options.routeReorders) return raiseProcurementRequests(teamId, procurement, lowStockItems);

  const demand = lowStockItems.length
    ? await getDemandSummary(teamId, { days: DEMAND_DAYS, itemIds: lowStockItems.map((item) => item.id), limit: 200 })
    : { days: DEMAND_DAYS, items: [] };
  const demandBy = new Map(demand.items.map((row) => [row.itemId, row]));

  // Only items that still need an order: not already suggested, not already
  // covered by stock on open purchase orders, and with somewhere to buy from.
  const candidates = [];
  const actions = [];
  for (const item of lowStockItems) {
    // One open suggestion per item: don't repeat it every run.
    if (await hasOpenAgentAction(teamId, 'AUTO_REORDER_SUGGESTION', item.id)) continue;
    const onOrder = demandBy.get(item.id)?.onOrder ?? 0;
    if (item.totalOnHand + onOrder > item.reorderPoint) continue;

    if (!item.preferredSupplierId) {
      actions.push(
        await logAgentAction({
          teamId,
          type: 'AUTO_REORDER_SUGGESTION',
          status: 'PROPOSED',
          agent: 'reorder',
          title: `${item.name} (${item.sku}) is low, but has no preferred supplier`,
          itemId: item.id,
          evidence: [
            { label: 'On hand', value: item.totalOnHand },
            { label: 'Reorder point', value: item.reorderPoint },
            { label: 'Order quantity', value: item.reorderQty },
          ],
          input: { onHand: item.totalOnHand, reorderPoint: item.reorderPoint },
          reasoning: `${item.name} (${item.sku}) is at ${item.totalOnHand} units, at or below its reorder point of ${item.reorderPoint}. Set a preferred supplier on this item so the agent can draft a purchase order for it.`,
        })
      );
      continue;
    }
    candidates.push(item);
  }
  if (candidates.length === 0) return actions;

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
        itemId: candidates[0]!.id,
        reasoning: 'No warehouse configured for this team yet.',
      })
    );
    return actions;
  }

  const { sizes, ai, tokens } = await sizeOrders(
    teamId,
    candidates.map((item) => demandBy.get(item.id)).filter((row): row is DemandRow => !!row)
  );
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { currency: true } });

  for (const item of candidates) {
    const row = demandBy.get(item.id);
    const sizing = sizes.get(item.id);
    const quantity = sizing?.quantity ?? Math.max(1, item.reorderQty);
    const estimatedAmount = quantity * Number(item.costPrice);
    const decision = await canAutoReorder({
      teamId,
      estimatedAmount,
      categoryIds: item.categoryId ? [item.categoryId] : [],
    });

    const why = sizing
      ? sizing.reasoning
      : `${item.name} (${item.sku}) is at ${item.totalOnHand} units, at or below its reorder point of ${item.reorderPoint}. Ordering its usual ${quantity}.`;

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
          supplierId: item.preferredSupplierId!,
          warehouseId: warehouse.id,
          currency: team?.currency ?? 'USD',
          lineItems: [
            {
              itemId: item.id,
              description: `${item.name} (${item.sku}) — auto-reorder`,
              quantity,
              unitPrice: Number(item.costPrice),
            },
          ],
        },
        evidence: [
          { label: 'On hand', value: item.totalOnHand },
          { label: 'Reorder point', value: item.reorderPoint },
          { label: `Sold (${DEMAND_DAYS} days)`, value: row?.sold ?? 0 },
          { label: 'Order quantity', value: sizing && quantity !== item.reorderQty ? `${quantity} (usually ${item.reorderQty})` : quantity },
          { label: 'Estimated cost', value: estimatedAmount.toFixed(2) },
        ],
        reasoning: decision.allowed
          ? `${why} Drafted within the team's auto-reorder policy; the PO still needs approval before it's issued.`
          : `${why} The agent needs you to approve this draft: ${decision.reason ?? 'the auto-reorder policy does not cover it.'}`,
        confidence: sizing?.confidence ?? 0.9,
        aiModel: sizing ? ai?.id : undefined,
        // The batch call's tokens, recorded once.
        aiTokens: sizing && item === candidates.find((c) => sizes.has(c.id)) ? tokens : undefined,
      })
    );
  }

  return actions;
}
