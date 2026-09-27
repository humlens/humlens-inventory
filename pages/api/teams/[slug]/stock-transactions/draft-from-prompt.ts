import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
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
    const { prompt } = validateWithSchema(promptSchema, req.body);

    const draft = await draftStockMovementFromPrompt({ teamId: teamMember.teamId, prompt });
    res.status(200).json({ data: draft });
  } catch (error) {
    handleApiError(res, error);
  }
}
