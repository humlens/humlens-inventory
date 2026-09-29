import { prisma } from '@/lib/prisma';
import { assertTeamRefs } from '@/lib/teamRefs';

export const listCategories = async (teamId: string) => {
  return prisma.category.findMany({ where: { teamId }, orderBy: { name: 'asc' } });
};

export const createCategory = async (params: { teamId: string; name: string; parentId?: string }) => {
  await assertTeamRefs(params.teamId, { category: params.parentId });
  return prisma.category.create({ data: params });
};
