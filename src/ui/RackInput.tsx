import type { ClipboardEvent, FormEvent } from 'react';
import { MAX_LABEL_LENGTH, parseLines } from '../domain/entries';
import { RACK_INPUT_ID, useRack } from '../state/rack';
import { useBingoStore } from '../state/store';

/**
 * Where options are really typed: an invisible field the scene keeps exactly
 * over the brass plate in front of the ball rack (scene/rack/RackPlate.tsx),
 * which shows the text engraved as it is typed. Enter drops it into the rack
 * as a ball; pasting several lines drops a ball for each.
 */
export function RackInput() {
  const open = useRack((s) => s.open);
  const draft = useRack((s) => s.draft);
  const { setDraft, setFocused } = useRack.getState();
  const drawing = useBingoStore((s) => s.draw !== null);
  // While the rack only tips itself to make room, the typing carries on.
  const tipping = useRack((s) => s.tipping && !s.auto);
  const locked = drawing || tipping;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (useBingoStore.getState().addPending(parseLines(draft)) > 0) setDraft('');
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (!/\r?\n/.test(text.trim())) return;
    event.preventDefault();
    if (useBingoStore.getState().addPending(parseLines(`${draft}${text}`)) > 0) setDraft('');
  };

  return (
    <form className="rack-input" onSubmit={submit} hidden={!open}>
      <input
        id={RACK_INPUT_ID}
        className="rack-input__field"
        type="text"
        aria-label="Nueva opción para el portabolas"
        enterKeyHint="enter"
        autoComplete="off"
        maxLength={MAX_LABEL_LENGTH}
        value={draft}
        disabled={locked}
        onChange={(e) => setDraft(e.target.value)}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </form>
  );
}
