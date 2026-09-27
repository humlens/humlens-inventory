import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listCategories, createCategory } from 'models/category';
import { validateWithSchema, createCategorySchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'category', 'read');
      res.status(200).json({ data: await listCategories(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'category', 'create');
      const params = validateWithSchema(createCategorySchema, req.body);
      res.status(201).json({ data: await createCategory({ teamId: teamMember.teamId, ...params }) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
