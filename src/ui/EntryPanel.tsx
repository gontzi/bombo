import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { MAX_ENTRIES } from '../domain/entries';
import { selectIsDrawing, useBingoStore } from '../state/store';
import { AddEntry } from './AddEntry';
import { BulkEditor } from './BulkEditor';
import { ConfirmButton } from './ConfirmButton';
import { EntryList } from './EntryList';
import { History } from './History';

type Tab = 'entries' | 'history';
const TABS: Tab[] = ['entries', 'history'];

/** The options "card": printed like a bingo cartón, with the balls in play and the ones already called. */
export function EntryPanel() {
  const [tab, setTab] = useState<Tab>('entries');
  const [bulk, setBulk] = useState(false);
  const count = useBingoStore((s) => s.entries.length);
  const historyCount = useBingoStore((s) => s.history.length);
  const locked = useBingoStore(selectIsDrawing);
  const resetToSample = useBingoStore((s) => s.resetToSample);
  const clearEntries = useBingoStore((s) => s.clearEntries);
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
    <div className="card">
      <header className="card__head">
        <p className="card__serial" aria-hidden>
          Cartón nº {String(count).padStart(3, '0')}
        </p>
        <div className="tabs" role="tablist" aria-label="Bombo">
          <button type="button" {...tabProps('entries')}>
            En el bombo <span className="tabs__count">{count}</span>
          </button>
          <button type="button" {...tabProps('history')}>
            Cantadas <span className="tabs__count">{historyCount}</span>
          </button>
        </div>
      </header>

      {tab === 'entries' ? (
        <section className="card__body" role="tabpanel" id={`${id}-panel-entries`} aria-labelledby={`${id}-tab-entries`}>
          {locked && <p className="card__lock">Bombo en marcha: la lista se bloquea hasta que salga la bola.</p>}
          {bulk ? (
            <BulkEditor disabled={locked} onClose={() => setBulk(false)} />
          ) : (
            <>
              <AddEntry disabled={locked} />
              <EntryList disabled={locked} />
            </>
          )}
          <footer className="panel__footer">
            <span className="panel__count">
              {count} {count === 1 ? 'bola' : 'bolas'}
              {count >= MAX_ENTRIES && ' · bombo lleno'}
            </span>
            {!bulk && (
              <button type="button" className="text-button" disabled={locked} onClick={() => setBulk(true)}>
                Pegar lista
              </button>
            )}
            <ConfirmButton onConfirm={resetToSample} disabled={locked} confirmLabel="¿Reponer?">
              Ejemplo
            </ConfirmButton>
            <ConfirmButton onConfirm={clearEntries} disabled={locked || count === 0} confirmLabel="¿Vaciar?">
              Vaciar
            </ConfirmButton>
          </footer>
        </section>
      ) : (
        <section className="card__body" role="tabpanel" id={`${id}-panel-history`} aria-labelledby={`${id}-tab-history`}>
          <History />
        </section>
      )}
    </div>
  );
}
