import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export type CostLineResult = {
  sku: string;
  status: 'updated' | 'duplicate' | 'unknown_sku';
  previousCost?: number;
  newCost?: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

// Updates item costs from what was actually paid (e.g. an approved, matched
// supplier invoice) as a moving average: the units just bought at `unitCost`
// blended with the rest of the stock on hand at the current cost. Called
// after the goods are received, so on-hand already includes them. Each
// (reference, item) is applied once, so resending an invoice changes nothing.
export async function applyCostUpdates(params: {
  teamId: string;
  reference: string;
  lines: { sku: string; quantity: number; unitCost: number }[];
}) {
  const results: CostLineResult[] = [];
  for (const line of params.lines) {
    const item = await prisma.item.findUnique({
      where: { teamId_sku: { teamId: params.teamId, sku: line.sku } },
      select: { id: true, costPrice: true, stockLevels: { select: { onHand: true } } },
    });
    if (!item) {
      results.push({ sku: line.sku, status: 'unknown_sku' });
      continue;
    }
    const done = await prisma.costUpdate.findUnique({
      where: { teamId_reference_itemId: { teamId: params.teamId, reference: params.reference, itemId: item.id } },
    });
    if (done) {
      results.push({ sku: line.sku, status: 'duplicate', previousCost: Number(done.previousCost), newCost: Number(done.newCost) });
      continue;
    }

    const previousCost = Number(item.costPrice);
    const onHand = item.stockLevels.reduce((sum, level) => sum + level.onHand, 0);
    const earlierUnits = Math.max(0, onHand - line.quantity);
    // Nothing else on hand (or no cost recorded yet): the new price is the cost.
    const newCost =
      earlierUnits === 0 || previousCost === 0
        ? round2(line.unitCost)
        : round2((earlierUnits * previousCost + line.quantity * line.unitCost) / (earlierUnits + line.quantity));

    try {
      await prisma.$transaction([
        prisma.costUpdate.create({
          data: {
            teamId: params.teamId,
            itemId: item.id,
            reference: params.reference,
            quantity: line.quantity,
            unitCost: new Prisma.Decimal(line.unitCost),
            previousCost: new Prisma.Decimal(previousCost),
            newCost: new Prisma.Decimal(newCost),
          },
        }),
        prisma.item.update({ where: { id: item.id }, data: { costPrice: new Prisma.Decimal(newCost) } }),
      ]);
      results.push({ sku: line.sku, status: 'updated', previousCost, newCost });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        results.push({ sku: line.sku, status: 'duplicate' });
        continue;
      }
      throw error;
    }
  }
  return { results };
}

export const listCostUpdates = (teamId: string, itemId: string) =>
  prisma.costUpdate.findMany({ where: { teamId, itemId }, orderBy: { createdAt: 'desc' }, take: 20 });
