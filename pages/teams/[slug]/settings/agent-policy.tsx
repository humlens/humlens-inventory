import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import AiModelCard from '@/components/settings/AiModelCard';
import SettingsLayout from '@/components/settings/SettingsLayout';
import { settingsTabs } from '@/components/settings/tabs';
import { apiFetch, apiPut } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function AgentPolicySettings() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const { data: policy } = useQuery({
    queryKey: ['agent-policy', slug],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/agent-policy`),
    enabled: !!slug,
  });

  useEffect(() => {
    if (policy) setForm(policy);
  }, [policy]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPut(`/api/teams/${slug}/agent-policy`, {
        autoReorderEnabled: form.autoReorderEnabled,
        autoReorderMaxAmount: Number(form.autoReorderMaxAmount),
        deadStockThresholdDays: Number(form.deadStockThresholdDays),
        cycleCountVarianceThresholdPct: Number(form.cycleCountVarianceThresholdPct),
      });
      toast.success('Policy updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  if (!form) {
    return (
      <SettingsLayout tabs={settingsTabs} active="agent-policy">
        <p className="text-gray-400">Loading…</p>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout
      tabs={settingsTabs}
      active="agent-policy"
      description="These limits govern what the autonomous inventory agents may do without a human in the loop. A hard platform-wide ceiling always applies on top of whatever is set here."
    >
      <form onSubmit={save} className="card max-w-xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Auto-draft reorder purchase orders</p>
            <p className="text-xs text-gray-500">
              When an item with a preferred supplier hits its reorder point, draft a PO automatically.
            </p>
          </div>
          <input
            type="checkbox"
            checked={form.autoReorderEnabled}
            onChange={(e) => setForm({ ...form, autoReorderEnabled: e.target.checked })}
          />
        </div>
        {form.autoReorderEnabled && (
          <div>
            <label className="label">Auto-reorder ceiling (USD, per PO)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.autoReorderMaxAmount}
              onChange={(e) => setForm({ ...form, autoReorderMaxAmount: e.target.value })}
            />
          </div>
        )}

        <div>
          <label className="label">Dead-stock alert threshold (days with no issue)</label>
          <input
            className="input"
            type="number"
            min={1}
            value={form.deadStockThresholdDays}
            onChange={(e) => setForm({ ...form, deadStockThresholdDays: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Cycle count variance alert threshold (%)</label>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            value={form.cycleCountVarianceThresholdPct}
            onChange={(e) => setForm({ ...form, cycleCountVarianceThresholdPct: e.target.value })}
          />
        </div>

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Save policy'}
        </button>
      </form>

      <div className="mt-6">
        <AiModelCard slug={slug} />
      </div>
    </SettingsLayout>
  );
}
