import { prisma } from '@/lib/prisma';

export const listCategories = async (teamId: string) => {
  return prisma.category.findMany({ where: { teamId }, orderBy: { name: 'asc' } });
};

export const createCategory = async (params: { teamId: string; name: string; parentId?: string }) => {
  return prisma.category.create({ data: params });
};
