import { useHotkeys } from 'react-hotkeys-hook';

// "n" opens a list page's create panel. react-hotkeys-hook ignores
// keypresses inside inputs/textareas/selects by default, so this never
// fights with typing an item name, warehouse code, etc.
export function useNewHotkey(onNew: () => void) {
  useHotkeys('n', (e) => {
    e.preventDefault();
    onNew();
  });
}
