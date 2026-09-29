import { generateText } from 'ai';

import { prisma } from '@/lib/prisma';
import { logAgentAction } from 'models/agentAction';
import { getCycleCountVarianceThresholdPct } from '@/lib/ai/policy';
import { explainLater, withJudgement } from '@/lib/ai/judgement';

const HISTORY_DAYS = 21;

// Runs right after a cycle count completes: flags any line whose variance
// (as a % of the expected quantity) exceeds the team's tolerance — large
// unexplained gaps are worth a human looking at, not just silently
// auto-reconciled (which submitCycleCountLines already does for every line).
// The tolerance decides what gets flagged; the model then reads each flagged
// item's recent movements and suggests where to look first.
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

  const finding = await logAgentAction({
    teamId,
    type: 'CYCLE_COUNT_ANOMALY',
    status: 'EXECUTED',
    agent: 'cycle-count',
    title: `${anomalies.length} count${anomalies.length === 1 ? '' : 's'} off by more than ${thresholdPct}% in “${cycleCount.name}”`,
    evidence: [
      { label: 'Warehouse', value: cycleCount.warehouse.name },
      { label: 'Lines flagged', value: anomalies.length },
      { label: 'Tolerance', value: `${thresholdPct}%` },
    ],
    input: { cycleCountId, thresholdPct },
    output: { anomalies: anomalies.map((l) => ({ itemId: l.itemId, expectedQty: l.expectedQty, countedQty: l.countedQty, varianceQty: l.varianceQty })) },
    reasoning: `${anomalies.length} item(s) in "${cycleCount.name}" (${cycleCount.warehouse.name}) varied by more than ${thresholdPct}% of expected quantity:\n${reasoning}`,
  });

  // Add the model's read of likely causes once it's ready, so submitting the count isn't held up.
  explainLater('cycle count causes', async () => {
    const causes = await withJudgement(teamId, 'cycle count causes', async (ai, abortSignal) => {
      const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
      const movements = await prisma.stockTransaction.findMany({
        where: { teamId, warehouseId: cycleCount.warehouseId, itemId: { in: anomalies.map((l) => l.itemId) }, createdAt: { gte: since } },
        select: { itemId: true, type: true, quantity: true, note: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 300,
      });
      const history = anomalies
        .map((l) => {
          const rows = movements.filter((m) => m.itemId === l.itemId);
          const lines = rows.map((m) => `  ${m.createdAt.toISOString().slice(0, 10)} ${m.type} ${m.quantity}${m.note ? ` (${m.note.slice(0, 80)})` : ''}`);
          return `${l.item.sku} ${l.item.name}: expected ${l.expectedQty}, counted ${l.countedQty}\n${lines.join('\n') || '  no movements recorded'}`;
        })
        .join('\n\n');
      const { text, usage } = await generateText({
        model: ai.model,
        abortSignal,
        prompt: `A stock count at warehouse "${cycleCount.warehouse.name}" came out different from the system's figures. For each item below you have its last ${HISTORY_DAYS} days of recorded movements. Suggest the most likely cause per item (for example a receipt recorded twice or not at all, a transfer not yet booked, a sale not recorded, a unit-of-measure mix-up, damage or theft) and what someone should check first. Plain language, no markdown, one short paragraph per item starting with the SKU. Only use the facts given.

${history}`,
      });
      return { text, tokens: usage?.totalTokens };
    });
    if (!causes) return;
    await prisma.agentAction.update({
      where: { id: finding.id },
      data: { reasoning: `${finding.reasoning}\n\nWhere to look first:\n${causes.value.text.trim()}`, aiModel: causes.ai.id, aiTokens: causes.value.tokens },
    });
  });
  return finding;
}
