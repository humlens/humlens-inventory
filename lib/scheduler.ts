import { prisma } from '@/lib/prisma';
import { deliverDue } from '@/lib/outbox';
import { runReorderAgent } from '@/lib/ai/agents/reorderAgent';
import { runReorderTuningAgent } from '@/lib/ai/agents/reorderTuningAgent';
import { releaseExpiredReservations } from 'models/reservation';

// Background jobs that keep the connected apps in step without anyone
// pressing a button. Started once per server process from instrumentation.ts
// (long-running `next start`/`next dev`). On serverless hosting set
// DISABLE_SCHEDULER=1 and call workers/agentScheduler.ts from a cron instead.

type Job = { name: string; everyMs: number; run: () => Promise<unknown> };

const eachTeam = async (where: object, work: (teamId: string) => Promise<unknown>) => {
  const teams = await prisma.team.findMany({ where, select: { id: true } });
  for (const team of teams) {
    await work(team.id).catch((error) => console.error(`[scheduler] team ${team.id}`, error));
  }
};

export const jobs: Job[] = [
  { name: 'deliver messages to connected apps', everyMs: 15_000, run: () => deliverDue() },
  { name: 'release expired stock reservations', everyMs: 60_000, run: () => releaseExpiredReservations() },
  {
    name: 'raise low-stock requests in Procurement',
    everyMs: 60 * 60_000,
    run: () =>
      eachTeam({ connections: { some: { kind: 'PROCUREMENT', options: { path: ['routeReorders'], equals: true } } } }, runReorderAgent),
  },
  { name: 'suggest reorder levels from sales', everyMs: 24 * 60 * 60_000, run: () => eachTeam({}, runReorderTuningAgent) },
];

const globalState = globalThis as unknown as { __humlensScheduler?: boolean };

export function startScheduler() {
  if (globalState.__humlensScheduler || process.env.DISABLE_SCHEDULER === '1' || process.env.NODE_ENV === 'test') return;
  globalState.__humlensScheduler = true;

  for (const job of jobs) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (error) {
        console.error(`[scheduler] ${job.name} failed`, error);
      } finally {
        running = false;
      }
    };
    // Stagger the first runs a little after start-up.
    setTimeout(() => {
      void tick();
      setInterval(tick, job.everyMs).unref?.();
    }, 5_000).unref?.();
  }
  console.log(`[scheduler] started: ${jobs.map((job) => job.name).join('; ')}`);
}
