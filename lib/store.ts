import { Store } from '@tanstack/store';

export type RecentItem = { label: string; href: string };

type AppUiState = {
  commandPaletteOpen: boolean;
  sidebarCollapsed: boolean;
  recentItems: RecentItem[];
  assistantOpen: boolean;
  /** A question to send as soon as the assistant opens (from the command palette). */
  assistantPrompt: string | null;
};

// A small TanStack Store for cross-page UI state — command palette
// visibility, sidebar collapse, and a "recently viewed" trail. Deliberately
// not server/query state (that stays in React Query); this is ephemeral
// client UI state that several unrelated components (Layout, CommandPalette,
// hotkey handlers) all need to read/write without prop drilling.
export const appUiStore = new Store<AppUiState>({
  commandPaletteOpen: false,
  sidebarCollapsed: false,
  recentItems: [],
  assistantOpen: false,
  assistantPrompt: null,
});

export const openCommandPalette = () =>
  appUiStore.setState((s) => ({ ...s, commandPaletteOpen: true }));

export const closeCommandPalette = () =>
  appUiStore.setState((s) => ({ ...s, commandPaletteOpen: false }));

export const toggleCommandPalette = () =>
  appUiStore.setState((s) => ({ ...s, commandPaletteOpen: !s.commandPaletteOpen }));

export const toggleSidebar = () =>
  appUiStore.setState((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }));

export const pushRecentItem = (item: RecentItem) =>
  appUiStore.setState((s) => ({
    ...s,
    recentItems: [item, ...s.recentItems.filter((r) => r.href !== item.href)].slice(0, 8),
  }));

export const openAssistant = (prompt?: string) =>
  appUiStore.setState((s) => ({ ...s, assistantOpen: true, assistantPrompt: prompt?.trim() || null }));

export const closeAssistant = () => appUiStore.setState((s) => ({ ...s, assistantOpen: false }));

export const toggleAssistant = () => appUiStore.setState((s) => ({ ...s, assistantOpen: !s.assistantOpen }));

export const takeAssistantPrompt = () => {
  const prompt = appUiStore.state.assistantPrompt;
  if (prompt) appUiStore.setState((s) => ({ ...s, assistantPrompt: null }));
  return prompt;
};
