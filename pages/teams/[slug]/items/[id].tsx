import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import SidebarModal from '@/components/SidebarModal';
import ItemForm from '@/components/forms/ItemForm';
import { apiFetch } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function ItemDetail() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const { data: item } = useQuery({
    queryKey: ['item', slug, id],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/items/${id}`),
    enabled: !!slug && !!id,
  });

  if (!item) {
    return (
      <Layout title="Item">
        <p className="text-gray-400">Loading…</p>
      </Layout>
    );
  }

  const totalOnHand = item.stockLevels.reduce((sum: number, l: any) => sum + l.onHand, 0);

  return (
    <Layout title={item.name}>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-gray-500">
          {item.sku} · {totalOnHand} {item.unitOfMeasure} on hand
        </span>
        {totalOnHand <= item.reorderPoint && <Badge status="PENDING_APPROVAL" />}
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
            <h2 className="section-title mb-3">Stock by warehouse</h2>
            <table className="page-table">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="pb-2">Warehouse</th>
                  <th className="pb-2">On hand</th>
                  <th className="pb-2">Reserved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {item.stockLevels.map((l: any) => (
                  <tr key={l.id}>
                    <td className="py-2">{l.warehouse.name}</td>
                    <td className="py-2">{l.onHand}</td>
                    <td className="py-2">{l.reserved}</td>
                  </tr>
                ))}
                {item.stockLevels.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-400">
                      No stock recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 className="section-title mb-3">Recent stock movement</h2>
            <ul className="divide-y divide-gray-100 text-sm">
              {item.stockTransactions.map((t: any) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <span>
                    {t.warehouse.name} · {t.performedBy.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{t.quantity}</span>
                    <Badge status={t.type} />
                  </div>
                </li>
              ))}
              {item.stockTransactions.length === 0 && <li className="py-2 text-gray-400">No movement yet.</li>}
            </ul>
          </div>
        </div>

        <div className="card space-y-3">
          <h2 className="section-title">Details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Category</dt>
              <dd>{item.category?.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Cost price</dt>
              <dd>${Number(item.costPrice).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Sell price</dt>
              <dd>${Number(item.sellPrice).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Reorder point</dt>
              <dd>{item.reorderPoint}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Reorder qty</dt>
              <dd>{item.reorderQty}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Preferred supplier</dt>
              <dd>{item.preferredSupplier?.name ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </div>

      <SidebarModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit item">
        <ItemForm
          slug={slug}
          itemId={id}
          initialValues={item}
          onSuccess={() => {
            setEditOpen(false);
            queryClient.invalidateQueries({ queryKey: ['item', slug, id] });
          }}
        />
      </SidebarModal>
    </Layout>
  );
}
