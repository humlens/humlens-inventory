import { Command } from 'cmdk';
import { useRouter } from 'next/router';
import { useSelector } from '@tanstack/react-store';
import {
  Inbox,
  LayoutDashboard,
  Package,
  Warehouse,
  ClipboardList,
  ArrowLeftRight,
  PackageOpen,
  SlidersHorizontal,
  ListChecks,
  Truck,
  ShoppingCart,
  PackageCheck,
  Sparkles,
  Settings,
  PlusCircle,
  Search,
} from 'lucide-react';
import { useState } from 'react';

import { appUiStore, closeCommandPalette, openAssistant, pushRecentItem } from '@/lib/store';
import { iconToneClasses, type IconTone } from '@/lib/iconTones';

const navCommands: { href: string; label: string; icon: typeof LayoutDashboard; tone: IconTone }[] = [
  { href: 'inbox', label: 'Inbox', icon: Inbox, tone: 'brand' },
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, tone: 'brand' },
  { href: 'items', label: 'Items', icon: Package, tone: 'blue' },
  { href: 'warehouses', label: 'Warehouses', icon: Warehouse, tone: 'amber' },
  { href: 'stock-levels', label: 'Stock Levels', icon: ClipboardList, tone: 'emerald' },
  { href: 'stock-transfers', label: 'Transfers', icon: ArrowLeftRight, tone: 'cyan' },
  { href: 'pick-list', label: 'To pick & ship', icon: PackageOpen, tone: 'fuchsia' },
  { href: 'stock-adjustments', label: 'Adjustments', icon: SlidersHorizontal, tone: 'orange' },
  { href: 'cycle-counts', label: 'Cycle Counts', icon: ListChecks, tone: 'violet' },
  { href: 'suppliers', label: 'Suppliers', icon: Truck, tone: 'rose' },
  { href: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, tone: 'indigo' },
  { href: 'receiving', label: 'Receiving', icon: PackageCheck, tone: 'teal' },
  { href: 'agent-actions', label: 'AI Agent Activity', icon: Sparkles, tone: 'purple' },
  { href: 'settings', label: 'Settings', icon: Settings, tone: 'gray' },
];

// `?new=1` opens the destination list page's create panel in place — see
// lib/useOpenNewFromQuery.ts — now that creation happens in a sidebar modal
// instead of on a separate /new route.
const createCommands = [
  { href: 'items?new=1', label: 'New item' },
  { href: 'warehouses?new=1', label: 'New warehouse' },
  { href: 'suppliers?new=1', label: 'New supplier' },
  { href: 'purchase-orders?new=1', label: 'New purchase order' },
  { href: 'stock-transfers?new=1', label: 'New stock transfer' },
  { href: 'stock-adjustments?new=1', label: 'New stock adjustment' },
  { href: 'cycle-counts?new=1', label: 'New cycle count' },
];

export default function CommandPalette() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const open = useSelector(appUiStore, (s) => s.commandPaletteOpen);
  const [query, setQuery] = useState('');

  // The mod+k shortcut lives in CommandPaletteLauncher, which loads this.

  // Anything typed can go to the assistant as a question or instruction.
  const ask = () => {
    closeCommandPalette();
    openAssistant(query);
    setQuery('');
  };

  const go = (href: string) => {
    const target = `/teams/${slug}/${href}`;
    pushRecentItem({ label: href, href: target });
    router.push(target);
    closeCommandPalette();
  };

  if (!slug) return null;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => (v ? undefined : closeCommandPalette())}
      label="Command palette"
      className="fixed inset-0 z-50"
    >
      <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-[2px]" onClick={closeCommandPalette} />
      <div className="relative mx-auto mt-[15vh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-popover">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4">
          <Search size={16} className="text-gray-400" />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Jump to a page, create something, or ask AI…"
            className="w-full bg-transparent py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 sm:block">
            Esc
          </kbd>
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-2">
          {!query.trim() && <Command.Empty className="px-3 py-6 text-center text-sm text-gray-400">No results found.</Command.Empty>}

          {query.trim() && (
            <Command.Group forceMount heading="Assistant" className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 [&_[cmdk-group-items]]:mt-1">
              <Command.Item
                forceMount
                value={`ask-ai ${query}`}
                onSelect={ask}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm normal-case tracking-normal text-gray-700 data-[selected=true]:bg-purple-50 data-[selected=true]:text-purple-700"
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${iconToneClasses.purple}`}>
                  <Sparkles size={13} strokeWidth={2.25} />
                </span>
                <span className="truncate">Ask AI: “{query.trim()}”</span>
              </Command.Item>
            </Command.Group>
          )}

          <Command.Group heading="Navigate" className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 [&_[cmdk-group-items]]:mt-1">
            {navCommands.map((c) => (
              <Command.Item
                key={c.href}
                onSelect={() => go(c.href)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700"
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${iconToneClasses[c.tone]}`}>
                  <c.icon size={13} strokeWidth={2.25} />
                </span>
                {c.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Create" className="mt-2 mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 [&_[cmdk-group-items]]:mt-1">
            {createCommands.map((c) => (
              <Command.Item
                key={c.href}
                onSelect={() => go(c.href)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700"
              >
                <PlusCircle size={16} className="text-gray-400" />
                {c.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
