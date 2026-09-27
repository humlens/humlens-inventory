import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import Layout from '@/components/Layout';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

const types = [
  { value: 'RECEIPT', label: 'Receipt (stock in)' },
  { value: 'ISSUE', label: 'Issue (stock out)' },
  { value: 'ADJUSTMENT_IN', label: 'Adjustment in' },
  { value: 'ADJUSTMENT_OUT', label: 'Adjustment out' },
];

export default function RecordMovement() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const aiMode = router.query.ai === '1';

  const [prompt, setPrompt] = useState('');
  const [form, setForm] = useState({ itemId: '', warehouseId: '', type: 'RECEIPT', quantity: 1, note: '' });
  const [loading, setLoading] = useState(false);
  // The agent proposal behind a plain-English draft: submitting approves it,
  // so the movement is recorded once and the inbox shows it as done.
  const [draftActionId, setDraftActionId] = useState<string | null>(null);

  const { data: items } = useQuery({
    queryKey: ['items', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/items`),
    enabled: !!slug,
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/warehouses`),
    enabled: !!slug,
  });

  const draftWithAi = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const draft = await apiPost<{ actionId: string | null; itemId: string | null; warehouseId: string | null; type: string; quantity: number; note: string }>(
        `/api/teams/${slug}/stock-transactions/draft-from-prompt`,
        { prompt }
      );
      if (!draft.itemId || !draft.warehouseId) {
        toast.error("Couldn't confidently match that to an item and warehouse — check the prefilled form.");
      } else {
        toast.success('Drafted — review before submitting.');
      }
      setDraftActionId(draft.actionId);
      setForm({
        itemId: draft.itemId ?? '',
        warehouseId: draft.warehouseId ?? '',
        type: draft.type,
        quantity: draft.quantity,
        note: draft.note,
      });
      router.replace(`/teams/${slug}/stock-levels/record`, undefined, { shallow: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (draftActionId) {
        await apiPost(`/api/teams/${slug}/agent-actions/${draftActionId}/approve`, {
          args: { ...form, quantity: Number(form.quantity), note: form.note || undefined },
        });
      } else {
        await apiPost(`/api/teams/${slug}/stock-transactions`, form);
      }
      toast.success('Recorded.');
      router.push(`/teams/${slug}/stock-levels`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Record stock movement">
      <div className="mb-4 flex max-w-lg gap-2">
        {!aiMode ? (
          <button className="btn-secondary" onClick={() => router.push({ query: { ...router.query, ai: '1' } })}>
            Describe it in plain language instead
          </button>
        ) : (
          <button className="btn-secondary" onClick={() => router.push({ query: { slug } })}>
            Use the manual form instead
          </button>
        )}
      </div>

      {aiMode ? (
        <form onSubmit={draftWithAi} className="card max-w-lg space-y-4">
          <div>
            <label className="label">Describe the stock movement</label>
            <textarea
              className="input min-h-28"
              placeholder="e.g. received 50 units of blue widgets from the supplier at the main warehouse"
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Drafting…' : 'Draft with AI'}
          </button>
        </form>
      ) : (
        <form onSubmit={submit} className="card max-w-lg space-y-4">
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
            <label className="label">Movement type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
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
          <div>
            <label className="label">Note</label>
            <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Recording…' : 'Record movement'}
          </button>
        </form>
      )}
    </Layout>
  );
}
