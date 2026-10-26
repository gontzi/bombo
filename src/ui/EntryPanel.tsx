import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { selectIsSpinning, useWheelStore } from '../state/store';
import { AddEntry } from './AddEntry';
import { BulkEditor } from './BulkEditor';
import { ConfirmButton } from './ConfirmButton';
import { EntryList } from './EntryList';
import { History } from './History';

type Tab = 'entries' | 'history';
const TABS: Tab[] = ['entries', 'history'];

export function EntryPanel() {
  const [tab, setTab] = useState<Tab>('entries');
  const [bulk, setBulk] = useState(false);
  const count = useWheelStore((s) => s.entries.length);
  const historyCount = useWheelStore((s) => s.history.length);
  const locked = useWheelStore(selectIsSpinning);
  const resetToSample = useWheelStore((s) => s.resetToSample);
  const clearEntries = useWheelStore((s) => s.clearEntries);
  const id = useId();
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ entries: null, history: null });

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const tabProps = (value: Tab) => ({
    ref: (el: HTMLButtonElement | null) => {
      tabRefs.current[value] = el;
    },
    role: 'tab',
    id: `${id}-tab-${value}`,
    'aria-selected': tab === value,
    'aria-controls': `${id}-panel-${value}`,
    tabIndex: tab === value ? 0 : -1,
    className: 'tabs__tab',
    onClick: () => setTab(value),
    onKeyDown: onTabKey,
  });

  return (
    <div className="panel">
      <div className="tabs" role="tablist" aria-label="Panel de la rueda">
        <button type="button" {...tabProps('entries')}>
          Opciones <span className="tabs__count">{count}</span>
        </button>
        <button type="button" {...tabProps('history')}>
          Historial <span className="tabs__count">{historyCount}</span>
        </button>
      </div>

      {tab === 'entries' ? (
        <section
          className="panel__body"
          role="tabpanel"
          id={`${id}-panel-entries`}
          aria-labelledby={`${id}-tab-entries`}
        >
          {locked && <p className="panel__lock">La lista se bloquea mientras gira la rueda.</p>}
          {bulk ? (
            <BulkEditor disabled={locked} onClose={() => setBulk(false)} />
          ) : (
            <>
              <AddEntry disabled={locked} />
              <EntryList disabled={locked} />
            </>
          )}
          <div className="panel__footer">
            <span className="panel__count">
              {count} {count === 1 ? 'opción' : 'opciones'}
            </span>
            {!bulk && (
              <button type="button" className="text-button" disabled={locked} onClick={() => setBulk(true)}>
                Editar como texto
              </button>
            )}
            <ConfirmButton onConfirm={resetToSample} disabled={locked} confirmLabel="¿Restablecer?">
              Ejemplo
            </ConfirmButton>
            <ConfirmButton onConfirm={clearEntries} disabled={locked || count === 0} confirmLabel="¿Vaciar?">
              Vaciar
            </ConfirmButton>
          </div>
        </section>
      ) : (
        <section
          className="panel__body"
          role="tabpanel"
          id={`${id}-panel-history`}
          aria-labelledby={`${id}-tab-history`}
        >
          <History />
        </section>
      )}
    </div>
  );
}
