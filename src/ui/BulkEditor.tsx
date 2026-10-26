import { useEffect, useRef, useState } from 'react';
import { MAX_ENTRIES, parseLines } from '../domain/entries';
import { useBingoStore } from '../state/store';

interface Props {
  disabled: boolean;
  onClose: () => void;
}

/** The whole list as plain text, one option per line. */
export function BulkEditor({ disabled, onClose }: Props) {
  const entries = useBingoStore((s) => s.entries);
  const replaceAll = useBingoStore((s) => s.replaceAll);
  const [text, setText] = useState(() => entries.map((e) => e.label).join('\n'));
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => ref.current?.focus(), []);

  const count = parseLines(text).length;

  return (
    <div className="bulk">
      <label htmlFor="bulk-text" className="bulk__label">
        Una opción por línea. Las que no cambies conservan su número de bola.
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
          {count} {count === 1 ? 'bola' : 'bolas'}
          {count > MAX_ENTRIES && ` · caben ${MAX_ENTRIES}`}
        </span>
        <button type="button" className="text-button" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="stamp-button"
          disabled={disabled}
          onClick={() => {
            replaceAll(parseLines(text));
            onClose();
          }}
        >
          Cargar en el bombo
        </button>
      </div>
    </div>
  );
}
