import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ListChecks } from 'lucide-react';

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

type CycleCount = {
  id: string;
  name: string;
  status: string;
  warehouse: { name: string };
  _count?: { lines: number };
};

export default function CycleCounts() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const [name, setName] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

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

  const toggleItem = (id: string) => {
    setItemIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itemIds.length === 0) {
      toast.error('Select at least one item to count.');
      return;
    }
    setCreating(true);
    try {
      const cc = await apiPost<{ id: string }>(`/api/teams/${slug}/cycle-counts`, { name, warehouseId, itemIds });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['cycle-counts', slug] });
      router.push(`/teams/${slug}/cycle-counts/${cc.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const { data: cycleCounts, isLoading } = useQuery({
    queryKey: ['cycle-counts', slug],
    queryFn: () => apiFetch<CycleCount[]>(`/api/teams/${slug}/cycle-counts`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<CycleCount>[]>(
    () => [
      { accessorKey: 'name', header: 'Name', size: 280 },
      { accessorFn: (c) => c.warehouse.name, id: 'warehouse', header: 'Warehouse', size: 200 },
      { accessorFn: (c) => c._count?.lines ?? 0, id: 'lines', header: 'Items', size: 100 },
      { accessorKey: 'status', header: 'Status', size: 160, cell: ({ getValue }) => <Badge status={getValue<string>()} /> },
    ],
    []
  );

  return (
    <Layout title="Cycle Counts" icon={ListChecks} iconTone="violet">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New cycle count" />
      </div>

      <DataTable
        columns={columns}
        data={cycleCounts ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter cycle counts…"
        emptyMessage="No cycle counts yet"
        emptyDescription="Plan a count for a warehouse to reconcile expected stock against a physical count."
        emptyIcon={ListChecks}
        getRowHref={(c) => `/teams/${slug}/cycle-counts/${c.id}`}
      />

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="New cycle count" width="lg">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Warehouse</label>
            <select className="input" required value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Select a warehouse…</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Items to count</label>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
              {items?.map((i) => (
                <label key={i.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                  <input type="checkbox" checked={itemIds.includes(i.id)} onChange={() => toggleItem(i.id)} />
                  {i.sku} — {i.name}
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary w-full" type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create cycle count'}
          </button>
        </form>
      </SidebarModal>
    </Layout>
  );
}
