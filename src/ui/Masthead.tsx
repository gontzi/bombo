import { useBingoStore } from '../state/store';
import { IconMusicOff, IconMusicOn, IconSoundOff, IconSoundOn } from './icons';

/** Hall sign: brass-framed enamel with the house name. */
export function Masthead() {
  const sound = useBingoStore((s) => s.sound);
  const setSound = useBingoStore((s) => s.setSound);
  const music = useBingoStore((s) => s.music);
  const setMusic = useBingoStore((s) => s.setMusic);

  return (
    <header className="masthead">
      <div className="sign">
        <h1 className="sign__title">Bombo</h1>
        <p className="sign__tagline">Sala de sorteos · desde hoy</p>
      </div>
      <button
        type="button"
        className="icon-button masthead__music"
        aria-pressed={music}
        aria-label="Música de fondo"
        title={music ? 'Quitar la música' : 'Poner música'}
        onClick={() => setMusic(!music)}
      >
        {music ? <IconMusicOn /> : <IconMusicOff />}
      </button>
      <button
        type="button"
        className="icon-button masthead__sound"
        aria-pressed={sound}
        aria-label="Sonido de la máquina"
        title={sound ? 'Silenciar' : 'Activar sonido'}
        onClick={() => setSound(!sound)}
      >
        {sound ? <IconSoundOn /> : <IconSoundOff />}
      </button>
    </header>
  );
}
