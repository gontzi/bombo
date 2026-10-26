import { useState, type ClipboardEvent, type FormEvent } from 'react';
import { MAX_LABEL_LENGTH, parseLines } from '../domain/entries';
import { useBingoStore } from '../state/store';

export function AddEntry({ disabled }: { disabled: boolean }) {
  const [value, setValue] = useState('');
  const addEntries = useBingoStore((s) => s.addEntries);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (addEntries(parseLines(value)) > 0) setValue('');
  };

  // Pasting several lines adds a ball for each one.
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (!/\r?\n/.test(text.trim())) return;
    event.preventDefault();
    if (addEntries(parseLines(`${value}${text}`)) > 0) setValue('');
  };

  return (
    <form className="add-entry" onSubmit={submit}>
      <label htmlFor="add-entry-input" className="visually-hidden">
        Nueva opción
      </label>
      <input
        id="add-entry-input"
        className="add-entry__input"
        type="text"
        placeholder="Escribe una opción o pega una lista"
        autoComplete="off"
        maxLength={MAX_LABEL_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onPaste={onPaste}
      />
      <button type="submit" className="add-entry__submit" disabled={disabled || !value.trim()}>
        Meter bola
      </button>
    </form>
  );
}
