export function registerTapratsTools(api) {
  const context = document.modelContext;
  if (!context?.registerTool) return false;
  const lifecycle = new AbortController();
  const validateEmpty = (input) => {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).length
    )
      throw new Error('Expected an empty object');
  };
  const tools = [
    {
      name: 'list_taprats_files',
      title: 'List Taprats workspace files',
      description:
        'List saved designs, custom tilings, and exports available in this browser workspace.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        validateEmpty(input);
        return { files: await api.listFiles() };
      },
    },
    {
      name: 'download_taprats_files',
      title: 'Download saved Taprats files',
      description:
        'Download existing workspace files to this computer. Use list_taprats_files to get their exact paths.',
      inputSchema: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 50,
          },
        },
        required: ['paths'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          Object.keys(input).some((k) => k !== 'paths') ||
          !Array.isArray(input.paths) ||
          input.paths.length < 1 ||
          input.paths.length > 50 ||
          input.paths.some((p) => typeof p !== 'string')
        )
          throw new Error('Provide between 1 and 50 file paths.');
        const paths = [...new Set(input.paths)];
        const available = new Set((await api.listFiles()).map((f) => f.path));
        if (paths.some((path) => !available.has(path)))
          throw new Error('A requested file does not exist in the workspace.');
        for (const path of paths) await api.downloadFile(path);
        return { downloaded: paths };
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(console.error);
    } catch (error) {
      console.error(error);
    }
  }
  addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  return true;
}
