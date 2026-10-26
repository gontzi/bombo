import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MAX_LABEL_LENGTH, type Entry } from '../domain/entries';
import { useWheelStore } from '../state/store';
import { segmentColor } from '../theme/palette';
import { IconClose } from './icons';

interface RowProps {
  entry: Entry;
  index: number;
  total: number;
  disabled: boolean;
  isWinner: boolean;
  onRemove: (index: number) => void;
}

function EntryRow({ entry, index, total, disabled, isWinner, onRemove }: RowProps) {
  const [draft, setDraft] = useState(entry.label);
  const updateEntry = useWheelStore((s) => s.updateEntry);

  useEffect(() => setDraft(entry.label), [entry.label]);

  const commit = () => {
    const next = draft.trim();
    if (!next) setDraft(entry.label);
    else if (next !== entry.label) updateEntry(entry.id, next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setDraft(entry.label);
      requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
    }
  };

  return (
    <li className={`entry${isWinner ? ' is-winner' : ''}`}>
      <span className="entry__swatch" style={{ background: segmentColor(index, total).fill }} aria-hidden />
      <input
        className="entry__input"
        aria-label={`Opción ${index + 1} de ${total}`}
        value={draft}
        maxLength={MAX_LABEL_LENGTH}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="icon-button entry__remove"
        aria-label={`Eliminar ${entry.label}`}
        disabled={disabled}
        onClick={() => onRemove(index)}
      >
        <IconClose />
      </button>
    </li>
  );
}

export function EntryList({ disabled }: { disabled: boolean }) {
  const entries = useWheelStore((s) => s.entries);
  const winnerId = useWheelStore((s) => s.lastResult?.entryId);
  const removeEntry = useWheelStore((s) => s.removeEntry);
  const listRef = useRef<HTMLOListElement>(null);

  // Keep keyboard focus in the list after a row disappears.
  const onRemove = (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    removeEntry(entry.id);
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('.entry__remove');
      const next = buttons?.[Math.min(index, buttons.length - 1)];
      (next ?? document.getElementById('add-entry-input'))?.focus();
    });
  };

  if (entries.length === 0) {
    return (
      <p className="panel__empty">
        La rueda está vacía. Escribe una opción arriba o pega una lista, una por línea.
      </p>
    );
  }

  return (
    <ol className="entry-list" ref={listRef}>
      {entries.map((entry, index) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          index={index}
          total={entries.length}
          disabled={disabled}
          isWinner={entry.id === winnerId}
          onRemove={onRemove}
        />
      ))}
    </ol>
  );
}
