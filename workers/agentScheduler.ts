import { prisma } from '@/lib/prisma';
import { runReorderAgent } from '@/lib/ai/agents/reorderAgent';
import { runDeadStockAgent } from '@/lib/ai/agents/deadStockAgent';
import { runReorderTuningAgent } from '@/lib/ai/agents/reorderTuningAgent';
import { deliverDue } from '@/lib/outbox';
import { releaseExpiredReservations } from 'models/reservation';

// Runs the checks that don't have a natural trigger event across every
// team. Intended to run on a schedule — e.g. `vercel crons` or any external
// scheduler invoking `ts-node workers/agentScheduler.ts` daily. (Long-running
// servers also do the frequent jobs in lib/scheduler.ts; this covers hosts
// where that's disabled.)
async function main() {
  await releaseExpiredReservations();
  await deliverDue(200);

  const teams = await prisma.team.findMany({ select: { id: true } });

  for (const team of teams) {
    try {
      await runReorderAgent(team.id);
      await runDeadStockAgent(team.id);
      await runReorderTuningAgent(team.id);
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
