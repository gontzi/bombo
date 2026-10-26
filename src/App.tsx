import { Suspense, lazy } from 'react';
import { useHotkeys } from './hooks/useHotkeys';
import { useWheelStore } from './state/store';
import { Announcer } from './ui/Announcer';
import { EntryPanel } from './ui/EntryPanel';
import { Masthead } from './ui/Masthead';
import { ResultBanner } from './ui/ResultBanner';
import { SceneBoundary } from './ui/SceneBoundary';
import { SpinButton } from './ui/SpinButton';

const WheelStage = lazy(() => import('./scene/WheelStage'));

export function App() {
  useHotkeys();
  const isEmpty = useWheelStore((s) => s.entries.length === 0);

  return (
    <div className="app">
      <main className="stage" id="stage">
        <Masthead />
        <div className="stage__canvas">
          <SceneBoundary>
            <Suspense fallback={<div className="stage__loading" aria-hidden />}>
              <WheelStage />
            </Suspense>
          </SceneBoundary>
          {isEmpty && <p className="stage__empty">Añade opciones para llenar la rueda</p>}
        </div>
        <ResultBanner />
      </main>
      <div className="controls">
        <SpinButton />
      </div>
      <aside className="sidebar" aria-label="Opciones e historial">
        <EntryPanel />
      </aside>
      <Announcer />
    </div>
  );
}
