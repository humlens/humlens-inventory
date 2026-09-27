import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { startCycleCount } from 'models/cycleCount';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'cycle_count', 'count');
    res.status(200).json({ data: await startCycleCount(teamMember.teamId, req.query.id as string) });
  } catch (error) {
    handleApiError(res, error);
  }
}
