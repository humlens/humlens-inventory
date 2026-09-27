import { prisma } from '@/lib/prisma';

export const listWarehouses = async (teamId: string) => {
  return prisma.warehouse.findMany({ where: { teamId }, orderBy: { name: 'asc' } });
};

export const getWarehouse = async (teamId: string, id: string) => {
  return prisma.warehouse.findFirstOrThrow({ where: { id, teamId } });
};

export const createWarehouse = async (params: {
  teamId: string;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  isDefault: boolean;
}) => {
  if (params.isDefault) {
    await prisma.warehouse.updateMany({ where: { teamId: params.teamId }, data: { isDefault: false } });
  }
  return prisma.warehouse.create({ data: params });
};
