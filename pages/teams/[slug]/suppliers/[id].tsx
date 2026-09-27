import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import SidebarModal from '@/components/SidebarModal';
import SupplierForm from '@/components/forms/SupplierForm';
import { apiFetch, apiPut } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function SupplierDetail() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: supplier } = useQuery({
    queryKey: ['supplier', slug, id],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/suppliers/${id}`),
    enabled: !!slug && !!id,
  });

  const setStatus = async (status: string) => {
    setBusy(true);
    try {
      await apiPut(`/api/teams/${slug}/suppliers/${id}`, { status });
      toast.success('Updated.');
      queryClient.invalidateQueries({ queryKey: ['supplier', slug, id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!supplier) {
    return (
      <Layout title="Supplier">
        <p className="text-gray-400">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout title={supplier.name}>
      <div className="mb-4 flex items-center gap-3">
        <Badge status={supplier.status} />
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          <Pencil size={13} /> Edit
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <h2 className="section-title mb-3">Details</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd>{supplier.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Phone</dt>
                <dd>{supplier.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Lead time</dt>
                <dd>{supplier.leadTimeDays ? `${supplier.leadTimeDays} days` : '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <h2 className="section-title mb-3">Recent purchase orders</h2>
            <ul className="divide-y divide-gray-100 text-sm">
              {supplier.purchaseOrders?.map((po: any) => (
                <li key={po.id} className="flex items-center justify-between py-2">
                  <span>{po.poNumber}</span>
                  <Badge status={po.status} />
                </li>
              ))}
              {supplier.purchaseOrders?.length === 0 && <li className="py-2 text-gray-400">None yet.</li>}
            </ul>
          </div>
        </div>

        <div className="card space-y-2">
          {supplier.status === 'ACTIVE' ? (
            <button className="btn-secondary w-full" onClick={() => setStatus('INACTIVE')} disabled={busy}>
              Mark inactive
            </button>
          ) : (
            <button className="btn-primary w-full" onClick={() => setStatus('ACTIVE')} disabled={busy}>
              Mark active
            </button>
          )}
        </div>
      </div>

      <SidebarModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit supplier">
        <SupplierForm
          slug={slug}
          supplierId={id}
          initialValues={supplier}
          onSuccess={() => {
            setEditOpen(false);
            queryClient.invalidateQueries({ queryKey: ['supplier', slug, id] });
          }}
        />
      </SidebarModal>
    </Layout>
  );
}
