import { useDraw } from '../hooks/useDraw';
import { useBingoStore } from '../state/store';
import { ballLetter } from '../theme/balls';
import { BallBadge } from './BallBadge';
import { IconClose } from './icons';

/**
 * The called ball, on a lit enamel plate like a hall's caller board:
 * letter and number, then the full option in large type.
 */
export function ResultPlate() {
  const result = useBingoStore((s) => s.lastResult);
  const stillListed = useBingoStore((s) => !!result && s.entries.some((e) => e.id === result.entryId));
  const removeWinner = useBingoStore((s) => s.removeWinner);
  const dismissResult = useBingoStore((s) => s.dismissResult);
  const { draw, canDraw } = useDraw();

  if (!result) return null;

  return (
    <section key={result.id} className="plate" aria-labelledby="plate-name">
      <div className="plate__ball">
        <BallBadge ball={result.ball} size="lg" />
      </div>
      <div className="plate__text">
        <p className="plate__call">
          ¡Bola! <span className="plate__number">{ballLetter(result.ball)}-{result.ball}</span>
        </p>
        <h2 id="plate-name" className="plate__name">
          {result.label}
        </h2>
        <div className="plate__actions">
          <button type="button" className="stamp-button" onClick={draw} disabled={!canDraw}>
            Sacar otra
          </button>
          {stillListed && (
            <button type="button" className="text-button" onClick={removeWinner}>
              Quitar del bombo
            </button>
          )}
        </div>
      </div>
      <button type="button" className="icon-button plate__close" aria-label="Cerrar resultado" onClick={dismissResult}>
        <IconClose />
      </button>
    </section>
  );
}
