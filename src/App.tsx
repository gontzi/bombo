import { Suspense, lazy, useEffect } from 'react';
import { useHotkeys } from './hooks/useHotkeys';
import { useMusic } from './hooks/useMusic';
import { useSceneStatus } from './state/sceneStatus';
import { RACK_INPUT_ID, useRack } from './state/rack';
import { useBingoStore } from './state/store';
import { Announcer } from './ui/Announcer';
import { DrawButton } from './ui/DrawButton';
import { Masthead } from './ui/Masthead';
import { RackInput } from './ui/RackInput';
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
  useMusic();
  const isEmpty = useBingoStore((s) => s.entries.length === 0);
  const rackOpen = useRack((s) => s.open);

  // Ready to type on the plate as the camera arrives at the rack; closing it gives up the field.
  useEffect(() => {
    const input = document.getElementById(RACK_INPUT_ID) as HTMLInputElement | null;
    if (!rackOpen) {
      input?.blur();
      return;
    }
    const timer = setTimeout(() => input?.focus({ preventScroll: true }), 600);
    return () => clearTimeout(timer);
  }, [rackOpen]);

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
        {isEmpty && !rackOpen && <p className="stage__empty">El bombo está vacío: toca el portabolas para meter opciones</p>}
      </main>
      <div className="controls">
        <DrawButton />
      </div>
      <RackInput />
      <Announcer />
    </div>
  );
}
