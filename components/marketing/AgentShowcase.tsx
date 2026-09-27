import { PackagePlus, AlertTriangle, ListChecks, MessageSquareText, Sparkles, type LucideIcon } from 'lucide-react';

const agents: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: PackagePlus,
    title: 'Auto-reorder agent',
    description:
      'When an item with a preferred supplier hits its reorder point, drafts a real purchase order automatically — within the limits you set.',
  },
  {
    icon: AlertTriangle,
    title: 'Dead-stock agent',
    description: 'Flags items that have sat with no outbound movement past your threshold, before they turn into a write-off.',
  },
  {
    icon: ListChecks,
    title: 'Cycle-count anomaly agent',
    description: 'Runs the moment a count completes and flags any line whose variance exceeds your tolerance for a second look.',
  },
  {
    icon: MessageSquareText,
    title: 'Natural-language stock entry',
    description: '"Received 50 units of blue widgets at the main warehouse" becomes a structured, ready-to-submit draft.',
  },
];

export default function AgentShowcase() {
  return (
    <section id="agents" className="py-20" style={{ backgroundColor: '#0b1120' }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge bg-violet-500/10 text-violet-300 ring-violet-400/20">
            <Sparkles size={12} />
            Autonomous, not automatic
          </span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white">Meet your AI inventory team</h2>
          <p className="mt-3 text-base text-gray-400">
            Every agent works within a policy you set, and logs a reasoned entry for each decision it makes — or
            declines to make. Nothing happens silently.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((a) => (
            <div key={a.title} className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                <a.icon size={18} strokeWidth={2} />
              </div>
              <h3 className="mt-3.5 text-sm font-semibold text-white">{a.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{a.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.04] px-6 py-5 text-center">
          <p className="text-sm text-gray-300">
            Also exposed as an <span className="font-medium text-white">MCP server</span> — Claude or any
            MCP-compatible agent can check stock levels, record a movement, or create a purchase order directly,
            under the same role-based permissions as a human teammate.
          </p>
        </div>
      </div>
    </section>
  );
}
