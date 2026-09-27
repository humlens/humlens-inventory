import { prisma } from '@/lib/prisma';
import { runReorderAgent } from '@/lib/ai/agents/reorderAgent';
import { runDeadStockAgent } from '@/lib/ai/agents/deadStockAgent';

// Runs the checks that don't have a natural trigger event across every
// team. Intended to run on a schedule — e.g. `vercel crons` or any external
// scheduler invoking `ts-node workers/agentScheduler.ts` daily.
async function main() {
  const teams = await prisma.team.findMany({ select: { id: true } });

  for (const team of teams) {
    try {
      await runReorderAgent(team.id);
      await runDeadStockAgent(team.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`agent scheduler failed for team ${team.id}`, err);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Agent scheduler ran for ${teams.length} team(s).`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
