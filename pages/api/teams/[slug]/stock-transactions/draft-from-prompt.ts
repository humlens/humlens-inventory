import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { draftStockMovementFromPrompt } from '@/lib/ai/agents/stockAdjustmentDraftAgent';
import { validateWithSchema } from '@/lib/zod';

const promptSchema = z.object({ prompt: z.string().min(3) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'stock_transaction', 'create');
    // Only proposes a movement for review; applying it is audited when approved.
    setAuditEvent(res, null);
    const { prompt } = validateWithSchema(promptSchema, req.body);

    const draft = await draftStockMovementFromPrompt({ teamId: teamMember.teamId, prompt, requestedById: teamMember.userId });
    res.status(200).json({ data: draft });
  } catch (error) {
    handleApiError(res, error);
  }
}
