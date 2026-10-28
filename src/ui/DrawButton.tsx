import { useDraw } from '../hooks/useDraw';
import { TURNS_TO_DRAW, useCrank } from '../state/crank';
import { tipRack, useRack } from '../state/rack';
import { useBingoStore } from '../state/store';
import { ConfirmButton } from './ConfirmButton';

/**
 * The real draw button is the one on the table (scene/bingo/PushButton).
 * This control is its accessible twin: hidden until it gets keyboard focus,
 * always available to screen readers, and backed by the Space shortcut.
 */
export function DrawButton() {
  const { isDrawing, canDraw, draw } = useDraw();
  const empty = !canDraw && !isDrawing;
  // The winner is still in the tray (and in the list): it can be picked out.
  const winnerInTray = useBingoStore(
    (s) => !!s.lastResult && s.entries.some((e) => e.id === s.lastResult!.entryId),
  );
  const cranking = useCrank((s) => s.active);
  const turns = useCrank((s) => s.progress) * TURNS_TO_DRAW;
  const rackOpen = useRack((s) => s.open);
  const tipping = useRack((s) => s.tipping && !s.auto);
  const makingRoom = useRack((s) => s.tipping && s.auto);
  const waiting = useBingoStore((s) => s.pending.length);
  const inCage = useBingoStore((s) => s.entries.length);
  const letGo = () => useCrank.getState().setActive(false);

  return (
    <div className="console">
      <button
        type="button"
        className="draw-a11y"
        onClick={draw}
        disabled={empty}
        // Stays focusable while drawing; the store ignores extra presses.
        aria-disabled={isDrawing || undefined}
        aria-describedby="draw-hint"
      >
        {isDrawing ? 'Sorteando…' : 'Sacar bola'}
      </button>
      <p id="draw-hint" className="console__hint">
        {tipping ? (
          'Las bolas caen al bombo…'
        ) : makingRoom ? (
          'Portabolas lleno: sus bolas pasan al bombo para hacer sitio'
        ) : rackOpen ? (
          waiting > 0 ? (
            'Intro para otra · botón verde para echarlas al bombo · toca una bola para quitarla'
          ) : (
            'Escribe en la placa y pulsa Intro: cada opción cae al portabolas'
          )
        ) : cranking && !isDrawing ? (
          <>
            {empty
              ? 'Mete al menos una bola en el bombo'
              : turns >= TURNS_TO_DRAW
                ? '¡Suelta la manivela y sale bola!'
                : `Dale ${TURNS_TO_DRAW} vueltas a la manivela · ${Math.floor(turns)} de ${TURNS_TO_DRAW}`}
            <span className="console__key">
              {' '}
              <span aria-hidden>·</span> <kbd>Esc</kbd> para soltarla
            </span>
          </>
        ) : empty ? (
          'Toca el portabolas para meter opciones'
        ) : isDrawing ? (
          'Sorteando…'
        ) : winnerInTray ? (
          <>
            Toca la bola de la bandeja para quitarla
            <span className="console__key">
              {' '}
              <span aria-hidden>·</span> botón rojo para otra
            </span>
          </>
        ) : (
          <>
            Botón rojo o manivela para sacar bola · portabolas para opciones
            <span className="console__key">
              {' '}
              <span aria-hidden>·</span> <kbd>Espacio</kbd>
            </span>
          </>
        )}
      </p>
      {cranking && (
        <button type="button" className="console__back" onClick={letGo}>
          Soltar manivela
        </button>
      )}
      {rackOpen && (
        <div className="console__actions">
          <button
            type="button"
            className="console__back"
            disabled={tipping}
            onClick={() => useBingoStore.getState().addSample()}
          >
            Ejemplo
          </button>
          <ConfirmButton
            className="console__back"
            confirmLabel="¿Vaciar el bombo?"
            disabled={tipping || isDrawing || inCage === 0}
            onConfirm={() => useBingoStore.getState().clearEntries()}
          >
            Vaciar bombo
          </ConfirmButton>
          {/* The rack's green button, for the keyboard and screen readers. */}
          <button type="button" className="console__back console__tip" disabled={tipping || waiting === 0} onClick={() => tipRack()}>
            Echar al bombo
          </button>
          <button type="button" className="console__back" disabled={tipping} onClick={() => useRack.getState().setOpen(false)}>
            Listo
          </button>
        </div>
      )}
    </div>
  );
}
