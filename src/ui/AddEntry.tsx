import { useState, type ClipboardEvent, type FormEvent } from 'react';
import { MAX_LABEL_LENGTH, parseLines } from '../domain/entries';
import { useWheelStore } from '../state/store';

export function AddEntry({ disabled }: { disabled: boolean }) {
  const [value, setValue] = useState('');
  const addEntries = useWheelStore((s) => s.addEntries);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (addEntries(parseLines(value)) > 0) setValue('');
  };

  // Pasting several lines adds each one as its own option.
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
        placeholder="Añade una opción o pega varias líneas"
        autoComplete="off"
        maxLength={MAX_LABEL_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onPaste={onPaste}
      />
      <button type="submit" className="add-entry__submit" disabled={disabled || !value.trim()}>
        Añadir
      </button>
    </form>
  );
}
