import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { applyStockMovement } from 'models/stock';
import { defineAction } from './types';

const movementTypes = ['RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const;
type MovementType = (typeof movementTypes)[number];

const verbs: Record<MovementType, [string, string]> = {
  RECEIPT: ['Receive', 'into'],
  ISSUE: ['Issue', 'from'],
  ADJUSTMENT_IN: ['Add', 'to'],
  ADJUSTMENT_OUT: ['Remove', 'from'],
};

const input = z.object({
  itemId: z.string().min(1),
  warehouseId: z.string().min(1),
  type: z.enum(movementTypes),
  quantity: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

type Input = z.infer<typeof input>;
type Result = { transactionId: string };

async function names(teamId: string, params: Input) {
  const [item, warehouse] = await Promise.all([
    prisma.item.findFirst({ where: { id: params.itemId, teamId }, select: { name: true, sku: true } }),
    prisma.warehouse.findFirst({ where: { id: params.warehouseId, teamId }, select: { name: true } }),
  ]);
  if (!item) throw new ApiError(404, 'That item is not in this team.');
  if (!warehouse) throw new ApiError(404, 'That warehouse is not in this team.');
  return { item, warehouse };
}

export const moveStock = defineAction<Input, Result>({
  name: 'stock.move',
  label: 'Move stock',
  resource: 'stock_transaction',
  permission: 'create',
  input,
  async describe(teamId, params) {
    const { item, warehouse } = await names(teamId, params);
    const [verb, preposition] = verbs[params.type];
    return `${verb} ${params.quantity} × ${item.name} (${item.sku}) ${preposition} ${warehouse.name}`;
  },
  async apply(ctx, params) {
    await names(ctx.teamId, params);
    const { transaction } = await applyStockMovement({
      teamId: ctx.teamId,
      itemId: params.itemId,
      warehouseId: params.warehouseId,
      type: params.type,
      quantity: params.quantity,
      note: params.note,
      reference: ctx.agentActionId ? `agent-action:${ctx.agentActionId}` : undefined,
      performedById: ctx.userId,
    });
    return { transactionId: transaction.id };
  },
  // A correcting movement the other way, so the ledger keeps the full story.
  async revert(ctx, _result, params) {
    const inbound = params.type === 'RECEIPT' || params.type === 'ADJUSTMENT_IN';
    await applyStockMovement({
      teamId: ctx.teamId,
      itemId: params.itemId,
      warehouseId: params.warehouseId,
      type: inbound ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
      quantity: params.quantity,
      note: `Undo${params.note ? `: ${params.note}` : ''}`,
      reference: ctx.agentActionId ? `undo:agent-action:${ctx.agentActionId}` : undefined,
      performedById: ctx.userId,
    });
  },
  editable: (params) => [{ key: 'quantity', label: 'Quantity', value: params.quantity, min: 1 }],
  withEdits: (params, values) => ({ ...params, quantity: values.quantity ?? params.quantity }),
  link: () => 'stock-levels',
});
