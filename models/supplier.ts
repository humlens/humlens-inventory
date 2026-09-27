import { prisma } from '@/lib/prisma';
import { SupplierStatus } from '@prisma/client';

export const listSuppliers = async (teamId: string, params?: { status?: SupplierStatus }) => {
  return prisma.supplier.findMany({
    where: { teamId, status: params?.status },
    include: { _count: { select: { purchaseOrders: true } } },
    orderBy: { name: 'asc' },
  });
};

export const getSupplier = async (teamId: string, id: string) => {
  return prisma.supplier.findFirstOrThrow({
    where: { id, teamId },
    include: { purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
};

export const createSupplier = async (params: {
  teamId: string;
  createdById: string;
  name: string;
  email?: string;
  phone?: string;
  leadTimeDays?: number;
  notes?: string;
}) => {
  return prisma.supplier.create({ data: params });
};

export const setSupplierStatus = async (teamId: string, id: string, status: SupplierStatus) => {
  await prisma.supplier.findFirstOrThrow({ where: { id, teamId } });
  return prisma.supplier.update({ where: { id }, data: { status } });
};
