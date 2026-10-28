import { create } from 'zustand';
import { useBingoStore } from './store';

/** The HTML field the typing really goes into, laid over the rack's plate (ui/RackInput.tsx). */
export const RACK_INPUT_ID = 'rack-input';

/**
 * The ball rack on the table is where options are added: tapping it brings
 * the camera in (`open`), and what is typed appears engraved on the brass
 * plate in front of it (`draft`, typed into an invisible field laid over the
 * plate, `focused` while it has the caret). Each Enter drops a ball into the
 * rack; the green button tips every waiting ball into the cage (`tipping`,
 * while they fly) and sends the camera back once the last lands.
 */
export const useRack = create<{
  open: boolean;
  tipping: boolean;
  /** The rack is tipping itself to make room (full, more waiting): typing carries on meanwhile. */
  auto: boolean;
  draft: string;
  focused: boolean;
  setOpen: (on: boolean) => void;
  setTipping: (on: boolean, auto?: boolean) => void;
  setDraft: (text: string) => void;
  setFocused: (on: boolean) => void;
}>((set) => ({
  open: false,
  tipping: false,
  auto: false,
  draft: '',
  focused: false,
  setOpen: (on) => set({ open: on }),
  setTipping: (on, auto = false) => set({ tipping: on, auto: on && auto }),
  setDraft: (text) => set({ draft: text }),
  setFocused: (on) => set({ focused: on }),
}));

/**
 * The green button (on the rack or its HTML twin): tips every ball in the
 * rack into the cage. `auto` when the rack does it itself, full with more
 * options waiting: then it stays open for them.
 */
export function tipRack(auto = false): boolean {
  const { pending, draw } = useBingoStore.getState();
  if (pending.length === 0 || draw || useRack.getState().tipping) return false;
  useRack.getState().setTipping(true, auto);
  return true;
}
