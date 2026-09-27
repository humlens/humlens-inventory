import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listItems, createItem } from 'models/item';
import { validateWithSchema, createItemSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'item', 'read');
      const { search, categoryId } = req.query;
      res.status(200).json({
        data: await listItems(teamMember.teamId, {
          search: search as string | undefined,
          categoryId: categoryId as string | undefined,
        }),
      });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'item', 'create');
      const params = validateWithSchema(createItemSchema, req.body);
      const item = await createItem({ teamId: teamMember.teamId, createdById: teamMember.userId, ...params });
      res.status(201).json({ data: item });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
