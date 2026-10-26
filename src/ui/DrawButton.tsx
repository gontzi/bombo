import { useDraw } from '../hooks/useDraw';

/**
 * The real draw button is the one on the table (scene/bingo/PushButton).
 * This control is its accessible twin: hidden until it gets keyboard focus,
 * always available to screen readers, and backed by the Space shortcut.
 */
export function DrawButton() {
  const { isDrawing, canDraw, draw } = useDraw();
  const empty = !canDraw && !isDrawing;

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
        {empty ? (
          'Mete al menos una bola en el bombo'
        ) : isDrawing ? (
          'Sorteando…'
        ) : (
          <>
            Pulsa el botón rojo de la mesa
            <span className="console__key">
              {' '}
              <span aria-hidden>·</span> <kbd>Espacio</kbd>
            </span>
          </>
        )}
      </p>
    </div>
  );
}
