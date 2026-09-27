import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardApiKey, handleV1Error } from '@/lib/apiKey';
import { validateWithSchema } from '@/lib/zod';
import { recordStockMovements } from 'models/storeSync';

const bodySchema = z.object({
  type: z.enum(['issue', 'receipt']),
  reference: z.string().trim().min(1).max(200),
  note: z.string().max(500).optional(),
  warehouseId: z.string().optional(),
  // The checkout reservation this sale fulfils (see /api/v1/reservations).
  reservation: z.string().trim().min(1).max(200).optional(),
  lines: z
    .array(z.object({ sku: z.string().trim().min(1), quantity: z.number().int().positive() }))
    .min(1)
    .max(200),
});

// POST /api/v1/stock-movements — goods out (`issue`) or in (`receipt`), by SKU.
// Idempotent per (reference, SKU, type); each line reports its own outcome.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const { teamId, actorId } = await guardApiKey(req, res, 'stock_transaction', 'create');
    const body = validateWithSchema(bodySchema, req.body);
    res.status(200).json({ data: await recordStockMovements({ teamId, actorId, ...body }) });
  } catch (error) {
    handleV1Error(res, error);
  }
}
