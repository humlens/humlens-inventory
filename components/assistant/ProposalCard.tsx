import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, X } from 'lucide-react';

import { apiPost } from '@/lib/fetcher';

export type Proposal = {
  kind: 'proposal';
  id: string;
  title: string;
  reasoning: string | null;
  status: string;
  canApprove: boolean;
  link: string | null;
};

export const isProposal = (value: unknown): value is Proposal =>
  !!value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'proposal';

const OPEN = new Set(['PROPOSED', 'FAILED']);

// A change the assistant prepared (or an inbox item it surfaced). Approving
// or dismissing goes through the same inbox endpoints as the Inbox page, so
// the server checks permissions again and the change can be undone there.
export default function ProposalCard({ slug, proposal }: { slug: string; proposal: Proposal }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(proposal.status);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (verb: 'approve' | 'reject') => {
    setBusy(verb);
    setError(null);
    try {
      const row = await apiPost<{ status: string }>(`/api/teams/${slug}/agent-actions/${proposal.id}/${verb}`);
      setStatus(row?.status ?? (verb === 'approve' ? 'EXECUTED' : 'OVERRIDDEN_BY_HUMAN'));
      // Lists on the page behind the panel may now be out of date.
      queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const open = OPEN.has(status);
  const label =
    status === 'EXECUTED' ? 'Done' : status === 'OVERRIDDEN_BY_HUMAN' ? 'Dismissed' : status === 'REVERTED' ? 'Undone' : status === 'FAILED' ? 'Failed — try again' : 'Waiting for you';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-gray-900">{proposal.title}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            status === 'EXECUTED' ? 'bg-emerald-50 text-emerald-700' : open ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {label}
        </span>
      </div>
      {proposal.reasoning && <p className="mt-1 text-xs leading-relaxed text-gray-500">{proposal.reasoning}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {open && proposal.canApprove && (
          <>
            <button
              onClick={() => act('approve')}
              disabled={!!busy}
              className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              <Check size={13} /> {busy === 'approve' ? 'Applying…' : 'Approve'}
            </button>
            <button
              onClick={() => act('reject')}
              disabled={!!busy}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              <X size={13} /> Dismiss
            </button>
          </>
        )}
        {open && !proposal.canApprove && <span className="text-xs text-gray-400">Someone with approval rights needs to review this in the Inbox.</span>}
        {status === 'EXECUTED' && (
          <Link href={`/teams/${slug}/inbox`} className="text-xs text-gray-500 hover:text-gray-700">
            Undo from the Inbox
          </Link>
        )}
        {proposal.link && (
          <Link href={proposal.link} className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            Open <ExternalLink size={11} />
          </Link>
        )}
      </div>
    </div>
  );
}
