import { useDraw } from '../hooks/useDraw';

/**
 * The machine's push button: a red mushroom cap in a brass bezel, mounted on
 * a small control plate. It stays pressed in while the cage turns.
 */
export function DrawButton() {
  const { isDrawing, canDraw, draw } = useDraw();
  const empty = !canDraw && !isDrawing;

  return (
    <div className="console">
      <button
        type="button"
        className={`push${isDrawing ? ' is-down' : ''}`}
        onClick={draw}
        disabled={empty}
        // Stays focusable while drawing; the store ignores extra presses.
        aria-disabled={isDrawing || undefined}
        aria-describedby="draw-hint"
      >
        <span className="push__bezel" aria-hidden>
          <span className="push__cap" />
        </span>
        <span className="push__label">{isDrawing ? 'Sorteando…' : 'Sacar bola'}</span>
      </button>
      <p id="draw-hint" className="console__hint">
        {empty ? (
          'Mete al menos una bola en el bombo'
        ) : (
          <>
            o pulsa <kbd>Espacio</kbd>
          </>
        )}
      </p>
    </div>
  );
}
