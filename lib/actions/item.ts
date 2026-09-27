import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { defineAction } from './types';

const input = z.object({
  itemId: z.string().min(1),
  reorderPoint: z.number().int().min(0),
  reorderQty: z.number().int().min(0),
});

type Input = z.infer<typeof input>;
type Result = { previous: { reorderPoint: number; reorderQty: number } };

async function findItem(teamId: string, itemId: string) {
  const item = await prisma.item.findFirst({
    where: { id: itemId, teamId },
    select: { id: true, name: true, sku: true, reorderPoint: true, reorderQty: true },
  });
  if (!item) throw new ApiError(404, 'That item is not in this team.');
  return item;
}

export const setReorderLevels = defineAction<Input, Result>({
  name: 'item.setReorderLevels',
  label: 'Set reorder levels',
  resource: 'item',
  permission: 'update',
  input,
  async describe(teamId, params) {
    const item = await findItem(teamId, params.itemId);
    return `Reorder ${item.name} (${item.sku}) at ${params.reorderPoint} units, ${params.reorderQty} at a time`;
  },
  async apply(ctx, params) {
    const item = await findItem(ctx.teamId, params.itemId);
    await prisma.item.update({
      where: { id: item.id },
      data: { reorderPoint: params.reorderPoint, reorderQty: params.reorderQty },
    });
    return { previous: { reorderPoint: item.reorderPoint, reorderQty: item.reorderQty } };
  },
  // Only undoes when nobody has changed the levels since, so it never
  // overwrites a later decision.
  async revert(ctx, result, params) {
    const item = await findItem(ctx.teamId, params.itemId);
    if (item.reorderPoint !== params.reorderPoint || item.reorderQty !== params.reorderQty) {
      throw new ApiError(409, `${item.name}'s reorder levels have changed since, so they weren't put back.`);
    }
    await prisma.item.update({ where: { id: item.id }, data: result.previous });
  },
  editable: (params) => [
    { key: 'reorderPoint', label: 'Reorder at', value: params.reorderPoint, min: 0 },
    { key: 'reorderQty', label: 'Order quantity', value: params.reorderQty, min: 0 },
  ],
  withEdits: (params, values) => ({
    ...params,
    reorderPoint: values.reorderPoint ?? params.reorderPoint,
    reorderQty: values.reorderQty ?? params.reorderQty,
  }),
  link: (params) => `items/${params.itemId}`,
});
