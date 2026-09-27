import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function CycleCountDetail() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const { data: cycleCount } = useQuery({
    queryKey: ['cycle-count', slug, id],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/cycle-counts/${id}`),
    enabled: !!slug && !!id,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['cycle-count', slug, id] });

  const start = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/teams/${slug}/cycle-counts/${id}/start`);
      toast.success('Count started.');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const lines = Object.entries(counts)
      .filter(([, qty]) => qty !== undefined)
      .map(([lineId, countedQty]) => ({ lineId, countedQty }));

    if (lines.length === 0) {
      toast.error('Enter at least one counted quantity.');
      return;
    }

    setBusy(true);
    try {
      await apiPost(`/api/teams/${slug}/cycle-counts/${id}/submit`, { lines });
      toast.success('Counts submitted.');
      setCounts({});
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!cycleCount) {
    return (
      <Layout title="Cycle count">
        <p className="text-gray-400">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout title={cycleCount.name}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge status={cycleCount.status} />
          <span className="text-sm text-gray-500">{cycleCount.warehouse.name}</span>
        </div>
        {cycleCount.status === 'PLANNED' && (
          <button className="btn-primary" onClick={start} disabled={busy}>
            Start count
          </button>
        )}
      </div>

      <div className="card">
        <table className="page-table">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="pb-2">Item</th>
              <th className="pb-2">Expected</th>
              <th className="pb-2">Counted</th>
              <th className="pb-2">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cycleCount.lines.map((line: any) => (
              <tr key={line.id}>
                <td className="py-2">
                  {line.item.sku} — {line.item.name}
                </td>
                <td className="py-2">{line.expectedQty}</td>
                <td className="py-2">
                  {cycleCount.status === 'IN_PROGRESS' && line.countedQty === null ? (
                    <input
                      className="input w-24"
                      type="number"
                      min={0}
                      value={counts[line.id] ?? ''}
                      onChange={(e) => setCounts({ ...counts, [line.id]: Number(e.target.value) })}
                    />
                  ) : (
                    (line.countedQty ?? '—')
                  )}
                </td>
                <td className="py-2">
                  {line.varianceQty !== null ? (
                    <span className={line.varianceQty === 0 ? 'text-gray-500' : line.varianceQty > 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {line.varianceQty > 0 ? `+${line.varianceQty}` : line.varianceQty}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {cycleCount.status === 'IN_PROGRESS' && (
          <button className="btn-primary mt-4" onClick={submit} disabled={busy}>
            Submit counts
          </button>
        )}
      </div>
    </Layout>
  );
}
