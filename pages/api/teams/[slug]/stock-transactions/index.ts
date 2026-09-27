import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listStockTransactions, applyStockMovement } from 'models/stock';
import { validateWithSchema, stockTransactionSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'stock_transaction', 'read');
      const { itemId, warehouseId } = req.query;
      res.status(200).json({
        data: await listStockTransactions(teamMember.teamId, {
          itemId: itemId as string | undefined,
          warehouseId: warehouseId as string | undefined,
        }),
      });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'stock_transaction', 'create');
      const params = validateWithSchema(stockTransactionSchema, req.body);
      const result = await applyStockMovement({
        teamId: teamMember.teamId,
        performedById: teamMember.userId,
        ...params,
      });
      res.status(201).json({ data: result });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
