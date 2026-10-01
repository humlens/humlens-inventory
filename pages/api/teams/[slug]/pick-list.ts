import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listPickList } from 'models/reservation';

// Store orders waiting to be picked and shipped, read-only: the store consumes
// each hold when it records the shipment.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'stock_level', 'read');
      const { warehouseId, includeCheckouts } = req.query;
      res.status(200).json({
        data: await listPickList(teamMember.teamId, {
          warehouseId: (warehouseId as string | undefined) || undefined,
          includeCheckouts: includeCheckouts === 'true',
        }),
      });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
