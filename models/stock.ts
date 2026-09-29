import { prisma } from '@/lib/prisma';
import { StockTransactionType } from '@prisma/client';
import { ApiError } from '@/lib/errors';
import { notifyStore } from '@/lib/outbox';
import { assertTeamRefs } from '@/lib/teamRefs';

const OUTBOUND: StockTransactionType[] = ['ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'];
const INBOUND: StockTransactionType[] = ['RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN'];

// Every stock-affecting action in the app — receiving, issuing, transferring,
// adjusting — funnels through this single function so StockLevel.onHand and
// the StockTransaction ledger can never drift apart. Outbound movements are
// blocked once they'd take onHand negative.
export const applyStockMovement = async (params: {
  teamId: string;
  itemId: string;
  warehouseId: string;
  type: StockTransactionType;
  quantity: number;
  reference?: string;
  note?: string;
  performedById: string;
}) => {
  await assertTeamRefs(params.teamId, { item: params.itemId, warehouse: params.warehouseId });
  const { teamId, itemId, warehouseId, type, quantity, reference, note, performedById } = params;

  if (quantity <= 0) {
    throw new ApiError(400, 'Quantity must be positive.');
  }

  const delta = OUTBOUND.includes(type) ? -quantity : quantity;

  return prisma.$transaction(async (tx) => {
    const level = await tx.stockLevel.upsert({
      where: { itemId_warehouseId: { itemId, warehouseId } },
      create: { teamId, itemId, warehouseId, onHand: 0 },
      update: {},
    });

    if (OUTBOUND.includes(type) && level.onHand + delta < 0) {
      throw new ApiError(
        400,
        `Not enough stock on hand (${level.onHand}) to move ${quantity} units out of this warehouse.`
      );
    }

    const updated = await tx.stockLevel.update({
      where: { id: level.id },
      data: { onHand: { increment: delta } },
    });

    const transaction = await tx.stockTransaction.create({
      data: { teamId, itemId, warehouseId, type, quantity, reference, note, performedById },
    });

    return { level: updated, transaction };
  }).then(async (result) => {
    await notifyStockChanged(teamId, [itemId]);
    return result;
  });
};

// Lets a connected store refresh these items' stock straight away.
export async function notifyStockChanged(teamId: string, itemIds: string[]) {
  const items = await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { sku: true } });
  await notifyStore(teamId, 'stock.changed', { skus: items.map((item) => item.sku) }, { key: 'skus' }).catch((error) =>
    console.error('Could not queue store notification', error)
  );
}

export const listStockLevels = async (
  teamId: string,
  params?: { warehouseId?: string; itemId?: string; lowStockOnly?: boolean }
) => {
  const levels = await prisma.stockLevel.findMany({
    where: { teamId, warehouseId: params?.warehouseId, itemId: params?.itemId },
    include: { item: { include: { category: true } }, warehouse: true },
    orderBy: { item: { name: 'asc' } },
  });

  if (params?.lowStockOnly) {
    return levels.filter((l) => l.onHand <= l.item.reorderPoint);
  }

  return levels;
};

export const listStockTransactions = async (
  teamId: string,
  params?: { itemId?: string; warehouseId?: string; limit?: number }
) => {
  return prisma.stockTransaction.findMany({
    where: { teamId, itemId: params?.itemId, warehouseId: params?.warehouseId },
    include: {
      item: { select: { id: true, sku: true, name: true } },
      warehouse: { select: { id: true, name: true } },
      performedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: params?.limit ?? 200,
  });
};

export const getItemAvailability = async (teamId: string, itemId: string) => {
  const levels = await prisma.stockLevel.findMany({
    where: { teamId, itemId },
    include: { warehouse: true },
  });

  return {
    totalOnHand: levels.reduce((sum, l) => sum + l.onHand, 0),
    byWarehouse: levels,
  };
};
