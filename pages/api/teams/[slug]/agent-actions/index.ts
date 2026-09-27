import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listAgentActions } from 'models/agentAction';
import { runReorderAgent } from '@/lib/ai/agents/reorderAgent';
import { runDeadStockAgent } from '@/lib/ai/agents/deadStockAgent';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'agent_action', 'read');
      res.status(200).json({ data: await listAgentActions(teamMember.teamId) });
      return;
    }

    // Manual trigger for the reorder + dead-stock checks (also intended to
    // run on a schedule — see workers/agentScheduler.ts).
    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'agent_action', 'read');
      const [reorderActions, deadStockAction] = await Promise.all([
        runReorderAgent(teamMember.teamId),
        runDeadStockAgent(teamMember.teamId),
      ]);
      res.status(200).json({ data: { reorderActions, deadStockAction } });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
