import { POStatus } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { cancelPurchaseOrder, createPurchaseOrder } from 'models/purchaseOrder';
import { defineAction } from './types';

const input = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  currency: z.string().min(3).max(3).default('USD'),
  notes: z.string().max(1000).optional(),
  lineItems: z
    .array(
      z.object({
        itemId: z.string().min(1),
        description: z.string().min(1).max(500),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
});

type Input = z.infer<typeof input>;
type Result = { purchaseOrderId: string; poNumber: string };

const total = (params: Input) => params.lineItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

export const draftPurchaseOrder = defineAction<Input, Result>({
  name: 'purchaseOrder.draft',
  label: 'Draft a purchase order',
  resource: 'purchase_order',
  permission: 'create',
  input,
  async describe(teamId, params) {
    const supplier = await prisma.supplier.findFirst({ where: { id: params.supplierId, teamId }, select: { name: true } });
    const [first, ...rest] = params.lineItems;
    const lines = rest.length ? `${params.lineItems.length} lines` : `${first!.quantity} × ${first!.description.replace(/ — auto-reorder$/, '')}`;
    return `Draft a PO for ${lines} from ${supplier?.name ?? 'a supplier'} (${params.currency} ${total(params).toFixed(2)})`;
  },
  async apply(ctx, params) {
    const [supplier, warehouse] = await Promise.all([
      prisma.supplier.findFirst({ where: { id: params.supplierId, teamId: ctx.teamId }, select: { id: true } }),
      prisma.warehouse.findFirst({ where: { id: params.warehouseId, teamId: ctx.teamId }, select: { id: true } }),
    ]);
    if (!supplier) throw new ApiError(404, 'That supplier is not in this team.');
    if (!warehouse) throw new ApiError(404, 'That warehouse is not in this team.');

    const po = await createPurchaseOrder({
      teamId: ctx.teamId,
      createdById: ctx.userId,
      supplierId: params.supplierId,
      warehouseId: params.warehouseId,
      currency: params.currency,
      notes: params.notes,
      tax: 0,
      shipping: 0,
      lineItems: params.lineItems,
    });
    return { purchaseOrderId: po.id, poNumber: po.poNumber };
  },
  // Cancelling is only safe while the PO is still a draft; once someone has
  // approved or issued it, it has to be handled on the PO itself.
  async revert(ctx, result) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: result.purchaseOrderId, teamId: ctx.teamId },
      select: { status: true, poNumber: true },
    });
    if (!po) throw new ApiError(404, 'That purchase order no longer exists.');
    const stillDraft: POStatus[] = [POStatus.DRAFT, POStatus.PENDING_APPROVAL];
    if (!stillDraft.includes(po.status)) {
      throw new ApiError(409, `${po.poNumber} has already been ${po.status.toLowerCase().replaceAll('_', ' ')}; cancel it from the purchase order instead.`);
    }
    await cancelPurchaseOrder(ctx.teamId, result.purchaseOrderId);
  },
  editable: (params) =>
    params.lineItems.map((line, index) => ({
      key: `line${index}`,
      label: params.lineItems.length === 1 ? 'Quantity' : `Quantity: ${line.description}`,
      value: line.quantity,
      min: 1,
    })),
  withEdits: (params, values) => ({
    ...params,
    lineItems: params.lineItems.map((line, index) => ({ ...line, quantity: values[`line${index}`] ?? line.quantity })),
  }),
  link: (_params, result) => (result ? `purchase-orders/${result.purchaseOrderId}` : 'purchase-orders'),
});
