import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardApiKey, handleV1Error } from '@/lib/apiKey';
import { setAuditEvent } from '@/lib/audit';
import { validateWithSchema } from '@/lib/zod';
import { MAX_HOLD_MINUTES, getReservation, reserveStock } from 'models/reservation';

const bodySchema = z.object({
  reference: z.string().trim().min(1).max(200),
  warehouseId: z.string().optional(),
  holdMinutes: z.number().int().positive().max(MAX_HOLD_MINUTES).optional(),
  lines: z
    .array(z.object({ sku: z.string().trim().min(1), quantity: z.number().int().positive() }))
    .min(1)
    .max(200),
});

// POST /api/v1/reservations — hold stock for a checkout, all lines or none.
// `ok: false` with per-line results when something isn't available.
// GET ?reference= — where a reservation stands.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const { teamId } = await guardApiKey(req, res, 'stock_level', 'read');
      const { reference } = validateWithSchema(z.object({ reference: z.string().min(1) }), req.query);
      res.status(200).json({ data: await getReservation(teamId, reference) });
      return;
    }
    if (req.method !== 'POST') return res.status(405).end();
    const { teamId } = await guardApiKey(req, res, 'stock_transaction', 'create');
    setAuditEvent(res, { resource: 'reservation', action: 'create' });
    const body = validateWithSchema(bodySchema, req.body);
    res.status(200).json({ data: await reserveStock({ teamId, ...body }) });
  } catch (error) {
    handleV1Error(res, error);
  }
}
