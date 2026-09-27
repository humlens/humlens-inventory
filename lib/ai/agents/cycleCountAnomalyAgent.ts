import { prisma } from '@/lib/prisma';
import { logAgentAction } from 'models/agentAction';
import { getCycleCountVarianceThresholdPct } from '@/lib/ai/policy';

// Runs right after a cycle count completes: flags any line whose variance
// (as a % of the expected quantity) exceeds the team's tolerance — large
// unexplained gaps are worth a human looking at, not just silently
// auto-reconciled (which submitCycleCountLines already does for every line).
export async function runCycleCountAnomalyAgent(teamId: string, cycleCountId: string) {
  const thresholdPct = await getCycleCountVarianceThresholdPct(teamId);

  const cycleCount = await prisma.cycleCount.findFirstOrThrow({
    where: { id: cycleCountId, teamId },
    include: { lines: { include: { item: { select: { id: true, sku: true, name: true } } } }, warehouse: true },
  });

  const anomalies = cycleCount.lines.filter((line) => {
    if (line.varianceQty === null || line.expectedQty === 0) return line.varianceQty !== null && line.varianceQty !== 0;
    const variancePct = (Math.abs(line.varianceQty) / line.expectedQty) * 100;
    return variancePct > thresholdPct;
  });

  if (anomalies.length === 0) {
    return null;
  }

  const reasoning = anomalies
    .map((l) => `${l.item.name} (${l.item.sku}): expected ${l.expectedQty}, counted ${l.countedQty}, variance ${l.varianceQty}`)
    .join('\n');

  return logAgentAction({
    teamId,
    type: 'CYCLE_COUNT_ANOMALY',
    status: 'EXECUTED',
    input: { cycleCountId, thresholdPct },
    output: { anomalies: anomalies.map((l) => ({ itemId: l.itemId, expectedQty: l.expectedQty, countedQty: l.countedQty, varianceQty: l.varianceQty })) },
    reasoning: `${anomalies.length} item(s) in "${cycleCount.name}" (${cycleCount.warehouse.name}) varied by more than ${thresholdPct}% of expected quantity:\n${reasoning}`,
  });
}
