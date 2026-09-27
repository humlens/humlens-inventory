import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { getSupplier, setSupplierStatus } from 'models/supplier';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'supplier', 'read');
      res.status(200).json({ data: await getSupplier(teamMember.teamId, id) });
      return;
    }

    if (req.method === 'PUT') {
      const teamMember = await guardTeamAccess(req, res, 'supplier', 'update');
      res.status(200).json({ data: await setSupplierStatus(teamMember.teamId, id, req.body.status) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
