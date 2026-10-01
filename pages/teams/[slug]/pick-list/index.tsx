import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { PackageOpen } from 'lucide-react';

import Layout from '@/components/Layout';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import { apiFetch } from '@/lib/fetcher';
import { appUrls } from '@/lib/humlensApps';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type PickLine = { itemId: string; sku: string; name: string; quantity: number };

type PickReservation = {
  id: string;
  reference: string;
  purpose: 'order' | 'checkout';
  warehouse: { id: string; name: string };
  lines: PickLine[];
  units: number;
  createdAt: string;
};

// The store only tells us its transaction id (`store:txn:<id>`); the
// transaction in the store admin links on to its order.
function StoreReference({ reference }: { reference: string }) {
  const transactionId = reference.startsWith('store:txn:') ? reference.slice('store:txn:'.length) : null;
  if (!transactionId || !appUrls.commerce) return <span className="font-mono text-xs">{reference}</span>;
  return (
    <a
      href={`${appUrls.commerce}/admin/collections/transactions/${transactionId}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-brand-600 hover:text-brand-700"
      onClick={(e) => e.stopPropagation()}
    >
      {reference}
    </a>
  );
}

export default function PickList() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const [warehouseId, setWarehouseId] = useState('');
  const [includeCheckouts, setIncludeCheckouts] = useState(false);

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/warehouses`),
    enabled: !!slug,
  });

  const { data: reservations, isLoading } = useQuery({
    queryKey: ['pick-list', slug, warehouseId, includeCheckouts],
    queryFn: () =>
      apiFetch<PickReservation[]>(
        `/api/teams/${slug}/pick-list?warehouseId=${warehouseId}&includeCheckouts=${includeCheckouts}`
      ),
    enabled: !!slug,
  });

  // Pickers walk the shelves by item, not by order: one line per item and
  // warehouse with everything the listed orders need of it.
  const pickTotals = useMemo(() => {
    const totals = new Map<string, { sku: string; name: string; warehouse: string; quantity: number; orders: number }>();
    for (const reservation of reservations ?? []) {
      for (const line of reservation.lines) {
        const key = `${line.itemId}:${reservation.warehouse.id}`;
        const total = totals.get(key) ?? { sku: line.sku, name: line.name, warehouse: reservation.warehouse.name, quantity: 0, orders: 0 };
        total.quantity += line.quantity;
        total.orders += 1;
        totals.set(key, total);
      }
    }
    return [...totals.values()].sort((a, b) => a.warehouse.localeCompare(b.warehouse) || a.sku.localeCompare(b.sku));
  }, [reservations]);

  const columns = useMemo<AppColumnDef<PickReservation>[]>(
    () => [
      {
        accessorKey: 'reference',
        header: 'Order',
        size: 260,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <StoreReference reference={row.original.reference} />
            {row.original.purpose === 'checkout' && (
              <span className="badge bg-gray-100 text-gray-600 ring-gray-500/10">Checkout in progress</span>
            )}
          </div>
        ),
      },
      {
        id: 'items',
        accessorFn: (r) => r.lines.map((line) => `${line.sku} × ${line.quantity} ${line.name}`).join(', '),
        header: 'Items',
        size: 360,
        enableSorting: false,
        cell: ({ row }) => (
          <ul className="space-y-0.5 py-1 text-sm">
            {row.original.lines.map((line) => (
              <li key={line.itemId} className="truncate">
                <span className="font-medium">
                  {line.sku} × {line.quantity}
                </span>{' '}
                <span className="text-gray-500">{line.name}</span>
              </li>
            ))}
          </ul>
        ),
      },
      { accessorFn: (r) => r.warehouse.name, id: 'warehouse', header: 'Warehouse', size: 180 },
      {
        accessorKey: 'createdAt',
        header: 'Held since',
        size: 190,
        cell: ({ getValue }) => new Date(getValue<string>()).toLocaleString(),
      },
      { accessorKey: 'units', header: 'Units', size: 100 },
    ],
    []
  );

  return (
    <Layout title="To pick & ship" icon={PackageOpen} iconTone="fuchsia">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Store orders whose stock is held here until the store records the shipment.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={includeCheckouts} onChange={(e) => setIncludeCheckouts(e.target.checked)} />
            Include checkouts in progress
          </label>
          <select className="input w-auto" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">All warehouses</option>
            {warehouses?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {pickTotals.length > 0 && (
        <div className="card mb-6 p-0">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <h2 className="section-title">Pick totals</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-5 py-2 font-medium">SKU</th>
                <th className="px-5 py-2 font-medium">Item</th>
                <th className="px-5 py-2 font-medium">Warehouse</th>
                <th className="px-5 py-2 text-right font-medium">Orders</th>
                <th className="px-5 py-2 text-right font-medium">Pick</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pickTotals.map((total) => (
                <tr key={`${total.sku}:${total.warehouse}`}>
                  <td className="px-5 py-2 font-mono text-xs">{total.sku}</td>
                  <td className="px-5 py-2 text-gray-700">{total.name}</td>
                  <td className="px-5 py-2 text-gray-500">{total.warehouse}</td>
                  <td className="px-5 py-2 text-right text-gray-500">{total.orders}</td>
                  <td className="px-5 py-2 text-right font-semibold">{total.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DataTable
        columns={columns}
        data={reservations ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter orders…"
        emptyMessage="Nothing to pick"
        emptyDescription="Orders placed in the store appear here until they ship."
        emptyIcon={PackageOpen}
      />
    </Layout>
  );
}
