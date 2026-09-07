'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Bounds, Geometry, Project } from '@/lib/engine/types';
import { inspectFabrication } from '@/lib/engine/fabrication';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Range } from './controls';
export function FabricationDialog({
  project,
  region,
  onClose,
}: {
  project: Project;
  region: Bounds;
  onClose: () => void;
}) {
  const [minimum, setMinimum] = useState(project.units === 'mm' ? 0.8 : 0.03),
    [geometry, setGeometry] = useState<Record<string, Geometry> | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const w = new Worker(
      new URL('../../lib/engine/worker.ts', import.meta.url),
      { type: 'module' },
    );
    const timer = setTimeout(() => {
      w.terminate();
      setError('The analysis took too long. Zoom in or simplify the design.');
    }, 30000);
    w.onmessage = (e) => {
      clearTimeout(timer);
      if (e.data.error) setError(e.data.error);
      else if (
        Object.values(e.data.results as Record<string, Geometry>).some(
          (g) => g.truncated,
        )
      )
        setError('Zoom in or reduce repetition to analyze the full output.');
      else setGeometry(e.data.results);
      w.terminate();
    };
    w.onerror = (e) => {
      setError(e.message);
      clearTimeout(timer);
      w.terminate();
    };
    w.postMessage({
      id: 1,
      layers: project.layers,
      region: {
        minX: region.minX - 2,
        minY: region.minY - 2,
        maxX: region.maxX + 2,
        maxY: region.maxY + 2,
      },
    });
    return () => {
      clearTimeout(timer);
      w.terminate();
    };
  }, [project, region]);
  const reports = useMemo(
    () =>
      geometry ? inspectFabrication(project, geometry, region, minimum) : [],
    [project, geometry, region, minimum],
  );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="construction-dialog">
        <DialogHeader>
          <DialogTitle>Check output geometry</DialogTitle>
          <DialogDescription>
            {project.width.toFixed(2)} × {project.height.toFixed(2)}{' '}
            {project.units}. Measurements use the current output crop.
          </DialogDescription>
        </DialogHeader>
        <Range
          label="Minimum band width"
          value={minimum}
          min={project.units === 'mm' ? 0.1 : 0.004}
          max={project.units === 'mm' ? 10 : 0.4}
          step={project.units === 'mm' ? 0.1 : 0.004}
          unit={project.units}
          onChange={setMinimum}
        />
        {error ? (
          <p role="alert" className="editor-error">
            {error}
          </p>
        ) : !geometry ? (
          <output>Analyzing the output…</output>
        ) : (
          <div className="report-scroll">
            <table className="geometry-report">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Band width</th>
                  <th>Line length</th>
                  <th>Connected graphs</th>
                  <th>Interior open ends</th>
                  <th>Weave conflicts</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => (
                  <tr key={i}>
                    <th>{r.name}</th>
                    <td className={r.belowMinimum ? 'below-minimum' : ''}>
                      {r.bandWidth === null
                        ? 'Filled regions'
                        : `${r.bandWidth.toFixed(3)} ${project.units}${r.belowMinimum ? ' · below minimum' : ''}`}
                    </td>
                    <td>
                      {r.length.toFixed(1)} {project.units}
                    </td>
                    <td>{r.components}</td>
                    <td>{r.openEnds}</td>
                    <td>{r.weaveConflicts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="panel-hint">
          Open ends at the crop boundary are excluded. Connected graphs describe
          centerline connectivity, including crossings; they do not count the
          physical pieces left after cutting. DXF centerlines have duplicate and
          overlapping segments removed. Band widths exclude outlines; filled
          artwork needs its own thickness assessment.
        </p>
        <Button onClick={onClose}>Back to pattern</Button>
      </DialogContent>
    </Dialog>
  );
}
