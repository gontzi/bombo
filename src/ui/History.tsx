import { useBingoStore } from '../state/store';
import { BallBadge } from './BallBadge';
import { ConfirmButton } from './ConfirmButton';

const timeFormat = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });

function formatWhen(at: number): string {
  const date = new Date(at);
  const today = new Date().toDateString() === date.toDateString();
  return today ? timeFormat.format(date) : `${dayFormat.format(date)} · ${timeFormat.format(date)}`;
}

/** Called balls, newest first. */
export function History() {
  const history = useBingoStore((s) => s.history);
  const clearHistory = useBingoStore((s) => s.clearHistory);

  if (history.length === 0) {
    return <p className="panel__empty">Aún no ha salido ninguna bola. Las cantadas se apuntan aquí.</p>;
  }

  return (
    <>
      <ol className="history" reversed>
        {history.map((result) => (
          <li key={result.id} className="history__item">
            <BallBadge ball={result.ball} />
            <span className="history__label">{result.label}</span>
            <time className="history__time" dateTime={new Date(result.at).toISOString()}>
              {formatWhen(result.at)}
            </time>
          </li>
        ))}
      </ol>
      <div className="panel__footer">
        <span className="panel__count">
          {history.length} {history.length === 1 ? 'bola cantada' : 'bolas cantadas'}
        </span>
        <ConfirmButton onConfirm={clearHistory} confirmLabel="¿Borrar?">
          Borrar historial
        </ConfirmButton>
      </div>
    </>
  );
}
