import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ShoppingCart } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import NewButton from '@/components/NewButton';
import SidebarModal from '@/components/SidebarModal';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { useNewHotkey } from '@/lib/useNewHotkey';
import { useOpenNewFromQuery } from '@/lib/useOpenNewFromQuery';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type PO = {
  id: string;
  poNumber: string;
  status: string;
  currency: string;
  totalAmount: string | number;
  createdAt: string;
  supplier?: { name: string };
  warehouse?: { name: string };
};

type LineItem = { itemId: string; description: string; quantity: number; unitPrice: number };
const blankLine: LineItem = { itemId: '', description: '', quantity: 1, unitPrice: 0 };

export default function PurchaseOrders() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([blankLine]);
  const [creating, setCreating] = useState(false);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/suppliers?status=ACTIVE`),
    enabled: !!slug && createOpen,
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/warehouses`),
    enabled: !!slug && createOpen,
  });
  const { data: items } = useQuery({
    queryKey: ['items', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/items`),
    enabled: !!slug && createOpen,
  });

  const updateLine = (i: number, patch: Partial<LineItem>) => {
    setLineItems((lines) => lines.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  };

  const onItemChange = (i: number, itemId: string) => {
    const item = items?.find((it) => it.id === itemId);
    updateLine(i, {
      itemId,
      description: item ? `${item.sku} — ${item.name}` : '',
      unitPrice: item ? Number(item.costPrice) : 0,
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !warehouseId) {
      toast.error('Select a supplier and warehouse.');
      return;
    }
    setCreating(true);
    try {
      const po = await apiPost<{ id: string }>(`/api/teams/${slug}/purchase-orders`, {
        supplierId,
        warehouseId,
        currency: 'USD',
        tax: 0,
        shipping: 0,
        lineItems: lineItems.filter((li) => li.itemId),
      });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', slug] });
      router.push(`/teams/${slug}/purchase-orders/${po.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const { data: pos, isLoading } = useQuery({
    queryKey: ['purchase-orders', slug],
    queryFn: () => apiFetch<PO[]>(`/api/teams/${slug}/purchase-orders`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<PO>[]>(
    () => [
      { accessorKey: 'poNumber', header: 'PO #', size: 140 },
      { accessorFn: (p) => p.supplier?.name ?? '', id: 'supplier', header: 'Supplier', size: 220 },
      { accessorFn: (p) => p.warehouse?.name ?? '', id: 'warehouse', header: 'Warehouse', size: 180 },
      {
        accessorKey: 'totalAmount',
        header: 'Total',
        size: 140,
        cell: ({ row }) => `${row.original.currency} ${Number(row.original.totalAmount).toLocaleString()}`,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 170,
        cell: ({ getValue }) => <Badge status={getValue<string>()} />,
      },
    ],
    []
  );

  return (
    <Layout title="Purchase Orders" icon={ShoppingCart} iconTone="indigo">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New purchase order" />
      </div>

      <DataTable
        columns={columns}
        data={pos ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter purchase orders…"
        emptyMessage="No purchase orders yet"
        emptyDescription="Create one to replenish stock, or let the reorder agent draft one automatically."
        emptyIcon={ShoppingCart}
        getRowHref={(p) => `/teams/${slug}/purchase-orders/${p.id}`}
      />

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="New purchase order" width="lg">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Supplier</label>
              <select className="input" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select a supplier…</option>
                {suppliers?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Deliver to warehouse</label>
              <select className="input" required value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">Select a warehouse…</option>
                {warehouses?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Line items</label>
            <div className="space-y-2">
              {lineItems.map((li, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <select className="input sm:col-span-5" value={li.itemId} onChange={(e) => onItemChange(i, e.target.value)}>
                    <option value="">Select an item…</option>
                    {items?.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.sku} — {it.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input sm:col-span-2"
                    type="number"
                    min={1}
                    placeholder="Qty"
                    value={li.quantity}
                    onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                  />
                  <input
                    className="input sm:col-span-3"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Unit cost"
                    value={li.unitPrice}
                    onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-secondary mt-2"
              onClick={() => setLineItems((lines) => [...lines, blankLine])}
            >
              + Add line item
            </button>
          </div>

          <button className="btn-primary w-full" type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create purchase order'}
          </button>
        </form>
      </SidebarModal>
    </Layout>
  );
}
