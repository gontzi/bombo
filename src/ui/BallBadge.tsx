import type { CSSProperties } from 'react';
import { ballStyle } from '../theme/balls';

interface Props {
  ball: number;
  size?: 'sm' | 'md';
}

/** A bingo ball in miniature: shell colour, white disc, number. Same look as the 3D balls. */
export function BallBadge({ ball, size = 'sm' }: Props) {
  const style = ballStyle(ball);
  return (
    <span
      className={`ball-badge ball-badge--${size}`}
      style={{ '--shell': style.shell, '--ink': style.ink } as CSSProperties}
      aria-hidden
    >
      <span className="ball-badge__disc">{ball}</span>
    </span>
  );
}
