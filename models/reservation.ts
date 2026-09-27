import type { Prisma, ReservationStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { notifyStore } from '@/lib/outbox';
import { resolveWarehouse } from 'models/storeSync';

// Stock held for a checkout that hasn't completed, so two shoppers can't both
// buy the last unit. A reservation holds units in StockLevel.reserved (not
// available to sell) until the sale is recorded (consumed), the checkout is
// abandoned or fails (released), or it runs out of time (expired).

export const DEFAULT_HOLD_MINUTES = 30;
export const MAX_HOLD_MINUTES = 24 * 60;

type ReservedLine = { itemId: string; sku: string; quantity: number };

export type ReserveLineResult = {
  sku: string;
  quantity: number;
  status: 'reserved' | 'insufficient' | 'unknown_sku';
  available?: number;
};

class Insufficient extends Error {}

const describe = (reservation: { reference: string; status: ReservationStatus; expiresAt: Date; lines: Prisma.JsonValue }) => ({
  reference: reservation.reference,
  status: reservation.status,
  expiresAt: reservation.expiresAt.toISOString(),
  lines: (reservation.lines as ReservedLine[]).map(({ sku, quantity }) => ({ sku, quantity })),
});

// Holds every line or none. Asking again with the same reference returns the
// existing reservation, so a retried checkout never holds stock twice.
export async function reserveStock(params: {
  teamId: string;
  reference: string;
  warehouseId?: string;
  holdMinutes?: number;
  lines: { sku: string; quantity: number }[];
}) {
  const existing = await prisma.reservation.findUnique({ where: { teamId_reference: { teamId: params.teamId, reference: params.reference } } });
  if (existing) return { ok: existing.status === 'ACTIVE' || existing.status === 'CONSUMED', reservation: describe(existing), results: [] };

  const warehouse = await resolveWarehouse(params.teamId, params.warehouseId);
  const quantities = new Map<string, number>();
  for (const line of params.lines) quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);

  const items = await prisma.item.findMany({
    where: { teamId: params.teamId, sku: { in: [...quantities.keys()] } },
    select: { id: true, sku: true, stockLevels: { where: { warehouseId: warehouse.id }, select: { onHand: true, reserved: true } } },
  });
  const bySku = new Map(items.map((item) => [item.sku, item]));

  const results: ReserveLineResult[] = [...quantities].map(([sku, quantity]) => {
    const item = bySku.get(sku);
    if (!item) return { sku, quantity, status: 'unknown_sku' };
    const level = item.stockLevels[0];
    const available = Math.max(0, (level?.onHand ?? 0) - (level?.reserved ?? 0));
    return { sku, quantity, status: available >= quantity ? 'reserved' : 'insufficient', available };
  });
  if (results.some((result) => result.status !== 'reserved')) return { ok: false, reservation: null, results };

  const holdMinutes = Math.min(Math.max(params.holdMinutes ?? DEFAULT_HOLD_MINUTES, 1), MAX_HOLD_MINUTES);
  const lines: ReservedLine[] = results.map((result) => ({ itemId: bySku.get(result.sku)!.id, sku: result.sku, quantity: result.quantity }));

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        // Only succeeds while enough unreserved stock is left — decided by the
        // database, so concurrent checkouts can't both take the last unit.
        const held = await tx.$executeRaw`
          UPDATE "StockLevel"
          SET "reserved" = "reserved" + ${line.quantity}, "updatedAt" = now()
          WHERE "itemId" = ${line.itemId} AND "warehouseId" = ${warehouse.id} AND "onHand" - "reserved" >= ${line.quantity}`;
        if (held !== 1) throw new Insufficient(line.sku);
      }
      return tx.reservation.create({
        data: {
          teamId: params.teamId,
          reference: params.reference,
          warehouseId: warehouse.id,
          lines: lines as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + holdMinutes * 60_000),
        },
      });
    });
    await notifyStore(params.teamId, 'stock.changed', { skus: lines.map((line) => line.sku) }, { key: 'skus' });
    return { ok: true, reservation: describe(reservation), results };
  } catch (error) {
    if (error instanceof Insufficient) {
      return {
        ok: false,
        reservation: null,
        results: results.map((result) => (result.sku === error.message ? { ...result, status: 'insufficient' as const, available: 0 } : result)),
      };
    }
    // Another request created the same reference a moment ago.
    if ((error as { code?: string })?.code === 'P2002') return reserveStock(params);
    throw error;
  }
}

// Stops holding the units. `CONSUMED` when the sale is being recorded (the
// issue movement then takes them off hand), otherwise released or expired.
export async function endReservation(teamId: string, reference: string, status: Exclude<ReservationStatus, 'ACTIVE'>) {
  const ended = await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { teamId_reference: { teamId, reference } } });
    if (!reservation || reservation.status !== 'ACTIVE') return reservation ? { reservation, changed: false } : null;
    const claimed = await tx.reservation.updateMany({ where: { id: reservation.id, status: 'ACTIVE' }, data: { status } });
    if (!claimed.count) return { reservation, changed: false };
    for (const line of reservation.lines as ReservedLine[]) {
      await tx.$executeRaw`
        UPDATE "StockLevel"
        SET "reserved" = GREATEST("reserved" - ${line.quantity}, 0), "updatedAt" = now()
        WHERE "itemId" = ${line.itemId} AND "warehouseId" = ${reservation.warehouseId}`;
    }
    return { reservation: { ...reservation, status }, changed: true };
  });
  if (!ended) return null;
  if (ended.changed && status !== 'CONSUMED') {
    const skus = (ended.reservation.lines as ReservedLine[]).map((line) => line.sku);
    await notifyStore(teamId, 'stock.changed', { skus }, { key: 'skus' });
  }
  return describe(ended.reservation);
}

export const getReservation = async (teamId: string, reference: string) => {
  const reservation = await prisma.reservation.findUnique({ where: { teamId_reference: { teamId, reference } } });
  return reservation ? describe(reservation) : null;
};

// Run by the scheduler: frees stock held by checkouts that never finished.
export async function releaseExpiredReservations(limit = 100) {
  const expired = await prisma.reservation.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
    select: { teamId: true, reference: true },
    take: limit,
  });
  for (const reservation of expired) await endReservation(reservation.teamId, reservation.reference, 'EXPIRED');
  return expired.length;
}

export const listReservations = (teamId: string, status?: ReservationStatus) =>
  prisma.reservation.findMany({
    where: { teamId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { warehouse: { select: { name: true } } },
  });
