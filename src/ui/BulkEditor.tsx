import { useEffect, useRef, useState } from 'react';
import { MAX_ENTRIES, parseLines } from '../domain/entries';
import { useWheelStore } from '../state/store';

interface Props {
  disabled: boolean;
  onClose: () => void;
}

/** The whole list as plain text, one option per line. */
export function BulkEditor({ disabled, onClose }: Props) {
  const entries = useWheelStore((s) => s.entries);
  const replaceAll = useWheelStore((s) => s.replaceAll);
  const [text, setText] = useState(() => entries.map((e) => e.label).join('\n'));
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => ref.current?.focus(), []);

  const count = parseLines(text).length;

  return (
    <div className="bulk">
      <label htmlFor="bulk-text" className="bulk__label">
        Una opción por línea
      </label>
      <textarea
        id="bulk-text"
        ref={ref}
        className="bulk__text"
        rows={10}
        spellCheck={false}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <div className="bulk__actions">
        <span className="bulk__count">
          {count} {count === 1 ? 'línea' : 'líneas'}
          {count > MAX_ENTRIES && ` · solo se usarán ${MAX_ENTRIES}`}
        </span>
        <button type="button" className="text-button" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="solid-button"
          disabled={disabled}
          onClick={() => {
            replaceAll(parseLines(text));
            onClose();
          }}
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
