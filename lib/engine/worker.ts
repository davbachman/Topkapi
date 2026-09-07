import { generate } from './generate';
import type { Layer, Bounds } from './types';
self.onmessage = (
  e: MessageEvent<{ id: number; layers: Layer[]; region: Bounds }>,
) => {
  const { id, layers, region } = e.data;
  try {
    const results = Object.fromEntries(
      layers.filter((l) => l.visible).map((l) => [l.id, generate(l, region)]),
    );
    self.postMessage({ id, results });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
