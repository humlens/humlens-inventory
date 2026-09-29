import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/router';
import { Chat, useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useSelector } from '@tanstack/react-store';
import { useHotkeys } from 'react-hotkeys-hook';
import { ArrowUp, Loader2, RotateCcw, Sparkles, Square, X } from 'lucide-react';

import { appUiStore, closeAssistant, takeAssistantPrompt, toggleAssistant } from '@/lib/store';
import Markdown from './Markdown';
import ProposalCard, { isProposal } from './ProposalCard';

// The in-app assistant: a side panel on every team page. The conversation
// lives in a Chat object per team, outside React, so it survives moving
// between pages (each page renders its own Layout). Replies stream from
// /api/teams/[slug]/assistant; changes come back as approval cards.

const chats = new Map<string, Chat<UIMessage>>();
function chatFor(slug: string) {
  let chat = chats.get(slug);
  if (!chat) {
    chat = new Chat({ id: `assistant-${slug}`, transport: new DefaultChatTransport({ api: `/api/teams/${slug}/assistant` }) });
    chats.set(slug, chat);
  }
  return chat;
}

// The API answers errors as { error: { message } }; the transport passes the raw body on.
function errorText(error: Error) {
  try {
    return (JSON.parse(error.message) as { error?: { message?: string } }).error?.message || error.message;
  } catch {
    return error.message || 'Something went wrong.';
  }
}

type ToolPart = { type: string; toolCallId: string; state: string; output?: unknown; errorText?: string };

export type AssistantConfig = {
  /** Shown under the name, e.g. "Stock, sales and suppliers". */
  tagline: string;
  suggestions: string[];
  /** What each tool is doing, for the progress line, e.g. { get_demand: 'Checking sales' }. */
  toolLabels: Record<string, string>;
};

export default function AssistantPanel({ config }: { config: AssistantConfig }) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const open = useSelector(appUiStore, (s) => s.assistantOpen);
  const pendingPrompt = useSelector(appUiStore, (s) => s.assistantPrompt);

  // The mod+j shortcut lives in AssistantLauncher, which loads this panel.
  if (!slug) return null;
  return <Panel key={slug} slug={slug} open={open} pendingPrompt={pendingPrompt} config={config} />;
}

function Panel({ slug, open, pendingPrompt, config }: { slug: string; open: boolean; pendingPrompt: string | null; config: AssistantConfig }) {
  const router = useRouter();
  const { messages, sendMessage, status, stop, error, setMessages, clearError } = useChat({ chat: chatFor(slug) });
  const [input, setInput] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const busy = status === 'submitted' || status === 'streaming';

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    clearError();
    void sendMessage({ text: trimmed }, { body: { page: router.asPath } });
    setInput('');
  };

  // A question typed into the command palette.
  useEffect(() => {
    if (open && pendingPrompt) {
      const prompt = takeAssistantPrompt();
      if (prompt) send(prompt);
    }
    if (open) textarea.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingPrompt]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
    if (e.key === 'Escape') closeAssistant();
  };

  const last = messages[messages.length - 1];
  const runningTool = busy && last?.role === 'assistant'
    ? (last.parts as ToolPart[]).filter((p) => p.type.startsWith('tool-') && (p.state === 'input-streaming' || p.state === 'input-available')).pop()
    : undefined;
  const progress = runningTool ? config.toolLabels[runningTool.type.slice(5)] ?? 'Working' : 'Thinking';

  return (
    <>
      {open && <div aria-hidden className="fixed inset-0 z-40 bg-gray-900/20 sm:hidden" onClick={closeAssistant} />}
      <aside
        aria-label="Assistant"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-gray-200 bg-gray-50 shadow-popover transition-transform duration-200 ease-out sm:w-[420px] ${
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 border-b border-gray-200 bg-white px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
            <Sparkles size={16} strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-sm font-semibold text-gray-900">Assistant</p>
            <p className="truncate text-xs text-gray-400">{config.tagline}</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => {
                stop();
                setMessages([]);
                clearError();
              }}
              title="New conversation"
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <RotateCcw size={15} />
            </button>
          )}
          <button onClick={closeAssistant} title="Close (Esc)" className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={17} />
          </button>
        </div>

        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="pt-6">
              <p className="text-sm text-gray-600">Ask about anything in your workspace, or tell me what to prepare. I&apos;ll show changes for you to approve before anything happens.</p>
              <div className="mt-4 space-y-2">
                {config.suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-[13px] text-gray-700 shadow-card hover:border-brand-200 hover:bg-brand-50/40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-[13px] text-white">
                  {message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')}
                </div>
              </div>
            ) : (
              <div key={message.id} className="space-y-2 text-[13px] leading-relaxed text-gray-700">
                {message.parts.map((part, i) => {
                  if (part.type === 'text') return part.text.trim() ? <Markdown key={i} text={part.text} /> : null;
                  if (!part.type.startsWith('tool-')) return null;
                  const tool = part as unknown as ToolPart;
                  if (tool.state === 'output-available' && isProposal(tool.output)) return <ProposalCard key={tool.toolCallId} slug={slug} proposal={tool.output} />;
                  if (tool.state === 'output-error') return <p key={tool.toolCallId} className="text-xs text-amber-700">{tool.errorText}</p>;
                  return null;
                })}
              </div>
            )
          )}

          {busy && (
            <p className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={13} className="animate-spin" /> {progress}…
            </p>
          )}
          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{errorText(error)}</div>
          )}
        </div>

        <div className="border-t border-gray-200 bg-white p-3">
          <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100">
            <textarea
              ref={textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask or tell me what to do…"
              className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none [field-sizing:content]"
            />
            {busy ? (
              <button onClick={() => stop()} title="Stop" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                <Square size={11} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => send(input)}
                disabled={!input.trim()}
                title="Send (Enter)"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white disabled:bg-gray-200"
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-gray-400">Enter to send · Shift+Enter for a new line · ⌘J to open or close</p>
        </div>
      </aside>
    </>
  );
}
