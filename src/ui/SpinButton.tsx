import { useSpin } from '../hooks/useSpin';

export function SpinButton() {
  const { isSpinning, canSpin, spin } = useSpin();
  const empty = !canSpin && !isSpinning;

  return (
    <div className="spin">
      <button
        type="button"
        className={`spin-button${isSpinning ? ' is-spinning' : ''}`}
        onClick={spin}
        disabled={empty}
        // Stays focusable while spinning; the store ignores the extra clicks.
        aria-disabled={isSpinning || undefined}
        aria-describedby="spin-hint"
      >
        <span className="spin-button__label">{isSpinning ? 'Girando…' : 'Girar'}</span>
      </button>
      <p id="spin-hint" className="spin__hint">
        {empty ? (
          'Añade al menos una opción'
        ) : (
          <>
            o pulsa <kbd>Espacio</kbd>
          </>
        )}
      </p>
    </div>
  );
}
