import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardApiKey, handleV1Error } from '@/lib/apiKey';
import { setAuditEvent } from '@/lib/audit';
import { validateWithSchema } from '@/lib/zod';
import { commitReservation } from 'models/reservation';

// POST /api/v1/reservations/commit — the checkout became an order waiting to
// be picked and shipped: keep its stock held until the shipment is recorded.
// Returns the reservation (null when there is none). Safe to call more than once.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const { teamId } = await guardApiKey(req, res, 'stock_transaction', 'create');
    setAuditEvent(res, { resource: 'reservation', action: 'commit' });
    const { reference } = validateWithSchema(z.object({ reference: z.string().trim().min(1).max(200) }), req.body);
    res.status(200).json({ data: await commitReservation(teamId, reference) });
  } catch (error) {
    handleV1Error(res, error);
  }
}
