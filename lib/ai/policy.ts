import { getAgentPolicy } from 'models/agentAction';

// Hard ceiling that no per-team AgentPolicy can override — a safety net so a
// misconfigured policy row can never let the agent auto-create a PO above
// this, regardless of what an admin sets in the UI.
const HARD_MAX_AUTO_REORDER = Number(process.env.AGENT_MAX_AUTO_REORDER_AMOUNT || 2000);

export async function canAutoReorder(params: { teamId: string; estimatedAmount: number; categoryIds: string[] }) {
  const policy = await getAgentPolicy(params.teamId);

  if (!policy.autoReorderEnabled) {
    return { allowed: false, reason: 'Autonomous reordering is disabled for this team.' };
  }

  const ceiling = Math.min(Number(policy.autoReorderMaxAmount), HARD_MAX_AUTO_REORDER);
  if (params.estimatedAmount > ceiling) {
    return { allowed: false, reason: `Estimated cost ${params.estimatedAmount} exceeds the auto-reorder ceiling of ${ceiling}.` };
  }

  if (
    policy.autoReorderCategories.length > 0 &&
    !params.categoryIds.some((c) => policy.autoReorderCategories.includes(c))
  ) {
    return { allowed: false, reason: 'This item is not in an approved auto-reorder category.' };
  }

  return { allowed: true as const, reason: null };
}

export async function getDeadStockThresholdDays(teamId: string) {
  const policy = await getAgentPolicy(teamId);
  return policy.deadStockThresholdDays;
}

export async function getCycleCountVarianceThresholdPct(teamId: string) {
  const policy = await getAgentPolicy(teamId);
  return policy.cycleCountVarianceThresholdPct;
}
