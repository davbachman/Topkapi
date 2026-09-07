'use client';
// Vite's worker import avoids Vinext's server-side import.meta.url substitution.
// oxlint-disable-next-line import/default -- Vite supplies the worker constructor for ?worker imports.
import GeometryWorker from './worker?worker';
export function createGeometryWorker(): Worker {
  return new GeometryWorker();
}
