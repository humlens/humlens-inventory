import { prisma } from '@/lib/prisma';
import { proposeAction } from 'models/agentAction';

// Suggests reorder points and quantities from how fast each item actually
// sells (units issued — sales and other goods out — over the last 90 days)
// and how long its supplier takes to deliver. Suggestions wait on the AI
// agent activity page: approving one updates the item (see
// models/agentAction.ts#reviewAgentAction).

const WINDOW_DAYS = 90;
const MIN_HISTORY_DAYS = 14;
const MIN_ISSUES = 3;
const DEFAULT_LEAD_TIME_DAYS = 7;
const COVER_DAYS = 30; // each order covers about a month of demand
const SERVICE_Z = 1.65; // ~95% chance of not running out while waiting for a delivery

export type ReorderSuggestion = { reorderPoint: number; reorderQty: number };

export function suggestReorderLevels(dailyUnits: number[], leadTimeDays: number): ReorderSuggestion & { avgDaily: number; sdDaily: number } {
  const days = dailyUnits.length;
  const avgDaily = dailyUnits.reduce((sum, units) => sum + units, 0) / days;
  const variance = dailyUnits.reduce((sum, units) => sum + (units - avgDaily) ** 2, 0) / Math.max(1, days - 1);
  const sdDaily = Math.sqrt(variance);
  const safetyStock = SERVICE_Z * sdDaily * Math.sqrt(leadTimeDays);
  return {
    avgDaily,
    sdDaily,
    reorderPoint: Math.max(1, Math.ceil(avgDaily * leadTimeDays + safetyStock)),
    reorderQty: Math.max(1, Math.ceil(avgDaily * COVER_DAYS)),
  };
}

const worthChanging = (current: number, suggested: number) =>
  Math.abs(suggested - current) >= Math.max(2, Math.ceil(current * 0.2));

export async function runReorderTuningAgent(teamId: string) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  const [items, pending] = await Promise.all([
    prisma.item.findMany({
      where: { teamId, isActive: true },
      select: {
        id: true,
        sku: true,
        name: true,
        reorderPoint: true,
        reorderQty: true,
        createdAt: true,
        preferredSupplier: { select: { name: true, leadTimeDays: true } },
      },
    }),
    prisma.agentAction.findMany({
      where: { teamId, type: 'REORDER_POINT_SUGGESTION', status: { in: ['PROPOSED', 'FAILED'] }, reviewedAt: null },
      select: { itemId: true },
    }),
  ]);
  const awaitingReview = new Set(pending.map((action) => action.itemId));

  const issues = await prisma.stockTransaction.findMany({
    where: { teamId, type: 'ISSUE', createdAt: { gte: windowStart } },
    select: { itemId: true, quantity: true, createdAt: true },
  });
  const byItem = new Map<string, { quantity: number; createdAt: Date }[]>();
  for (const issue of issues) byItem.set(issue.itemId, [...(byItem.get(issue.itemId) ?? []), issue]);

  const actions = [];
  for (const item of items) {
    if (awaitingReview.has(item.id)) continue;
    const history = byItem.get(item.id) ?? [];
    // Only the days the item has existed count, so new items aren't diluted.
    const start = item.createdAt > windowStart ? item.createdAt : windowStart;
    const days = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;
    if (history.length < MIN_ISSUES || days < MIN_HISTORY_DAYS) continue;

    const daily = new Array<number>(days).fill(0);
    for (const issue of history) {
      const index = Math.min(days - 1, Math.floor((issue.createdAt.getTime() - start.getTime()) / 86_400_000));
      daily[Math.max(0, index)]! += issue.quantity;
    }
    const leadTimeDays = item.preferredSupplier?.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
    const suggestion = suggestReorderLevels(daily, leadTimeDays);
    if (!worthChanging(item.reorderPoint, suggestion.reorderPoint) && !worthChanging(item.reorderQty, suggestion.reorderQty)) continue;

    const units = history.reduce((sum, issue) => sum + issue.quantity, 0);
    actions.push(
      await proposeAction({
        teamId,
        type: 'REORDER_POINT_SUGGESTION',
        agent: 'reorder-tuning',
        tool: 'item.setReorderLevels',
        args: { itemId: item.id, reorderPoint: suggestion.reorderPoint, reorderQty: suggestion.reorderQty },
        itemId: item.id,
        evidence: [
          { label: 'Sold', value: `${units} in ${days} days` },
          { label: 'Per day', value: Number(suggestion.avgDaily.toFixed(1)) },
          { label: 'Lead time', value: `${leadTimeDays} days` },
          { label: 'Now', value: `reorder at ${item.reorderPoint}, order ${item.reorderQty}` },
        ],
        reasoning: `${item.name} (${item.sku}) sold ${units} units in the last ${days} days (about ${suggestion.avgDaily.toFixed(1)} a day). With a ${leadTimeDays}-day lead time${
          item.preferredSupplier ? ` from ${item.preferredSupplier.name}` : ' (default — set a preferred supplier for its real lead time)'
        }, reorder at ${suggestion.reorderPoint} (now ${item.reorderPoint}) and order ${suggestion.reorderQty} at a time (now ${item.reorderQty}) — enough for about ${COVER_DAYS} days, with a safety margin for busy weeks. Approve to apply.`,
        confidence: Math.min(0.95, 0.5 + history.length / 60),
      })
    );
  }
  return actions;
}
