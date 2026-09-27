import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { submitCycleCountLines, getCycleCount } from 'models/cycleCount';
import { runCycleCountAnomalyAgent } from '@/lib/ai/agents/cycleCountAnomalyAgent';
import { validateWithSchema, submitCycleCountLineSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'cycle_count', 'count');
    setAuditEvent(res, { resource: 'cycle_count', action: 'submit' });
    const { lines } = validateWithSchema(submitCycleCountLineSchema, req.body);
    const id = req.query.id as string;

    const result = await submitCycleCountLines(teamMember.teamId, id, lines, teamMember.userId);

    if (result.status === 'COMPLETED') {
      try {
        await runCycleCountAnomalyAgent(teamMember.teamId, id);
      } catch (agentError) {
        // eslint-disable-next-line no-console
        console.error('cycle count anomaly agent failed', agentError);
      }
    }

    res.status(200).json({ data: await getCycleCount(teamMember.teamId, id) });
  } catch (error) {
    handleApiError(res, error);
  }
}
