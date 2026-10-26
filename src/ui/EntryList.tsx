import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MAX_LABEL_LENGTH, type Entry } from '../domain/entries';
import { useBingoStore } from '../state/store';
import { BallBadge } from './BallBadge';
import { IconClose } from './icons';

interface RowProps {
  entry: Entry;
  disabled: boolean;
  isWinner: boolean;
  onRemove: (id: string) => void;
}

function EntryRow({ entry, disabled, isWinner, onRemove }: RowProps) {
  const [draft, setDraft] = useState(entry.label);
  const updateEntry = useBingoStore((s) => s.updateEntry);

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
      <BallBadge ball={entry.ball} />
      <input
        className="entry__input"
        aria-label={`Bola ${entry.ball}`}
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
        aria-label={`Sacar del bombo la bola ${entry.ball}, ${entry.label}`}
        disabled={disabled}
        onClick={() => onRemove(entry.id)}
      >
        <IconClose />
      </button>
    </li>
  );
}

export function EntryList({ disabled }: { disabled: boolean }) {
  const entries = useBingoStore((s) => s.entries);
  const winnerId = useBingoStore((s) => s.lastResult?.entryId);
  const removeEntry = useBingoStore((s) => s.removeEntry);
  const listRef = useRef<HTMLOListElement>(null);

  // Keep keyboard focus in the list after a row disappears.
  const onRemove = (id: string) => {
    const index = entries.findIndex((e) => e.id === id);
    removeEntry(id);
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('.entry__remove');
      const next = buttons?.[Math.min(index, buttons.length - 1)];
      (next ?? document.getElementById('add-entry-input'))?.focus();
    });
  };

  if (entries.length === 0) {
    return (
      <p className="panel__empty">
        El bombo está vacío. Escribe una opción arriba o pega una lista, una por línea: cada una será una bola.
      </p>
    );
  }

  return (
    <ol className="entry-list" ref={listRef}>
      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          disabled={disabled}
          isWinner={entry.id === winnerId}
          onRemove={onRemove}
        />
      ))}
    </ol>
  );
}
