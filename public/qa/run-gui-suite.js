/**
 * Browser-side orchestration for the test-only Java helper.
 * Pass the CheerpJ library class proxy for taprats.testing.UIHarness.
 * This script does not install a runtime or change application code.
 * It exercises original controls and leaves a wizard-generated layer plus
 * a valid custom-tiling window open for physical mouse/export checks.
 */
async function runTapratsGuiSuite(UI, options = {}) {
  const log = [];
  const timeout = options.timeout || 60000;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function call(method, ...args) {
    const raw = await window.taprats.runJava(() => UI[method](...args));
    const data = JSON.parse(String(raw));
    if (data.error) throw new Error(method + ': ' + data.error);
    return data;
  }
  async function record(method, ...args) {
    const result = await call(method, ...args);
    log.push({method, args, result});
    if (options.onProgress) options.onProgress(log[log.length - 1]);
    return result;
  }
  async function waitFor(predicate, description) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const state = await call('state');
      if (state.lastError) throw new Error(state.lastOperation + ': ' + state.lastError);
      if (predicate(state)) return state;
      await pause(100);
    }
    throw new Error('Timed out: ' + description + '\n' + JSON.stringify(await call('state')));
  }
  async function queued(method, ...args) {
    const ticket = await record(method, ...args);
    return waitFor(state => state.completed >= ticket.scheduled, method);
  }
  // The fixture importer is explicit test setup. It calls original MainWindow
  // loading and uses original ObjectInputStream, catalog and geometry.
  await queued('loadExample', options.example || 'USA');
  await waitFor(state => state.layerCount === 5 && state.layers.every(layer => layer.description.startsWith('4.8^2')), 'USA five layers');
  await record('layerScenario');
  await record('transformScenario');

  // Seven style choices exercised on a disposable cloned layer.
  let state = await call('state');
  const count = state.layerCount;
  await queued('click', state.controls['layers_editor.clone_button']);
  state = await waitFor(s => s.layerCount === count + 1, 'style test clone');
  const styleNames = ['Plain', 'Thick', 'Filled', 'Outline', 'Interlace', 'Emboss', 'Sketch'];
  for (let index = 0; index < styleNames.length; index++) {
    await queued('select', state.controls['style_editor.style_choice'], index);
    state = await waitFor(s => s.layers.some(layer => layer.selected && layer.type === styleNames[index]), 'style ' + styleNames[index]);
    const alphaField = await call('fieldId', state.main, 'style_editor.style_editor.transparency.field');
    await queued('setText', alphaField.id, '25');
    state = await call('state');
    const alpha = (state.layers.find(layer => layer.selected).colorARGB >>> 24) & 255;
    if (alpha !== 191) throw new Error('Transparency did not become 25%: ' + alpha);
    log.push({method: 'style controls', result: {type: styleNames[index], alpha}});
  }
  await queued('click', state.controls['layers_editor.remove_button']);
  await waitFor(s => s.layerCount === count, 'remove style test clone');

  await queued('startWizard', '4.8^2');
  await waitFor(s => s.wizards.length && s.wizards[0].step === 1, 'wizard edit stage');
  await record('wizardScenario'); // All exposed algorithms, Apply, Preview, Previous.
  if (options.finishWizard !== false) {
    await queued('wizardStep', 'next');
    await waitFor(s => s.wizards.length && s.wizards[0].step === 2, 'wizard preview');
    await queued('wizardStep', 'next');
    await waitFor(s => !s.wizards.length && s.layerCount === count + 1, 'wizard final build');
  } else {
    await queued('wizardStep', 'cancel');
    await waitFor(s => !s.wizards.length && s.layerCount === count, 'wizard cancel');
  }

  await queued('action', 'newTiling');
  await waitFor(s => s.designers.length > 0 && s.designers.some(d => d.features === 0), 'empty tiling designer');
  await record('designerScenario');
  const finalState = await call('state');
  const finalSnapshot = await call('snapshot');
  return {pass: true, log, state: finalState, snapshot: finalSnapshot};
}
// Works as a normal script and exposes the runner to browser test automation.
if (typeof globalThis !== 'undefined') globalThis.runTapratsGuiSuite = runTapratsGuiSuite;
