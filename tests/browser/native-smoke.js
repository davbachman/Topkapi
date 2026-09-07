// Execute this function with a Playwright page. It creates isolated storage and
// closes its own context; it never edits the project open in the supplied page.
async (page) => {
  const context = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 1200, height: 800 } });
  const results = {},
    errors = [];
  let phase = 'startup',
    test;
  const root = '/Users/davidbachman/Documents/Taprats/web/';
  try {
    test = await context.newPage();
    test.on('pageerror', (e) => errors.push(e.message));
    await test.goto('http://localhost:3001/');
    await test.waitForFunction(() => {
      const m = document.querySelector('main');
      return (
        m &&
        !m.hasAttribute('inert') &&
        document.querySelectorAll('.pattern-svg path').length > 0
      );
    });
    results.worker = true;
    await test
      .getByRole('button', { name: 'Octagonal study', exact: true })
      .click();
    await test
      .getByRole('textbox', { name: 'Project name', exact: true })
      .fill('Browser QA');
    await test.getByRole('button', { name: 'Close', exact: true }).click();
    await test.getByText('Saved in this browser', { exact: true }).waitFor();
    await test.reload();
    await test
      .getByRole('button', { name: 'Browser QA', exact: true })
      .waitFor();
    results.recovery = true;
    await test.getByRole('button', { name: 'Browser QA', exact: true }).click();
    await test
      .getByRole('button', { name: 'Start a new project', exact: true })
      .click();
    await test
      .getByRole('button', { name: 'Octagonal study', exact: true })
      .waitFor();
    await test.getByRole('button', { name: 'Undo · ⌘Z', exact: true }).click();
    await test
      .getByRole('button', { name: 'Browser QA', exact: true })
      .waitFor();
    results.newUndo = true;
    await test
      .getByRole('button', { name: 'Draw a motif', exact: true })
      .click();
    await test
      .getByRole('button', { name: 'Clear drawing', exact: true })
      .click();
    const drawing = await test
      .getByRole('application', { name: 'Motif drawing canvas', exact: true })
      .boundingBox();
    await test.mouse.click(
      drawing.x + drawing.width * 0.35,
      drawing.y + drawing.height * 0.5,
    );
    await test.mouse.click(
      drawing.x + drawing.width * 0.65,
      drawing.y + drawing.height * 0.5,
    );
    await test
      .getByRole('button', { name: 'Apply motif', exact: true })
      .click();
    if (
      !(
        await test
          .getByRole('combobox', { name: 'Construction', exact: true })
          .innerText()
      ).includes('Drawn motif')
    )
      throw Error('Drawing was not applied');
    await test.getByRole('button', { name: 'Undo · ⌘Z', exact: true }).click();
    results.drawing = true;
    await test.getByRole('tab', { name: 'Style', exact: true }).click();
    for (const style of [
      'Linework',
      'Bands',
      'Outlined',
      'Interlaced',
      'Embossed',
      'Filled regions',
      'Sketched',
    ]) {
      await test
        .getByRole('combobox', { name: 'Rendering', exact: true })
        .click();
      await test.getByRole('option', { name: style, exact: true }).click();
      if (!(await test.locator('.pattern-svg path').count()))
        throw Error('Empty render: ' + style);
    }
    await test
      .getByRole('combobox', { name: 'Rendering', exact: true })
      .click();
    await test.getByRole('option', { name: 'Interlaced', exact: true }).click();
    results.styles = 7;
    await test
      .getByRole('button', { name: 'Duplicate layer', exact: true })
      .click();
    if ((await test.locator('.layer-card').count()) !== 2)
      throw Error('Clone failed');
    await test.getByRole('button', { name: 'Undo · ⌘Z', exact: true }).click();
    if ((await test.locator('.layer-card').count()) !== 1)
      throw Error('Clone undo failed');
    results.clone = true;
    const canvas = test.locator('.pattern-svg'),
      before = await canvas.getAttribute('viewBox'),
      box = await canvas.boundingBox();
    await test
      .getByRole('button', { name: 'Pan · H or Space-drag', exact: true })
      .click();
    await test.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await test.mouse.down();
    await test.mouse.move(
      box.x + box.width * 0.5 + 50,
      box.y + box.height * 0.5 + 25,
      { steps: 8 },
    );
    await test.mouse.up();
    if ((await canvas.getAttribute('viewBox')) === before)
      throw Error('Pan did not change view');
    await test.getByRole('button', { name: 'Undo · ⌘Z', exact: true }).click();
    if ((await canvas.getAttribute('viewBox')) !== before)
      throw Error('Pan was not one undo');
    phase = 'wheel';
    await test.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await test.mouse.wheel(0, -700);
    await test.waitForFunction(
      (old) =>
        document.querySelector('.pattern-svg')?.getAttribute('viewBox') !== old,
      before,
    );
    results.panZoom = true;
    await test.getByRole('button', { name: 'Undo · ⌘Z', exact: true }).click();
    await test.getByRole('button', { name: 'New tiling', exact: true }).click();
    await test
      .getByRole('button', {
        name: 'Fill with construction copies',
        exact: true,
      })
      .click();
    await test
      .getByRole('button', { name: 'Remove excluded', exact: true })
      .click();
    if (
      (await test
        .getByRole('application', {
          name: 'Tiling construction canvas',
          exact: true,
        })
        .locator('polygon')
        .count()) !== 1
    )
      throw Error('Excluded copies were not removed');
    await test
      .getByRole('button', { name: 'Apply tiling', exact: true })
      .click();
    if ((await test.locator('.layer-card').count()) !== 2)
      throw Error('New tiling did not create layer');
    results.tiling = true;
    const chooser = test.waitForEvent('filechooser');
    await test
      .getByRole('button', { name: 'Open project', exact: true })
      .click();
    await (await chooser).setFiles(root + 'tests/browser/sample.taprats.json');
    await test
      .getByRole('button', { name: 'Browser sample', exact: true })
      .waitFor();
    const invalid = test.waitForEvent('filechooser');
    await test
      .getByRole('button', { name: 'Open project', exact: true })
      .click();
    await (await invalid).setFiles(root + 'tests/browser/invalid.taprats.json');
    await test
      .getByText('Error: Open a Taprats Studio .taprats.json project.', {
        exact: true,
      })
      .waitFor();
    results.openValidation = true;
    await test.getByRole('button', { name: 'Export', exact: true }).click();
    await test.getByRole('combobox', { name: 'Format', exact: true }).click();
    await test
      .getByRole('option', { name: 'SVG · styled vector artwork', exact: true })
      .click();
    const download = test.waitForEvent('download');
    await test
      .getByRole('button', { name: 'Download SVG', exact: true })
      .click();
    await (
      await download
    ).saveAs(root + 'output/playwright/production-smoke.svg');
    results.export = true;
    if (errors.length) throw Error(errors.join('\n'));
    results.runtimeErrors = errors;
    await test.screenshot({
      path: root + 'output/playwright/production-verified.png',
    });
    return results;
  } catch (error) {
    return {
      error: String(error),
      phase,
      results,
      errors,
      text: await test?.locator('body').innerText(),
    };
  } finally {
    await context.close();
  }
}
