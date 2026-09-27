import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listWarehouses, createWarehouse } from 'models/warehouse';
import { validateWithSchema, createWarehouseSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'warehouse', 'read');
      res.status(200).json({ data: await listWarehouses(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'warehouse', 'create');
      const params = validateWithSchema(createWarehouseSchema, req.body);
      res.status(201).json({ data: await createWarehouse({ teamId: teamMember.teamId, ...params }) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
