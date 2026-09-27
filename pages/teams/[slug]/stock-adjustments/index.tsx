import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { SlidersHorizontal } from 'lucide-react';

import Layout from '@/components/Layout';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import NewButton from '@/components/NewButton';
import SidebarModal from '@/components/SidebarModal';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { useNewHotkey } from '@/lib/useNewHotkey';
import { useOpenNewFromQuery } from '@/lib/useOpenNewFromQuery';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type Adjustment = {
  id: string;
  quantityDelta: number;
  reason: string;
  createdAt: string;
  item: { sku: string; name: string };
  warehouse: { name: string };
  performedBy: { name: string };
};

const reasons = ['DAMAGE', 'LOSS', 'FOUND', 'CORRECTION', 'OTHER'];
const blankForm = { itemId: '', warehouseId: '', quantityDelta: 0, reason: 'CORRECTION', note: '' };

export default function StockAdjustments() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const [form, setForm] = useState(blankForm);
  const [creating, setCreating] = useState(false);

  const { data: items } = useQuery({
    queryKey: ['items', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/items`),
    enabled: !!slug && createOpen,
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/warehouses`),
    enabled: !!slug && createOpen,
  });

  const submitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiPost(`/api/teams/${slug}/stock-adjustments`, form);
      toast.success('Adjustment recorded.');
      setCreateOpen(false);
      setForm(blankForm);
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const { data: adjustments, isLoading } = useQuery({
    queryKey: ['stock-adjustments', slug],
    queryFn: () => apiFetch<Adjustment[]>(`/api/teams/${slug}/stock-adjustments`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<Adjustment>[]>(
    () => [
      { accessorFn: (a) => `${a.item.sku} ${a.item.name}`, id: 'item', header: 'Item', size: 260 },
      { accessorFn: (a) => a.warehouse.name, id: 'warehouse', header: 'Warehouse', size: 180 },
      {
        accessorKey: 'quantityDelta',
        header: 'Delta',
        size: 100,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return <span className={v > 0 ? 'text-emerald-600' : 'text-red-600'}>{v > 0 ? `+${v}` : v}</span>;
        },
      },
      { accessorKey: 'reason', header: 'Reason', size: 150 },
      { accessorFn: (a) => a.performedBy.name, id: 'performedBy', header: 'By', size: 160 },
      {
        accessorKey: 'createdAt',
        header: 'When',
        size: 160,
        cell: ({ getValue }) => new Date(getValue<string>()).toLocaleString(),
      },
    ],
    []
  );

  return (
    <Layout title="Stock Adjustments" icon={SlidersHorizontal} iconTone="orange">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New adjustment" />
      </div>

      <DataTable
        columns={columns}
        data={adjustments ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter adjustments…"
        emptyMessage="No adjustments yet"
        emptyDescription="Correct stock counts for damage, loss, or found inventory — each one lands in the ledger."
        emptyIcon={SlidersHorizontal}
      />

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="New stock adjustment">
        <form onSubmit={submitAdjustment} className="space-y-4">
          <div>
            <label className="label">Item</label>
            <select className="input" required value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })}>
              <option value="">Select an item…</option>
              {items?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.sku} — {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Warehouse</label>
            <select
              className="input"
              required
              value={form.warehouseId}
              onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
            >
              <option value="">Select a warehouse…</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Quantity change (negative to remove stock)</label>
            <input
              className="input"
              type="number"
              required
              value={form.quantityDelta}
              onChange={(e) => setForm({ ...form, quantityDelta: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Reason</label>
            <select className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button className="btn-primary w-full" type="submit" disabled={creating}>
            {creating ? 'Recording…' : 'Record adjustment'}
          </button>
        </form>
      </SidebarModal>
    </Layout>
  );
}
