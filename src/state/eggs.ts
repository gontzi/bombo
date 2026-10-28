import { create } from 'zustand';

/** How long the party lasts once the Konami code is typed, ms. */
export const PARTY_MS = 12000;

/** ↑ ↑ ↓ ↓ ← → ← → B A. */
export const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

/**
 * The hall's easter eggs that more than one part of it has to know about.
 * (The others keep to themselves: the smoking crank in scene/bingo/CrankSmoke,
 * the neon that shorts out in scene/room/Room, the sign that is not surprised
 * in scene/sign/WinnerSign.)
 */
export const useEggs = create<{
  /** Party mode (the Konami code) runs until this time (performance.now()). */
  partyUntil: number;
}>(() => ({ partyUntil: 0 }));

export const partyOn = () => performance.now() < useEggs.getState().partyUntil;
