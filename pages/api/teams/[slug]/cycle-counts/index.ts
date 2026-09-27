import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listCycleCounts, createCycleCount } from 'models/cycleCount';
import { validateWithSchema, createCycleCountSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'cycle_count', 'read');
      res.status(200).json({ data: await listCycleCounts(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'cycle_count', 'create');
      const params = validateWithSchema(createCycleCountSchema, req.body);
      const cycleCount = await createCycleCount({
        teamId: teamMember.teamId,
        createdById: teamMember.userId,
        ...params,
      });
      res.status(201).json({ data: cycleCount });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
