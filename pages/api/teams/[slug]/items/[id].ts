import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { getItem, updateItem } from 'models/item';
import { updateItemSchema, validateWithSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'item', 'read');
      res.status(200).json({ data: await getItem(teamMember.teamId, id) });
      return;
    }

    if (req.method === 'PUT') {
      const teamMember = await guardTeamAccess(req, res, 'item', 'update');
      res.status(200).json({ data: await updateItem(teamMember.teamId, id, validateWithSchema(updateItemSchema, req.body)) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
