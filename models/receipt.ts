import { prisma } from '@/lib/prisma';
import { POStatus, ReceiptStatus } from '@prisma/client';
import { applyStockMovement } from './stock';

export const listGoodsReceipts = async (teamId: string, poId?: string) => {
  return prisma.goodsReceipt.findMany({
    where: { teamId, poId },
    include: { purchaseOrder: { select: { id: true, poNumber: true } }, warehouse: true, lineItems: true },
    orderBy: { receivedAt: 'desc' },
  });
};

// Records a GRN against a PO's line items, moves stock in via
// applyStockMovement (RECEIPT), bumps each line's receivedQty, and rolls
// the PO status to PARTIALLY_RECEIVED or RECEIVED depending on whether
// every line is now fully received.
export const createGoodsReceipt = async (params: {
  teamId: string;
  poId: string;
  warehouseId: string;
  receivedById: string;
  notes?: string;
  lineItems: { poLineItemId: string; quantityReceived: number; condition?: string }[];
}) => {
  const po = await prisma.purchaseOrder.findFirstOrThrow({
    where: { id: params.poId, teamId: params.teamId },
    include: { lineItems: true },
  });

  const receipt = await prisma.goodsReceipt.create({
    data: {
      teamId: params.teamId,
      poId: params.poId,
      warehouseId: params.warehouseId,
      receivedById: params.receivedById,
      notes: params.notes,
      status: ReceiptStatus.COMPLETE,
      lineItems: { create: params.lineItems },
    },
    include: { lineItems: true },
  });

  for (const line of params.lineItems) {
    const poLine = po.lineItems.find((l) => l.id === line.poLineItemId);
    if (!poLine) continue;

    await applyStockMovement({
      teamId: params.teamId,
      itemId: poLine.itemId,
      warehouseId: params.warehouseId,
      type: 'RECEIPT',
      quantity: line.quantityReceived,
      reference: po.poNumber,
      note: `Received against ${po.poNumber}`,
      performedById: params.receivedById,
    });

    await prisma.pOLineItem.update({
      where: { id: line.poLineItemId },
      data: { receivedQty: { increment: line.quantityReceived } },
    });
  }

  const updatedLines = await prisma.pOLineItem.findMany({ where: { poId: params.poId } });
  const fullyReceived = updatedLines.every((l) => l.receivedQty >= l.quantity);
  const anyReceived = updatedLines.some((l) => l.receivedQty > 0);

  await prisma.purchaseOrder.update({
    where: { id: params.poId },
    data: {
      status: fullyReceived ? POStatus.RECEIVED : anyReceived ? POStatus.PARTIALLY_RECEIVED : po.status,
    },
  });

  return receipt;
};
