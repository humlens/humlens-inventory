import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSelector } from '@tanstack/react-store';
import { useHotkeys } from 'react-hotkeys-hook';

import { appUiStore, toggleCommandPalette } from '@/lib/store';

// The command palette (and cmdk with it) loads the first time it's opened,
// not with every page, then stays mounted.
const CommandPalette = dynamic(() => import('@/components/CommandPalette'), { ssr: false });

export default function CommandPaletteLauncher() {
  const open = useSelector(appUiStore, (s) => s.commandPaletteOpen);
  const [loaded, setLoaded] = useState(false);

  // Global mod+k opens the palette from anywhere, including form fields —
  // this is the app's primary keyboard entry point, so it must never be
  // shadowed by an input's default handling.
  useHotkeys('mod+k', (e) => {
    e.preventDefault();
    toggleCommandPalette();
  }, { enableOnFormTags: true, enableOnContentEditable: true });

  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);

  return loaded ? <CommandPalette /> : null;
}
