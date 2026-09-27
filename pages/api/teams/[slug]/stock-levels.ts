import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listStockLevels } from 'models/stock';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'stock_level', 'read');
      const { warehouseId, itemId, lowStockOnly } = req.query;
      res.status(200).json({
        data: await listStockLevels(teamMember.teamId, {
          warehouseId: warehouseId as string | undefined,
          itemId: itemId as string | undefined,
          lowStockOnly: lowStockOnly === 'true',
        }),
      });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
