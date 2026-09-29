import { getAgentModel, type ResolvedModel } from '@/lib/ai/provider';

// Agents lean on the model for judgement (how much to order, what probably
// caused a miscount) but never depend on it: when no model is set up, or the
// call fails or is slow, they fall back to their rules. So a missing API key
// makes the agents plainer, never broken.

const TIMEOUT_MS = Number(process.env.AGENT_AI_TIMEOUT_MS || 45_000);

/** The team's model, or null when none is configured. */
export async function tryAgentModel(teamId: string): Promise<ResolvedModel | null> {
  try {
    return await getAgentModel(teamId);
  } catch {
    return null;
  }
}

/**
 * Runs one model call for an agent. Returns null (and logs why) instead of
 * throwing, so the caller can carry on with its rule-based answer.
 */
export async function withJudgement<T>(
  teamId: string,
  label: string,
  run: (ai: ResolvedModel, abortSignal: AbortSignal) => Promise<T>
): Promise<{ value: T; ai: ResolvedModel } | null> {
  const ai = await tryAgentModel(teamId);
  if (!ai) return null;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    return { value: await run(ai, abort.signal), ai };
  } catch (error) {
    console.warn(`AI judgement "${label}" skipped for team ${teamId}:`, error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Adds the model's view to something an agent already recorded, without
 * holding up the request that triggered it: the rule-based result is saved
 * and returned first, and the explanation fills in a few seconds later.
 */
export function explainLater(label: string, work: () => Promise<unknown>) {
  void work().catch((error) => console.warn(`AI explanation "${label}" failed:`, error instanceof Error ? error.message : error));
}
