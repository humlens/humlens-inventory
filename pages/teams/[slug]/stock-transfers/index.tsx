import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeftRight } from 'lucide-react';

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

type Transfer = {
  id: string;
  quantity: number;
  status: string;
  item: { sku: string; name: string };
  fromWarehouse: { name: string };
  toWarehouse: { name: string };
};

const blankForm = { itemId: '', quantity: 1, fromWarehouseId: '', toWarehouseId: '', note: '' };

export default function StockTransfers() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiPost(`/api/teams/${slug}/stock-transfers`, form);
      toast.success('Transfer started — stock deducted from the source warehouse.');
      setCreateOpen(false);
      setForm(blankForm);
      queryClient.invalidateQueries({ queryKey: ['stock-transfers', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const { data: transfers, isLoading } = useQuery({
    queryKey: ['stock-transfers', slug],
    queryFn: () => apiFetch<Transfer[]>(`/api/teams/${slug}/stock-transfers`),
    enabled: !!slug,
  });

  const act = async (id: string, action: 'complete' | 'cancel') => {
    setBusyId(id);
    try {
      await apiPost(`/api/teams/${slug}/stock-transfers/${id}/action`, { action });
      toast.success('Updated.');
      queryClient.invalidateQueries({ queryKey: ['stock-transfers', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  };

  const columns = useMemo<AppColumnDef<Transfer>[]>(
    () => [
      { accessorFn: (t) => `${t.item.sku} ${t.item.name}`, id: 'item', header: 'Item', size: 240 },
      { accessorFn: (t) => t.fromWarehouse.name, id: 'from', header: 'From', size: 160 },
      { accessorFn: (t) => t.toWarehouse.name, id: 'to', header: 'To', size: 160 },
      { accessorKey: 'quantity', header: 'Qty', size: 100 },
      { accessorKey: 'status', header: 'Status', size: 150, cell: ({ getValue }) => <Badge status={getValue<string>()} /> },
      {
        id: 'actions',
        header: '',
        size: 220,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === 'IN_TRANSIT' ? (
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                className="btn-secondary"
                onClick={() => act(row.original.id, 'complete')}
                disabled={busyId === row.original.id}
              >
                Complete
              </button>
              <button
                className="btn-ghost"
                onClick={() => act(row.original.id, 'cancel')}
                disabled={busyId === row.original.id}
              >
                Cancel
              </button>
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId]
  );

  return (
    <Layout title="Stock Transfers" icon={ArrowLeftRight} iconTone="cyan">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New transfer" />
      </div>

      <DataTable
        columns={columns}
        data={transfers ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter transfers…"
        emptyMessage="No transfers yet"
        emptyDescription="Move stock between warehouses — the source is deducted immediately, the destination on completion."
        emptyIcon={ArrowLeftRight}
      />

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="New stock transfer">
        <form onSubmit={submitTransfer} className="space-y-4">
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
            <label className="label">Quantity</label>
            <input
              className="input"
              type="number"
              min={1}
              required
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">From warehouse</label>
              <select
                className="input"
                required
                value={form.fromWarehouseId}
                onChange={(e) => setForm({ ...form, fromWarehouseId: e.target.value })}
              >
                <option value="">Select…</option>
                {warehouses?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">To warehouse</label>
              <select
                className="input"
                required
                value={form.toWarehouseId}
                onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })}
              >
                <option value="">Select…</option>
                {warehouses?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button className="btn-primary w-full" type="submit" disabled={creating}>
            {creating ? 'Starting…' : 'Start transfer'}
          </button>
        </form>
      </SidebarModal>
    </Layout>
  );
}
