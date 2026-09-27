import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { listAgentActions } from 'models/agentAction';
import { runReorderAgent } from '@/lib/ai/agents/reorderAgent';
import { runDeadStockAgent } from '@/lib/ai/agents/deadStockAgent';
import { runReorderTuningAgent } from '@/lib/ai/agents/reorderTuningAgent';

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
      setAuditEvent(res, { resource: 'agent_action', action: 'run' });
      if (req.body?.agent === 'reorder-levels') {
        res.status(200).json({ data: { suggestions: await runReorderTuningAgent(teamMember.teamId) } });
        return;
      }
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
