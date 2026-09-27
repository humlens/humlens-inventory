import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { completeStockTransfer, cancelStockTransfer } from 'models/transfer';
import { validateWithSchema } from '@/lib/zod';

const actionSchema = z.object({ action: z.enum(['complete', 'cancel']) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const { action } = validateWithSchema(actionSchema, req.body);
    const teamMember = await guardTeamAccess(req, res, 'stock_transfer', 'transfer');
    setAuditEvent(res, { resource: 'stock_transfer', action });
    const id = req.query.id as string;

    const result =
      action === 'complete'
        ? await completeStockTransfer(teamMember.teamId, id, teamMember.userId)
        : await cancelStockTransfer(teamMember.teamId, id, teamMember.userId);

    res.status(200).json({ data: result });
  } catch (error) {
    handleApiError(res, error);
  }
}
