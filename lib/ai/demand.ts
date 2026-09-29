import { prisma } from '@/lib/prisma';

// How fast items sell and how long the stock will last. The assistant uses it
// to answer "what should I reorder?", the reorder agent to size orders, and
// MCP clients to plan, so all three work from the same numbers.

const OPEN_PO_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED'] as const;

export type DemandRow = {
  itemId: string;
  sku: string;
  name: string;
  onHand: number;
  /** Ordered on open purchase orders but not yet received. */
  onOrder: number;
  reorderPoint: number;
  reorderQty: number;
  costPrice: number;
  /** Units issued (sold or otherwise sent out) in the window. */
  sold: number;
  perDay: number;
  /** Days until on-hand stock runs out at the current rate; null when it isn't selling. */
  daysOfCover: number | null;
  belowReorderPoint: boolean;
  supplierId: string | null;
  supplier: string | null;
  leadTimeDays: number | null;
};

export async function getDemandSummary(
  teamId: string,
  params: { days?: number; itemIds?: string[]; search?: string; limit?: number } = {}
): Promise<{ days: number; items: DemandRow[] }> {
  const days = Math.min(365, Math.max(7, params.days ?? 30));
  const since = new Date(Date.now() - days * 86_400_000);
  const search = params.search?.trim();

  const items = await prisma.item.findMany({
    where: {
      teamId,
      isActive: true,
      id: params.itemIds ? { in: params.itemIds } : undefined,
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    },
    select: {
      id: true,
      sku: true,
      name: true,
      reorderPoint: true,
      reorderQty: true,
      costPrice: true,
      stockLevels: { select: { onHand: true } },
      preferredSupplier: { select: { id: true, name: true, leadTimeDays: true } },
    },
  });
  if (items.length === 0) return { days, items: [] };
  const ids = items.map((item) => item.id);

  const [issued, openLines] = await Promise.all([
    prisma.stockTransaction.groupBy({
      by: ['itemId'],
      where: { teamId, type: 'ISSUE', createdAt: { gte: since }, itemId: { in: ids } },
      _sum: { quantity: true },
    }),
    prisma.pOLineItem.findMany({
      where: { itemId: { in: ids }, purchaseOrder: { teamId, status: { in: [...OPEN_PO_STATUSES] } } },
      select: { itemId: true, quantity: true, receivedQty: true },
    }),
  ]);
  const soldBy = new Map(issued.map((row) => [row.itemId, row._sum.quantity ?? 0]));
  const onOrderBy = new Map<string, number>();
  for (const line of openLines) {
    onOrderBy.set(line.itemId, (onOrderBy.get(line.itemId) ?? 0) + Math.max(0, line.quantity - line.receivedQty));
  }

  const rows = items.map((item): DemandRow => {
    const onHand = item.stockLevels.reduce((sum, level) => sum + level.onHand, 0);
    const sold = soldBy.get(item.id) ?? 0;
    const perDay = sold / days;
    return {
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      onHand,
      onOrder: onOrderBy.get(item.id) ?? 0,
      reorderPoint: item.reorderPoint,
      reorderQty: item.reorderQty,
      costPrice: Number(item.costPrice),
      sold,
      perDay: Number(perDay.toFixed(2)),
      daysOfCover: perDay > 0 ? Math.floor(onHand / perDay) : null,
      belowReorderPoint: item.reorderPoint > 0 && onHand <= item.reorderPoint,
      supplierId: item.preferredSupplier?.id ?? null,
      supplier: item.preferredSupplier?.name ?? null,
      leadTimeDays: item.preferredSupplier?.leadTimeDays ?? null,
    };
  });

  // Soonest to run out first; items that aren't selling go last.
  rows.sort((a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity) || b.sold - a.sold);
  return { days, items: rows.slice(0, Math.min(200, params.limit ?? 50)) };
}
