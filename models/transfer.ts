import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { applyStockMovement } from './stock';
import { assertTeamRefs } from '@/lib/teamRefs';

export const listStockTransfers = async (teamId: string) => {
  return prisma.stockTransfer.findMany({
    where: { teamId },
    include: {
      item: { select: { id: true, sku: true, name: true } },
      fromWarehouse: { select: { name: true } },
      toWarehouse: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

// Two-phase, matching physical reality: stock leaves the source warehouse
// immediately (so it can't be double-committed elsewhere) and the transfer
// sits IN_TRANSIT until completeStockTransfer confirms arrival and adds it
// back at the destination.
export const createStockTransfer = async (params: {
  teamId: string;
  itemId: string;
  quantity: number;
  fromWarehouseId: string;
  toWarehouseId: string;
  requestedById: string;
  note?: string;
}) => {
  await assertTeamRefs(params.teamId, { item: params.itemId, warehouse: [params.fromWarehouseId, params.toWarehouseId] });
  if (params.fromWarehouseId === params.toWarehouseId) {
    throw new ApiError(400, 'Source and destination warehouses must be different.');
  }

  return prisma.$transaction(async (tx) => {
    await applyStockMovement({
      teamId: params.teamId,
      itemId: params.itemId,
      warehouseId: params.fromWarehouseId,
      type: 'TRANSFER_OUT',
      quantity: params.quantity,
      note: params.note,
      performedById: params.requestedById,
    });

    return tx.stockTransfer.create({
      data: {
        teamId: params.teamId,
        itemId: params.itemId,
        quantity: params.quantity,
        fromWarehouseId: params.fromWarehouseId,
        toWarehouseId: params.toWarehouseId,
        requestedById: params.requestedById,
        note: params.note,
        status: 'IN_TRANSIT',
      },
    });
  });
};

export const completeStockTransfer = async (teamId: string, id: string, performedById: string) => {
  const transfer = await prisma.stockTransfer.findFirstOrThrow({ where: { id, teamId } });

  if (transfer.status !== 'IN_TRANSIT') {
    throw new ApiError(400, 'Only in-transit transfers can be completed.');
  }

  await applyStockMovement({
    teamId,
    itemId: transfer.itemId,
    warehouseId: transfer.toWarehouseId,
    type: 'TRANSFER_IN',
    quantity: transfer.quantity,
    note: transfer.note ?? undefined,
    performedById,
  });

  return prisma.stockTransfer.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
};

export const cancelStockTransfer = async (teamId: string, id: string, performedById: string) => {
  const transfer = await prisma.stockTransfer.findFirstOrThrow({ where: { id, teamId } });

  if (transfer.status !== 'IN_TRANSIT') {
    throw new ApiError(400, 'Only in-transit transfers can be cancelled.');
  }

  await applyStockMovement({
    teamId,
    itemId: transfer.itemId,
    warehouseId: transfer.fromWarehouseId,
    type: 'TRANSFER_IN',
    quantity: transfer.quantity,
    note: 'Transfer cancelled — returned to source warehouse',
    performedById,
  });

  return prisma.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED' } });
};
