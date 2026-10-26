import { useWheelStore } from '../state/store';
import { IconClose } from './icons';

export function ResultBanner() {
  const result = useWheelStore((s) => s.lastResult);
  const stillListed = useWheelStore((s) => !!result && s.entries.some((e) => e.id === result.entryId));
  const removeWinner = useWheelStore((s) => s.removeWinner);
  const dismissResult = useWheelStore((s) => s.dismissResult);

  if (!result) return null;

  return (
    <section key={result.id} className="result" aria-labelledby="result-name">
      <p className="result__kicker">Ha salido</p>
      <h2 id="result-name" className="result__name">
        {result.label}
      </h2>
      <div className="result__actions">
        {stillListed && (
          <button type="button" className="text-button" onClick={removeWinner}>
            Quitar de la lista
          </button>
        )}
        <button type="button" className="icon-button" aria-label="Cerrar resultado" onClick={dismissResult}>
          <IconClose />
        </button>
      </div>
    </section>
  );
}
