import { prisma } from '@/lib/prisma';
import { AdjustmentReason } from '@prisma/client';
import { applyStockMovement } from './stock';

export const listStockAdjustments = async (teamId: string) => {
  return prisma.stockAdjustment.findMany({
    where: { teamId },
    include: {
      item: { select: { id: true, sku: true, name: true } },
      warehouse: { select: { name: true } },
      performedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const createStockAdjustment = async (params: {
  teamId: string;
  itemId: string;
  warehouseId: string;
  quantityDelta: number;
  reason: AdjustmentReason;
  note?: string;
  performedById: string;
}) => {
  const adjustment = await prisma.stockAdjustment.create({ data: params });

  await applyStockMovement({
    teamId: params.teamId,
    itemId: params.itemId,
    warehouseId: params.warehouseId,
    type: params.quantityDelta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
    quantity: Math.abs(params.quantityDelta),
    reference: params.reason,
    note: params.note,
    performedById: params.performedById,
  });

  return adjustment;
};
