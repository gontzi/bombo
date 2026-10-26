import { create } from 'zustand';

/** Loading state of the 3D hall, for the DOM overlay. */
export const useSceneStatus = create<{ modelsReady: boolean; setModelsReady: () => void }>((set) => ({
  modelsReady: false,
  setModelsReady: () => set({ modelsReady: true }),
}));
