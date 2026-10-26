import { useWheelStore } from '../state/store';
import { IconSoundOff, IconSoundOn } from './icons';

export function Masthead() {
  const sound = useWheelStore((s) => s.sound);
  const setSound = useWheelStore((s) => s.setSound);

  return (
    <header className="masthead">
      <h1 className="masthead__title">
        Rueda<span className="masthead__dot" aria-hidden>.</span>
      </h1>
      <p className="masthead__tagline">Escribe las opciones. Que decida la suerte.</p>
      <button
        type="button"
        className="icon-button masthead__sound"
        aria-pressed={sound}
        aria-label="Sonido"
        title={sound ? 'Silenciar' : 'Activar sonido'}
        onClick={() => setSound(!sound)}
      >
        {sound ? <IconSoundOn /> : <IconSoundOff />}
      </button>
    </header>
  );
}
