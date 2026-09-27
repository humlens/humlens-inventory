import {
  Package,
  Warehouse,
  Truck,
  ShoppingCart,
  ArrowLeftRight,
  SlidersHorizontal,
  ListChecks,
  History,
  type LucideIcon,
} from 'lucide-react';

const features: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Package,
    title: 'Item catalog',
    description: 'SKUs, categories, unit cost, and reorder points in one place — the source of truth for everything else.',
  },
  {
    icon: Warehouse,
    title: 'Multi-warehouse stock',
    description: 'See on-hand and reserved quantities per item, per warehouse, in real time — no spreadsheet reconciliation.',
  },
  {
    icon: Truck,
    title: 'Suppliers',
    description: 'Track lead times and link each item to a preferred supplier so replenishment never stalls on "who do we order from?"',
  },
  {
    icon: ShoppingCart,
    title: 'Purchase orders & receiving',
    description: 'Issue a PO, then record what actually arrives — partial receipts update stock automatically, line by line.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Stock transfers',
    description: 'Move stock between warehouses with a two-step handoff: deducted on send, added back on confirmed arrival.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Stock adjustments',
    description: 'Correct for damage, loss, or found inventory with a reason code — every adjustment lands in the ledger.',
  },
  {
    icon: ListChecks,
    title: 'Cycle counts',
    description: 'Plan a blind count against a snapshot, then reconcile variances automatically once counting is done.',
  },
  {
    icon: History,
    title: 'Full audit ledger',
    description: 'Every receipt, issue, transfer, and adjustment is one append-only record — stock levels can never drift from it.',
  },
];

export default function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-gray-900">
          Everything inventory needs, nothing it doesn&apos;t
        </h2>
        <p className="mt-3 text-base text-gray-600">
          One workspace for the whole stock lifecycle, built around the warehouse team that already runs it.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.title} className="card">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <f.icon size={18} strokeWidth={2} />
            </div>
            <h3 className="mt-3.5 text-sm font-semibold text-gray-900">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
