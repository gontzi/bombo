import type { SVGProps } from 'react';

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const satisfies SVGProps<SVGSVGElement>;

export const IconSoundOn = () => (
  <svg {...base}>
    <path d="M4 10v4h3l5 4V6L7 10H4z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);

export const IconSoundOff = () => (
  <svg {...base}>
    <path d="M4 10v4h3l5 4V6L7 10H4z" />
    <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
  </svg>
);

export const IconMusicOn = () => (
  <svg {...base}>
    <path d="M9 17V5l11-2v12" />
    <circle cx="6.5" cy="17" r="2.5" />
    <circle cx="17.5" cy="15" r="2.5" />
  </svg>
);

export const IconMusicOff = () => (
  <svg {...base}>
    <path d="M9 17V5l11-2v12" />
    <circle cx="6.5" cy="17" r="2.5" />
    <circle cx="17.5" cy="15" r="2.5" />
    <path d="M3 3l18 18" />
  </svg>
);
