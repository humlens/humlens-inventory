import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardApiKey, handleV1Error } from '@/lib/apiKey';
import { setAuditEvent } from '@/lib/audit';
import { validateWithSchema } from '@/lib/zod';
import { applyCostUpdates } from 'models/itemCost';

const bodySchema = z.object({
  reference: z.string().trim().min(1).max(200),
  lines: z
    .array(z.object({ sku: z.string().trim().min(1), quantity: z.number().int().positive(), unitCost: z.number().nonnegative() }))
    .min(1)
    .max(200),
});

// POST /api/v1/item-costs — what was actually paid per unit (e.g. from a
// matched invoice in Humlens Procurement). Updates each item's cost as a
// moving average, once per reference.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const { teamId } = await guardApiKey(req, res, 'item', 'update');
    setAuditEvent(res, { resource: 'item_cost', action: 'update' });
    const body = validateWithSchema(bodySchema, req.body);
    res.status(200).json({ data: await applyCostUpdates({ teamId, ...body }) });
  } catch (error) {
    handleV1Error(res, error);
  }
}
