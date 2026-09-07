import type { Project } from '../engine/types';
import { decodeProject } from './storage';
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type Context = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
/** Progressive enhancement; ordinary browser editing does not depend on WebMCP. */
export function registerProjectTools(
  context: Context | undefined,
  get: () => Project,
  replace: (p: Project) => Promise<void>,
  report: (error: unknown) => void,
) {
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const tools: Tool[] = [
    {
      name: 'read_taprats_project',
      description:
        'Read the current editable Taprats Studio project, including self-contained tilings, motif settings, layers and view.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => structuredClone(get()),
    },
    {
      name: 'replace_taprats_project',
      description:
        'Validate and replace the visible project with a complete Taprats Studio document. This is undoable and autosaved on this device.',
      inputSchema: {
        type: 'object',
        properties: { project: { type: 'object' } },
        required: ['project'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        if (!input || typeof input !== 'object' || !('project' in input))
          throw Error('Provide a project object.');
        const p = decodeProject(JSON.stringify(input.project));
        await replace(p);
        return { name: p.name, layers: p.layers.length, status: 'applied' };
      },
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(report);
    } catch (e) {
      report(e);
    }
  }
  return () => lifecycle.abort();
}
export function browserModelContext(): Context | undefined {
  return typeof document === 'undefined'
    ? undefined
    : (document as Document & { modelContext?: Context }).modelContext;
}
