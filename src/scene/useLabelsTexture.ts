import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { createLabelsTexture, drawLabels, LABEL_FONT_FAMILY } from './labelsTexture';

function useFontReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    document.fonts
      .load(`620 64px ${LABEL_FONT_FAMILY}`)
      .catch(() => undefined)
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

/** Live texture with the current labels; redrawn whenever they change. */
export function useLabelsTexture(labels: readonly string[]) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const fontReady = useFontReady();

  const size = Math.min(2048, gl.capabilities.maxTextureSize);
  const { canvas, texture } = useMemo(() => createLabelsTexture(size), [size]);

  useEffect(() => {
    texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    return () => texture.dispose();
  }, [gl, texture]);

  const key = labels.join('\u0000');
  useEffect(() => {
    drawLabels(canvas, labels);
    texture.needsUpdate = true;
    invalidate();
    // `key` stands in for `labels`: redraw when the text changes, not the array identity.
  }, [canvas, texture, key, fontReady, invalidate]);

  return texture;
}
