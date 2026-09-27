import { StockTransactionType } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { applyStockMovement } from 'models/stock';
import { endReservation } from 'models/reservation';
import { getConnection } from '@/lib/connections';

// What /api/v1 offers to connected systems such as a Humlens Commerce store:
// stock by SKU, stock movements keyed by an external reference (so retries
// are safe), and creating items for SKUs the store sells.

export const getTeamSummary = async (teamId: string) => {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
  const warehouses = await prisma.warehouse.findMany({
    where: { teamId },
    select: { id: true, name: true, code: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  const procurement = await getConnection(teamId, 'PROCUREMENT');
  return {
    name: team.name,
    slug: team.slug,
    currency: team.currency,
    warehouses,
    // Lets a connected store adapt: hold stock at checkout, and leave
    // low-stock purchase requests to Inventory when it sends them to Procurement.
    features: { reservations: true },
    purchasing: procurement?.options.routeReorders ? 'procurement' : 'inventory',
  };
};

export const resolveWarehouse = async (teamId: string, warehouseId?: string) => {
  const warehouse = warehouseId
    ? await prisma.warehouse.findFirst({ where: { id: warehouseId, teamId } })
    : await prisma.warehouse.findFirst({ where: { teamId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  if (!warehouse) throw new ApiError(warehouseId ? 404 : 400, warehouseId ? 'Warehouse not found.' : 'Create a warehouse first.');
  return warehouse;
};

// Stock per SKU, summed over all warehouses or one. With `since`, only items
// whose stock or details changed after it — use the returned `syncedAt` as
// the next `since`.
export const listStockForSync = async (teamId: string, params: { since?: Date; warehouseId?: string; skus?: string[] }) => {
  const syncedAt = new Date();
  const items = await prisma.item.findMany({
    where: {
      teamId,
      ...(params.skus?.length ? { sku: { in: params.skus } } : {}),
      ...(params.since
        ? { OR: [{ updatedAt: { gt: params.since } }, { stockLevels: { some: { updatedAt: { gt: params.since } } } }] }
        : {}),
    },
    select: {
      sku: true,
      name: true,
      isActive: true,
      reorderPoint: true,
      reorderQty: true,
      costPrice: true,
      stockLevels: { where: params.warehouseId ? { warehouseId: params.warehouseId } : {}, select: { onHand: true, reserved: true } },
    },
    orderBy: { sku: 'asc' },
  });

  return {
    syncedAt: syncedAt.toISOString(),
    data: items.map(({ stockLevels, costPrice, ...item }) => {
      const onHand = stockLevels.reduce((sum, level) => sum + level.onHand, 0);
      const reserved = stockLevels.reduce((sum, level) => sum + level.reserved, 0);
      return { ...item, costPrice: Number(costPrice), onHand, reserved, available: Math.max(0, onHand - reserved) };
    }),
  };
};

export type MovementLineResult = {
  sku: string;
  status: 'applied' | 'duplicate' | 'unknown_sku' | 'rejected';
  message?: string;
  onHand?: number;
};

// Records `issue` (goods out, e.g. a sale) or `receipt` (goods in, e.g. a
// return or a delivery). A line whose (reference, SKU, type) was already
// recorded is skipped, so the caller can retry freely. An issue can name the
// checkout `reservation` it fulfils: its held units are released as they're
// taken off hand.
export const recordStockMovements = async (params: {
  teamId: string;
  actorId: string;
  type: 'issue' | 'receipt';
  reference: string;
  note?: string;
  warehouseId?: string;
  lines: { sku: string; quantity: number }[];
  reservation?: string;
}) => {
  const warehouse = await resolveWarehouse(params.teamId, params.warehouseId);
  if (params.type === 'issue' && params.reservation) await endReservation(params.teamId, params.reservation, 'CONSUMED');
  const type = params.type === 'issue' ? StockTransactionType.ISSUE : StockTransactionType.RECEIPT;
  const results: MovementLineResult[] = [];

  for (const line of params.lines) {
    const item = await prisma.item.findUnique({ where: { teamId_sku: { teamId: params.teamId, sku: line.sku } } });
    if (!item) {
      results.push({ sku: line.sku, status: 'unknown_sku', message: `No item with SKU ${line.sku}.` });
      continue;
    }
    const existing = await prisma.stockTransaction.findFirst({
      where: { teamId: params.teamId, itemId: item.id, type, reference: params.reference },
    });
    if (existing) {
      results.push({ sku: line.sku, status: 'duplicate' });
      continue;
    }
    try {
      const { level } = await applyStockMovement({
        teamId: params.teamId,
        itemId: item.id,
        warehouseId: warehouse.id,
        type,
        quantity: line.quantity,
        reference: params.reference,
        note: params.note,
        performedById: params.actorId,
      });
      results.push({ sku: line.sku, status: 'applied', onHand: level.onHand });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      results.push({ sku: line.sku, status: 'rejected', message: error.message });
    }
  }

  return { warehouse: { id: warehouse.id, name: warehouse.name }, results };
};

// Creates items for SKUs that don't exist yet. Existing items are left as
// they are: this app owns item details once they're here.
export const createMissingItems = async (params: {
  teamId: string;
  actorId: string;
  items: { sku: string; name: string; description?: string; sellPrice?: number }[];
}) => {
  const existing = await prisma.item.findMany({
    where: { teamId: params.teamId, sku: { in: params.items.map((item) => item.sku) } },
    select: { sku: true },
  });
  const known = new Set(existing.map((item) => item.sku));
  const toCreate = params.items.filter((item, index, all) => !known.has(item.sku) && all.findIndex((other) => other.sku === item.sku) === index);

  await prisma.item.createMany({
    data: toCreate.map((item) => ({
      teamId: params.teamId,
      createdById: params.actorId,
      sku: item.sku,
      name: item.name,
      description: item.description,
      sellPrice: item.sellPrice ?? 0,
    })),
    skipDuplicates: true,
  });

  return { created: toCreate.map((item) => item.sku), existing: [...known] };
};
