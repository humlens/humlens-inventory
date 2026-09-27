import { prisma } from '@/lib/prisma';
import { POStatus } from '@prisma/client';
import { ApiError } from '@/lib/errors';

export const listPurchaseOrders = async (teamId: string, params?: { status?: POStatus }) => {
  return prisma.purchaseOrder.findMany({
    where: { teamId, status: params?.status },
    include: { supplier: true, warehouse: true, _count: { select: { lineItems: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const getPurchaseOrder = async (teamId: string, id: string) => {
  return prisma.purchaseOrder.findFirstOrThrow({
    where: { id, teamId },
    include: {
      supplier: true,
      warehouse: true,
      createdBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      lineItems: { include: { item: { select: { id: true, sku: true, name: true } } } },
      goodsReceipts: { include: { lineItems: true }, orderBy: { receivedAt: 'desc' } },
    },
  });
};

const nextPoNumber = async (teamId: string) => {
  const count = await prisma.purchaseOrder.count({ where: { teamId } });
  return `PO-${String(count + 1).padStart(5, '0')}`;
};

export const createPurchaseOrder = async (params: {
  teamId: string;
  createdById: string;
  supplierId: string;
  warehouseId: string;
  currency: string;
  expectedDate?: Date;
  notes?: string;
  tax: number;
  shipping: number;
  lineItems: { itemId: string; description: string; quantity: number; unitPrice: number }[];
}) => {
  const subtotal = params.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const totalAmount = subtotal + params.tax + params.shipping;
  const poNumber = await nextPoNumber(params.teamId);

  return prisma.purchaseOrder.create({
    data: {
      teamId: params.teamId,
      poNumber,
      createdById: params.createdById,
      supplierId: params.supplierId,
      warehouseId: params.warehouseId,
      currency: params.currency,
      expectedDate: params.expectedDate,
      notes: params.notes,
      subtotal,
      tax: params.tax,
      shipping: params.shipping,
      totalAmount,
      lineItems: { create: params.lineItems },
    },
    include: { lineItems: true },
  });
};

export const approvePurchaseOrder = async (teamId: string, id: string, approvedById: string) => {
  const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { id, teamId } });

  if (po.status !== POStatus.DRAFT && po.status !== POStatus.PENDING_APPROVAL) {
    throw new ApiError(400, 'Only draft or pending purchase orders can be approved.');
  }

  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: POStatus.APPROVED, approvedById, approvedAt: new Date() },
  });
};

export const issuePurchaseOrder = async (teamId: string, id: string) => {
  const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { id, teamId } });

  if (po.status !== POStatus.APPROVED) {
    throw new ApiError(400, 'Only approved purchase orders can be issued.');
  }

  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: POStatus.ISSUED, issuedAt: new Date() },
  });
};

export const cancelPurchaseOrder = async (teamId: string, id: string) => {
  const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { id, teamId } });

  const closedStatuses: POStatus[] = [POStatus.CLOSED, POStatus.CANCELLED];
  if (closedStatuses.includes(po.status)) {
    throw new ApiError(400, 'This purchase order is already closed.');
  }

  return prisma.purchaseOrder.update({ where: { id }, data: { status: POStatus.CANCELLED } });
};
