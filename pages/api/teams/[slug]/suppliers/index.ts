import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listSuppliers, createSupplier } from 'models/supplier';
import { validateWithSchema, createSupplierSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'supplier', 'read');
      res.status(200).json({ data: await listSuppliers(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'supplier', 'create');
      const params = validateWithSchema(createSupplierSchema, req.body);
      const supplier = await createSupplier({
        teamId: teamMember.teamId,
        createdById: teamMember.userId,
        ...params,
      });
      res.status(201).json({ data: supplier });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
