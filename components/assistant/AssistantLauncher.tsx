import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSelector } from '@tanstack/react-store';
import { useHotkeys } from 'react-hotkeys-hook';

import { appUiStore, toggleAssistant } from '@/lib/store';
import type { AssistantConfig } from './AssistantPanel';

// The assistant (and the AI SDK it brings) loads the first time it's opened,
// not with every page, then stays mounted so the conversation survives
// closing and reopening it.
const AssistantPanel = dynamic(() => import('./AssistantPanel'), { ssr: false });

export default function AssistantLauncher({ config }: { config: AssistantConfig }) {
  const open = useSelector(appUiStore, (s) => s.assistantOpen);
  const [loaded, setLoaded] = useState(false);

  useHotkeys('mod+j', (e) => {
    e.preventDefault();
    toggleAssistant();
  }, { enableOnFormTags: true, enableOnContentEditable: true });

  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);

  return loaded ? <AssistantPanel config={config} /> : null;
}
