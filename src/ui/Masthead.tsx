import { useRack } from '../state/rack';
import { useBingoStore } from '../state/store';
import { startTour } from '../state/tour';
import { IconMusicOff, IconMusicOn, IconSoundOff, IconSoundOn } from './icons';

/** Sound controls over the hall. The hall's name is the neon sign on the back wall (scene/room/Room.tsx). */
export function Masthead() {
  const sound = useBingoStore((s) => s.sound);
  const setSound = useBingoStore((s) => s.setSound);
  const music = useBingoStore((s) => s.music);
  const setMusic = useBingoStore((s) => s.setMusic);

  return (
    <header className="masthead">
      <h1 className="visually-hidden">Bombo · Sala de sorteos</h1>
      {/* The rack on the table opens the options; this is the same for the keyboard and screen readers. */}
      <button type="button" className="visually-hidden-focusable masthead__options" onClick={() => useRack.getState().setOpen(true)}>
        Opciones del bombo
      </button>
      {/* Twin of the «¿Cómo se juega?» tent card on the table, which plays the guide again. */}
      <button type="button" className="visually-hidden-focusable masthead__options" onClick={() => startTour()}>
        Cómo funciona
      </button>
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
