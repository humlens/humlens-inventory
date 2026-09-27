import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Warehouse } from 'lucide-react';

import Layout from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import NewButton from '@/components/NewButton';
import SidebarModal from '@/components/SidebarModal';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { useNewHotkey } from '@/lib/useNewHotkey';
import { useOpenNewFromQuery } from '@/lib/useOpenNewFromQuery';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

const blankForm = { name: '', code: '', city: '', state: '', country: '', isDefault: false };

export default function Warehouses() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const [form, setForm] = useState(blankForm);
  const [creating, setCreating] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiPost(`/api/teams/${slug}/warehouses`, form);
      toast.success('Warehouse created.');
      setCreateOpen(false);
      setForm(blankForm);
      queryClient.invalidateQueries({ queryKey: ['warehouses', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ['warehouses', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/warehouses`),
    enabled: !!slug,
  });

  return (
    <Layout title="Warehouses" icon={Warehouse} iconTone="amber">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New warehouse" />
      </div>

      {!isLoading && warehouses?.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Warehouse}
            title="No warehouses yet"
            description="Add a warehouse to start receiving and tracking stock by location."
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {warehouses?.map((w) => (
          <div key={w.id} className="card">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{w.name}</h3>
              {w.isDefault && <span className="badge bg-brand-50 text-brand-700 ring-brand-600/20">Default</span>}
            </div>
            {w.code && <p className="text-xs text-gray-500">{w.code}</p>}
            <p className="mt-2 text-sm text-gray-500">
              {[w.city, w.state, w.country].filter(Boolean).join(', ') || 'No address on file'}
            </p>
          </div>
        ))}
      </div>

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="New warehouse">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Code</label>
            <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">City</label>
              <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className="label">State</label>
              <input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div>
              <label className="label">Country</label>
              <input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            Default warehouse (used when the agent creates auto-reorder purchase orders)
          </label>
          <button className="btn-primary w-full" type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create warehouse'}
          </button>
        </form>
      </SidebarModal>
    </Layout>
  );
}
