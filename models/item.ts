import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { assertTeamRefs } from '@/lib/teamRefs';

export const listItems = async (teamId: string, params?: { search?: string; categoryId?: string; isActive?: boolean }) => {
  return prisma.item.findMany({
    where: {
      teamId,
      categoryId: params?.categoryId,
      isActive: params?.isActive,
      OR: params?.search
        ? [
            { name: { contains: params.search, mode: 'insensitive' } },
            { sku: { contains: params.search, mode: 'insensitive' } },
          ]
        : undefined,
    },
    include: { category: true, stockLevels: true },
    orderBy: { name: 'asc' },
  });
};

export const getItem = async (teamId: string, id: string) => {
  return prisma.item.findFirstOrThrow({
    where: { id, teamId },
    include: {
      category: true,
      preferredSupplier: true,
      stockLevels: { include: { warehouse: true } },
      stockTransactions: {
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { warehouse: { select: { name: true } }, performedBy: { select: { name: true } } },
      },
    },
  });
};

export const createItem = async (params: {
  teamId: string;
  createdById: string;
  sku: string;
  name: string;
  description?: string;
  categoryId?: string;
  unitOfMeasure: string;
  costPrice: number;
  sellPrice: number;
  barcode?: string;
  reorderPoint: number;
  reorderQty: number;
  preferredSupplierId?: string;
}) => {
  await assertTeamRefs(params.teamId, { category: params.categoryId, supplier: params.preferredSupplierId });
  return prisma.item.create({ data: params });
};

export const updateItem = async (teamId: string, id: string, data: Prisma.ItemUncheckedUpdateInput) => {
  await prisma.item.findFirstOrThrow({ where: { id, teamId } });
  await assertTeamRefs(teamId, {
    category: typeof data.categoryId === 'string' ? data.categoryId : undefined,
    supplier: typeof data.preferredSupplierId === 'string' ? data.preferredSupplierId : undefined,
  });
  return prisma.item.update({ where: { id }, data });
};

export const listLowStockItems = async (teamId: string) => {
  const items = await prisma.item.findMany({
    where: { teamId, isActive: true, reorderPoint: { gt: 0 } },
    include: { stockLevels: true, category: true, preferredSupplier: true },
  });

  return items
    .map((item) => ({ ...item, totalOnHand: item.stockLevels.reduce((sum, l) => sum + l.onHand, 0) }))
    .filter((item) => item.totalOnHand <= item.reorderPoint);
};
