import { useWheelStore } from '../state/store';
import { ConfirmButton } from './ConfirmButton';

const timeFormat = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });

function formatWhen(at: number): string {
  const date = new Date(at);
  const today = new Date().toDateString() === date.toDateString();
  return today ? timeFormat.format(date) : `${dayFormat.format(date)} · ${timeFormat.format(date)}`;
}

export function History() {
  const history = useWheelStore((s) => s.history);
  const clearHistory = useWheelStore((s) => s.clearHistory);

  if (history.length === 0) {
    return <p className="panel__empty">Todavía no hay giros. Los resultados aparecerán aquí.</p>;
  }

  return (
    <>
      <ol className="history" reversed>
        {history.map((result, i) => (
          <li key={result.id} className="history__item">
            <span className="history__number" aria-hidden>
              {history.length - i}
            </span>
            <span className="history__label">{result.label}</span>
            <time className="history__time" dateTime={new Date(result.at).toISOString()}>
              {formatWhen(result.at)}
            </time>
          </li>
        ))}
      </ol>
      <div className="panel__footer">
        <span className="panel__count">
          {history.length} {history.length === 1 ? 'giro' : 'giros'}
        </span>
        <ConfirmButton onConfirm={clearHistory}>Borrar historial</ConfirmButton>
      </div>
    </>
  );
}
