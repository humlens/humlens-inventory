import { generateText } from 'ai';

import { prisma } from '@/lib/prisma';
import { logAgentAction } from 'models/agentAction';
import { getDeadStockThresholdDays } from '@/lib/ai/policy';
import { agentModel } from '@/lib/ai/provider';

// Flags items sitting in stock with no outbound movement (an ISSUE, i.e.
// actual consumption/sale) for longer than the team's configured threshold.
// Deterministic scan — the model is only used to phrase the finding.
export async function runDeadStockAgent(teamId: string) {
  const thresholdDays = await getDeadStockThresholdDays(teamId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - thresholdDays);

  const items = await prisma.item.findMany({
    where: { teamId, isActive: true },
    include: { stockLevels: true },
  });

  const candidates = items.filter((item) => item.stockLevels.reduce((sum, l) => sum + l.onHand, 0) > 0);
  const flagged: { item: (typeof candidates)[number]; lastIssueAt: Date | null; onHand: number }[] = [];

  for (const item of candidates) {
    const lastIssue = await prisma.stockTransaction.findFirst({
      where: { teamId, itemId: item.id, type: 'ISSUE' },
      orderBy: { createdAt: 'desc' },
    });

    const staleSinceCreation = !lastIssue && item.createdAt < cutoff;
    const staleSinceLastIssue = lastIssue && lastIssue.createdAt < cutoff;

    if (staleSinceCreation || staleSinceLastIssue) {
      flagged.push({
        item,
        lastIssueAt: lastIssue?.createdAt ?? null,
        onHand: item.stockLevels.reduce((sum, l) => sum + l.onHand, 0),
      });
    }
  }

  if (flagged.length === 0) {
    return null;
  }

  const summaryLines = flagged
    .map(
      (f) =>
        `${f.item.name} (${f.item.sku}): ${f.onHand} units on hand, last issued ${f.lastIssueAt ? f.lastIssueAt.toDateString() : 'never'}`
    )
    .join('\n');

  const { text } = await generateText({
    model: agentModel,
    prompt: `Summarize this dead-stock finding for an inventory dashboard in 2-3 sentences, plain language, no markdown:\n\n${summaryLines}`,
  });

  return logAgentAction({
    teamId,
    type: 'DEAD_STOCK_ALERT',
    status: 'EXECUTED',
    input: { thresholdDays, itemCount: flagged.length },
    output: { items: flagged.map((f) => ({ itemId: f.item.id, onHand: f.onHand, lastIssueAt: f.lastIssueAt })) },
    reasoning: text,
  });
}
