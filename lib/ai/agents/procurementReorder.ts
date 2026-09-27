import crypto from 'crypto';

import { prisma } from '@/lib/prisma';
import type { ResolvedConnection } from '@/lib/connections';
import { enqueue } from '@/lib/outbox';
import { logAgentAction } from 'models/agentAction';

type LowStockItem = {
  id: string;
  sku: string;
  name: string;
  totalOnHand: number;
  reorderPoint: number;
  reorderQty: number;
  costPrice: unknown;
};

// After a request is raised for an item, wait this long before asking again
// (Procurement tracks it from there; the store waits the same time).
export const REQUEST_HOLD_DAYS = 7;

// When the team buys through Humlens Procurement (Settings → Integrations →
// "Send low-stock reorders to Procurement"), low stock becomes one purchase
// request there instead of draft purchase orders here, so approvals, budgets
// and supplier choice stay in one place. Queued through the outbox, so it
// survives Procurement being briefly unreachable.
export async function raiseProcurementRequests(teamId: string, procurement: ResolvedConnection, lowStock: LowStockItem[]) {
  if (!lowStock.length) return [];

  const since = new Date(Date.now() - REQUEST_HOLD_DAYS * 86_400_000);
  const recent = await prisma.agentAction.findMany({
    where: {
      teamId,
      type: 'AUTO_REORDER_SUGGESTION',
      status: 'EXECUTED',
      itemId: { in: lowStock.map((item) => item.id) },
      createdAt: { gte: since },
      output: { path: ['routedTo'], equals: 'procurement' },
    },
    select: { itemId: true },
  });
  const held = new Set(recent.map((action) => action.itemId));
  const due = lowStock.filter((item) => !held.has(item.id)).sort((a, b) => a.sku.localeCompare(b.sku));
  if (!due.length) return [];

  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { name: true } });
  const day = new Date().toISOString().slice(0, 10);
  const reference = `inventory:reorder:${day}:${crypto.createHash('sha1').update(due.map((item) => item.sku).join('|')).digest('hex').slice(0, 10)}`;
  const quantityFor = (item: LowStockItem) =>
    item.reorderQty > 0 ? item.reorderQty : Math.max(1, item.reorderPoint * 2 - item.totalOnHand);

  await enqueue({
    teamId,
    target: 'PROCUREMENT',
    kind: 'requisition.raise',
    reference,
    payload: {
      call: {
        method: 'POST',
        path: '/requisitions',
        body: {
          title: (due.length === 1 ? `Restock ${due[0]!.name}` : `Restock ${due.length} items for ${team.name}`).slice(0, 200),
          justification: [
            `Raised automatically by Humlens Inventory because stock is low:`,
            ...due.map((item) => `• ${item.name} (${item.sku}): ${item.totalOnHand} on hand, reorder at ${item.reorderPoint}`),
          ]
            .join('\n')
            .slice(0, 2000),
          externalReference: reference,
          submit: Boolean(procurement.options.submitForApproval),
          lines: due.map((item) => ({
            sku: item.sku,
            description: `${item.name} (${item.sku})`.slice(0, 500),
            quantity: quantityFor(item),
            unit: 'unit',
            estimatedPrice: Number(item.costPrice) || 0,
          })),
        },
      },
    },
  });

  return Promise.all(
    due.map((item) =>
      logAgentAction({
        teamId,
        type: 'AUTO_REORDER_SUGGESTION',
        status: 'EXECUTED',
        agent: 'procurement-reorder',
        title: `Requested ${quantityFor(item)} × ${item.name} (${item.sku}) in Procurement`,
        evidence: [
          { label: 'On hand', value: item.totalOnHand },
          { label: 'Reorder point', value: item.reorderPoint },
        ],
        itemId: item.id,
        input: { onHand: item.totalOnHand, reorderPoint: item.reorderPoint, reorderQty: quantityFor(item) },
        output: { routedTo: 'procurement', reference },
        reasoning: `${item.name} (${item.sku}) is at ${item.totalOnHand} units, at or below its reorder point of ${item.reorderPoint}. Requested ${quantityFor(item)} units in Humlens Procurement${
          procurement.options.submitForApproval ? ' and submitted it for approval' : ' as a draft'
        } (${reference}).`,
        confidence: 0.9,
      })
    )
  );
}
