import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { applyStockMovement } from './stock';
import { assertTeamRefs } from '@/lib/teamRefs';

export const listCycleCounts = async (teamId: string) => {
  return prisma.cycleCount.findMany({
    where: { teamId },
    include: { warehouse: true, _count: { select: { lines: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const getCycleCount = async (teamId: string, id: string) => {
  return prisma.cycleCount.findFirstOrThrow({
    where: { id, teamId },
    include: {
      warehouse: true,
      lines: { include: { item: { select: { id: true, sku: true, name: true } } } },
    },
  });
};

// Snapshots each item's current on-hand at the warehouse as `expectedQty` —
// the count is a blind count against that snapshot, not a live comparison,
// so counters can't see the "answer" while they count.
export const createCycleCount = async (params: {
  teamId: string;
  warehouseId: string;
  name: string;
  itemIds: string[];
  createdById: string;
}) => {
  await assertTeamRefs(params.teamId, { warehouse: params.warehouseId, item: params.itemIds });
  const levels = await prisma.stockLevel.findMany({
    where: { teamId: params.teamId, warehouseId: params.warehouseId, itemId: { in: params.itemIds } },
  });
  const onHandByItem = new Map(levels.map((l) => [l.itemId, l.onHand]));

  return prisma.cycleCount.create({
    data: {
      teamId: params.teamId,
      warehouseId: params.warehouseId,
      name: params.name,
      createdById: params.createdById,
      lines: {
        create: params.itemIds.map((itemId) => ({
          itemId,
          expectedQty: onHandByItem.get(itemId) ?? 0,
        })),
      },
    },
    include: { lines: true },
  });
};

export const startCycleCount = async (teamId: string, id: string) => {
  const cycleCount = await prisma.cycleCount.findFirstOrThrow({ where: { id, teamId } });
  if (cycleCount.status !== 'PLANNED') {
    throw new ApiError(400, 'Only planned cycle counts can be started.');
  }
  return prisma.cycleCount.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
};

// Records counted quantities, computes variance per line, and — for every
// line with a nonzero variance — reconciles stock to the counted quantity
// via a CYCLE_COUNT stock adjustment (through applyStockMovement, same as
// any other movement) so the ledger explains exactly why the balance moved.
export const submitCycleCountLines = async (
  teamId: string,
  id: string,
  lines: { lineId: string; countedQty: number }[],
  performedById: string
) => {
  const cycleCount = await prisma.cycleCount.findFirstOrThrow({
    where: { id, teamId },
    include: { lines: true },
  });

  for (const input of lines) {
    const line = cycleCount.lines.find((l) => l.id === input.lineId);
    if (!line) continue;

    const variance = input.countedQty - line.expectedQty;

    await prisma.cycleCountLine.update({
      where: { id: input.lineId },
      data: { countedQty: input.countedQty, varianceQty: variance },
    });

    if (variance !== 0) {
      await prisma.stockAdjustment.create({
        data: {
          teamId,
          itemId: line.itemId,
          warehouseId: cycleCount.warehouseId,
          quantityDelta: variance,
          reason: 'CYCLE_COUNT',
          note: `Cycle count "${cycleCount.name}" variance`,
          performedById,
        },
      });

      await applyStockMovement({
        teamId,
        itemId: line.itemId,
        warehouseId: cycleCount.warehouseId,
        type: variance > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
        quantity: Math.abs(variance),
        reference: cycleCount.name,
        note: `Cycle count reconciliation`,
        performedById,
      });
    }
  }

  const allCounted = await prisma.cycleCountLine.findMany({ where: { cycleCountId: id } });
  const complete = allCounted.every((l) => l.countedQty !== null);

  return prisma.cycleCount.update({
    where: { id },
    data: complete ? { status: 'COMPLETED', completedAt: new Date() } : {},
    include: { lines: true },
  });
};
