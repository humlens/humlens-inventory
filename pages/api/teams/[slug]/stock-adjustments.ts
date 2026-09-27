import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listStockAdjustments, createStockAdjustment } from 'models/adjustment';
import { validateWithSchema, createStockAdjustmentSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'stock_adjustment', 'read');
      res.status(200).json({ data: await listStockAdjustments(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'stock_adjustment', 'create');
      const params = validateWithSchema(createStockAdjustmentSchema, req.body);
      const adjustment = await createStockAdjustment({
        teamId: teamMember.teamId,
        performedById: teamMember.userId,
        ...params,
      });
      res.status(201).json({ data: adjustment });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
