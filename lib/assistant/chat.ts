import type { NextApiRequest, NextApiResponse } from 'next';
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';

import { ApiError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { getAgentModel } from '@/lib/ai/provider';
import { throwIfNoTeamAccess } from 'models/team';
import { assistantInstructions } from './instructions';
import { assistantTools } from './tools';
import { hit } from '@/lib/rateLimit';

// One chat turn with the in-app assistant: the signed-in member's messages
// in, a streamed reply out. It runs on the team's agent model (Settings →
// Agent policy) and with the member's own permissions (see ./tools).

const MAX_MESSAGES = 40;
const HOURLY_LIMIT = Number(process.env.ASSISTANT_HOURLY_LIMIT || 120);

// Per-member message budget: a guard against runaway loops and cost (lib/rateLimit).
const checkRateLimit = (key: string) => hit(`assistant:${key}`, HOURLY_LIMIT, 3_600_000);

/** Keeps only user and assistant turns (clients can't inject system prompts) and caps history. */
function sanitize(messages: unknown): UIMessage[] {
  return (Array.isArray(messages) ? (messages as UIMessage[]) : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && Array.isArray(m.parts))
    .slice(-MAX_MESSAGES);
}

function describeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/api key|401|unauthorized|authentication/i.test(message)) return 'The AI model rejected its API key. Check it in Settings → Agent policy.';
  if (/rate limit|429|overloaded|529/i.test(message)) return 'The AI model is busy right now. Try again in a minute.';
  if (/ECONNREFUSED|fetch failed/i.test(message)) return 'Could not reach the AI model. If you use a local model, check that its server is running.';
  return 'Something went wrong while answering. Try again.';
}

export async function handleAssistantChat(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  const member = await throwIfNoTeamAccess(req, res);

  const retryAfter = checkRateLimit(`${member.teamId}:${member.userId}`);
  if (retryAfter) {
    res.setHeader('Retry-After', String(retryAfter));
    throw new ApiError(429, 'You have sent a lot of messages this hour. Please try again a little later.');
  }

  const body = (req.body ?? {}) as { messages?: unknown; page?: unknown };
  const messages = sanitize(body.messages);
  if (!messages.length) throw new ApiError(400, 'Send a message to start.');

  let ai;
  try {
    ai = await getAgentModel(member.teamId);
  } catch (error) {
    const hint = can(member.role, 'agent_policy', 'update') ? 'Choose a model and add its key in Settings → Agent policy.' : 'Ask an admin to set one up in Settings → Agent policy.';
    throw new ApiError(503, `The assistant needs an AI model. ${error instanceof ApiError ? error.message : ''} ${hint}`.replace(/\s+/g, ' ').trim());
  }

  const assistantMember = {
    teamId: member.teamId,
    teamSlug: member.team.slug,
    userId: member.userId,
    role: member.role,
    currency: member.team.currency || 'USD',
  };
  const tools = assistantTools(assistantMember);

  // Stop the model when the person closes the panel or navigates away.
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });

  const result = streamText({
    model: ai.model,
    system: assistantInstructions({
      ...assistantMember,
      teamName: member.team.name,
      userName: member.user.name ?? null,
      page: typeof body.page === 'string' ? body.page.slice(0, 200) : null,
    }),
    messages: convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: stepCountIs(10),
    maxOutputTokens: 4000,
    abortSignal: abort.signal,
  });

  result.pipeUIMessageStreamToResponse(res, {
    onError: (error) => {
      console.error('Assistant error', error);
      return error instanceof ApiError ? error.message : describeError(error);
    },
  });
}
