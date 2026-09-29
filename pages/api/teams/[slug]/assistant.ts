import type { NextApiRequest, NextApiResponse } from 'next';

import { handleApiError } from '@/lib/apiGuard';
import { handleAssistantChat } from '@/lib/assistant/chat';

// POST { messages, page? }: one turn with the in-app assistant, streamed back
// in the AI SDK's UI message format (see lib/assistant).
export const config = { api: { bodyParser: { sizeLimit: '4mb' }, responseLimit: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await handleAssistantChat(req, res);
  } catch (error) {
    if (!res.headersSent) handleApiError(res, error);
  }
}
