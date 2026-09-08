import { registerTapratsTools } from './webmcp.js';
// Original bytecode stays unmodified; this adapter provides browser integration.
const assetRoot = new URL('.', import.meta.url).pathname;
const state = { ready: false, bridge: null };
let importQueue = Promise.resolve();
let javaQueue = Promise.resolve(),
  javaBusy = 0;
function runJava(operation) {
  javaBusy++;
  const result = javaQueue.then(operation);
  javaQueue = result
    .catch(() => {})
    .finally(() => {
      javaBusy--;
    });
  return result;
}
function queueImport(task) {
  const result = importQueue.then(task);
  importQueue = result.catch(() => {});
  return result;
}
function report(message, phase = 'loading') {
  window.__tapratsStatus = { message, state: phase };
  window.dispatchEvent(
    new CustomEvent('taprats-status', { detail: window.__tapratsStatus }),
  );
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () =>
      reject(
        new Error(
          'Could not download the runtime. Check your connection and allow cjrtnc.leaningtech.com.',
        ),
      );
    document.head.appendChild(script);
  });
}
async function launch() {
  try {
    report('Loading the browser runtime…');
    await loadScript('https://cjrtnc.leaningtech.com/4.3/loader.js');
    const language =
      new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en';
    await cheerpjInit({
      version: 8,
      status: 'splash',
      javaProperties: [
        'user.home=/files/workspace',
        'java.io.tmpdir=/files/workspace',
        'user.language=' + language,
      ],
      clipboardMode: 'java',
      overrideShortcuts: (e) =>
        (e.ctrlKey || e.metaKey) &&
        ['o', 's', 'p'].includes(e.key.toLowerCase()),
    });
    const display = document.createElement('div');
    display.style.cssText = 'width:100%;height:100%;position:relative';
    document.getElementById('taprats-display').appendChild(display);
    cheerpjCreateDisplay(-1, -1, display);
    report('Loading the pattern library and editing tools…');
    const jars = [
      'browser-bridge.jar',
      'taprats.jar',
      'lib/batik-all-1.19.jar',
      'lib/xml-apis-ext-1.3.04.jar',
      'lib/xmlgraphics-commons-2.11.jar',
      'lib/commons-io-2.17.0.jar',
      'lib/commons-logging-1.3.0.jar',
    ];
    if (new URL(location.href).searchParams.has('verify'))
      jars.push(
        'qa/parity-harness.jar',
        'qa/ui-harness.jar',
        'qa/diagnostic-harness.jar',
      );
    const library = await cheerpjRunLibrary(
      jars.map((file) => `/app${assetRoot}${file}`).join(':'),
    );
    const bridge = await library.taprats.web.BrowserBridge;
    state.bridge = bridge;
    await bridge.start(display.clientWidth, display.clientHeight);
    window.taprats = {
      library,
      bridge,
      runJava,
      attachDisplay: (host) => {
        if (host && !host.contains(display)) {
          host.appendChild(display);
          runJava(() =>
            bridge.resize(display.clientWidth, display.clientHeight),
          ).catch(console.error);
        }
      },
      listFiles: async () =>
        JSON.parse(await runJava(() => bridge.listFiles())),
      importFile: (file) =>
        queueImport(async () => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const source = '/str/taprats-import';
          cheerpOSAddStringFile(source, bytes);
          try {
            return await runJava(() => bridge.importFile(source, file.name));
          } finally {
            cheerpOSRemoveStringFile(source);
          }
        }),
      downloadFile: async (path) => {
        if (
          !path.startsWith('/files/workspace/') ||
          path.split('/').includes('..')
        )
          throw new Error('Invalid workspace path');
        const blob = await cjFileBlob(path);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = path.split('/').pop();
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
    };
    registerTapratsTools(window.taprats);
    state.ready = true;
    report('Ready', 'ready');
    let timer;
    new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          runJava(() =>
            bridge.resize(display.clientWidth, display.clientHeight),
          ).catch(console.error),
        100,
      );
    }).observe(display);
    let dirty = false;
    setInterval(async () => {
      try {
        if (!javaBusy) {
          dirty = await runJava(() => bridge.hasUnsavedChanges());
          if (!(await runJava(() => bridge.isRunning())))
            report(
              'Taprats is closed. Reload to start a new session.',
              'closed',
            );
        }
      } catch {}
    }, 1000);
    addEventListener('beforeunload', (e) => {
      if (dirty) {
        e.preventDefault();
        // Retained for browser compatibility with unsaved-change prompts.
        // eslint-disable-next-line typescript/no-deprecated
        e.returnValue = '';
      }
    });
  } catch (error) {
    console.error(error);
    report(error.message || String(error), 'error');
  }
}
if (!window.__tapratsStarted) {
  window.__tapratsStarted = true;
  void launch();
}
