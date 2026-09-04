# Taprats GUI test helper

Test artifact only. It adds no application features and edits no original classes.

- JAR: `public/qa/ui-harness.jar`
- Java class: `taprats.testing.UIHarness`
- Source: `tests/java/UIHarness.java`
- Browser suite: `public/qa/run-gui-suite.js`

Load the helper JAR on the SAME CheerpJ library-mode classpath as `taprats.jar`, so both see the same `Frame` registry and application classes. Obtain the class proxy using the existing runtime's library API, then invoke its static methods. All return a JSON string; use `JSON.parse(String(await taprats.runJava(() => UI.state())))`.

Useful first calls are `snapshot()` and `state()`. `snapshot` returns the showing Frame/owned-Dialog tree including stable integer IDs, class names, text, bounds, absolute screen bounds, enabled/visible/showing flags, combo/list items, scrollbar values, and AWT File-menu items. Hidden cards remain in the component subtree and have `showing:false`.

`state()` returns main component ID, layer types/transforms/colors/visibility/selection, important named control IDs, wizard stages, designer feature counts and last scheduled operation/error. IDs remain stable for each actual object for the lifetime of this helper's classloader.

## Inputs

- `click(id)`: actual `AbstractButton.doClick`, AWT menu listeners, or original component mouse listeners.
- `setText(id, text)`: edits JTextComponent; JTextField also posts its original action event to commit. For HTML metadata use actual selection/typing or the editor's Document API, because replacing its entire HTML document does not preserve original metadata positions.
- `select(id,index)`: combo, list or tabs; list scrolls selected item into view.
- `setValue(id,int)`: scrollbar/slider/spinner.
- `fieldId(ownerId,"nested.private.field.path")`: reflection locator for controls not in state. Example: main ID + `style_editor.style_editor.width_slide.field`; inherited fields work.
- `action(name)`: original main actions `new`, `newTiling`, `open`, `save`, `saveAs`, `example`, `image`, `eps`, `svg`; alternatively pass original field name.
- `invokeFieldAction(ownerId,name)`: invokes original public/private Action field, useful for designer tools.
- `close(windowId)`: dispatches WINDOW_CLOSING and respects original dirty-warning behavior.
- `mouse(componentId,kind,x,y,button,modifiers)`: dispatches original listeners using component-local coordinates; kinds press/release/drag/move/click. This complements actual browser pointer checks.
- `bindings()`: modifier masks and queue notes.

Mutations schedule on the EDT and return immediately with `{scheduled:ticket}`. Reads use invokeAndWait when called outside the EDT. Poll `state()` and wait for `completed >= ticket` for nonmodal actions. A modal action completes only AFTER its dialog is dismissed: use `snapshot()` to locate and operate the modal dialog while the original scheduled action is pending. Do not await completion before attempting to dismiss a newly opened modal dialog. `state()`/`snapshot()` themselves act as event-queue barriers. `lastError` records exceptions in scheduled jobs; synchronous scenario failures return `{error:...}`.

## Scripted original-GUI checks

- `loadExample("USA")`: asynchronous original native-format load. Fixture setup deliberately calls original loading method directly, so it bypasses unsaved-change prompt. Wait for expected layer state before testing.
- `layerScenario()`: tests Clone, clone equality, Down/Up, original Space visibility binding and Remove, then restores original layer order/count/selection.
- `transformScenario()`: tests committed numeric X/Y pan, degree rotation, geometric-width zoom and selected-layer isolation, then restores original transforms.
- `startWizard("4.8^2")`: clicks original Add, selects built-in tiling and clicks Next.
- `wizardFeature(index)`, `wizardAlgorithm(name)`, `wizardApply()`, `wizardStep("next"|"previous"|"cancel")`: drive actual wizard controls.
- `wizardScenario()`: requires wizard edit stage; selects each distinct feature, selects every displayed algorithm, clicks Infer where applicable, checks each output graph, clicks Apply, verifies Preview/Previous. It leaves edited wizard on edit stage, ready for Finish or Cancel. Note algorithm application changes fixture geometry intentionally.
- `designerScenario()`: requires a NEW empty designer; invokes digit/add actions, exclude/remove controls, then seeds original built-in `4^4` fixture to exercise Fill/Clear translation actions and validation. Leaves valid `4^4` open for physical pointer/preview/save checks. It does not claim to test drag snapping or translation drawing; those remain physical integration checks.
- `runTapratsGuiSuite(UI, options)`: JS orchestration with bounded polling. Exercises all the above plus seven style choices/transparency using a disposable clone. Optional `onProgress` callback, `timeout` per wait, `finishWizard:false` to cover Cancel instead of Finish. Default fixture is USA; do not use the `example` option with differently structured designs unless adapting its expected condition.

## Validation status / limits

The Java source compiles cleanly against the exact original JAR with Java 8 ECJ. This helper's GUI scenario results must be evaluated in the actual running browser; compilation alone does not establish UI parity. Modal file dialogs, color chooser, drag/drop, browser keyboard/native pointer mapping, downloads and persistence still require browser checks. Frame discovery uses Frame.getFrames plus owned windows, not `Window.getWindows`.

## Run and rebuild

Open the running app with `?verify`. In the browser console:

```js
const UI = await taprats.runJava(() => taprats.library.taprats.testing.UIHarness);
const script = document.createElement('script');
script.src = '/qa/run-gui-suite.js';
await new Promise((resolve, reject) => {
  script.onload = resolve; script.onerror = reject; document.head.append(script);
});
console.log(await runTapratsGuiSuite(UI));
```

To rebuild the helper using a Java 8 JDK from `web/`:

```sh
mkdir -p java-build/ui
javac -source 8 -target 8 -cp public/taprats.jar -d java-build/ui tests/java/UIHarness.java
jar cf public/qa/ui-harness.jar -C java-build/ui .
```

The checked-in helper also builds with the pinned ECJ compiler downloaded by
`npm run build:java`; replace `javac` with `java -jar .cache/ecj-3.26.0.jar`.
