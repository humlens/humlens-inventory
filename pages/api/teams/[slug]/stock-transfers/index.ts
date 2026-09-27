import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listStockTransfers, createStockTransfer } from 'models/transfer';
import { validateWithSchema, createStockTransferSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'stock_transfer', 'read');
      res.status(200).json({ data: await listStockTransfers(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'stock_transfer', 'create');
      const params = validateWithSchema(createStockTransferSchema, req.body);
      const transfer = await createStockTransfer({
        teamId: teamMember.teamId,
        requestedById: teamMember.userId,
        ...params,
      });
      res.status(201).json({ data: transfer });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
