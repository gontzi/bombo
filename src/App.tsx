import { Suspense, lazy } from 'react';
import { useHotkeys } from './hooks/useHotkeys';
import { useSceneStatus } from './state/sceneStatus';
import { useBingoStore } from './state/store';
import { Announcer } from './ui/Announcer';
import { DrawButton } from './ui/DrawButton';
import { EntryPanel } from './ui/EntryPanel';
import { Masthead } from './ui/Masthead';
import { ResultPlate } from './ui/ResultPlate';
import { SceneBoundary } from './ui/SceneBoundary';

const BingoStage = lazy(() => import('./scene/BingoStage'));

function LoadingVeil() {
  const ready = useSceneStatus((s) => s.modelsReady);
  return (
    <div className={`veil${ready ? ' is-done' : ''}`} aria-hidden>
      <span className="veil__text">Preparando la sala…</span>
    </div>
  );
}

export function App() {
  useHotkeys();
  const isEmpty = useBingoStore((s) => s.entries.length === 0);

  return (
    <div className="app">
      <main className="stage" id="stage">
        <div className="stage__canvas">
          <SceneBoundary>
            <Suspense fallback={null}>
              <BingoStage />
            </Suspense>
          </SceneBoundary>
          <LoadingVeil />
        </div>
        <Masthead />
        {isEmpty && <p className="stage__empty">El bombo está vacío: mete opciones en el cartón</p>}
        <ResultPlate />
      </main>
      <div className="controls">
        <DrawButton />
      </div>
      <aside className="sidebar" aria-label="Opciones y bolas cantadas">
        <EntryPanel />
      </aside>
      <Announcer />
    </div>
  );
}
