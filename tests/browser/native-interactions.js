// Isolated Chromium interaction check; see NATIVE-BROWSER-QA.md for the local runner.
async (page) => {
  const root = '/Users/davidbachman/Documents/Taprats/web/';
  const c = await page
      .context()
      .browser()
      .newContext({ viewport: { width: 1280, height: 900 } }),
    results = {},
    errors = [];
  let p;
  try {
    p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto('http://localhost:3001/');
    await p.waitForFunction(
      () =>
        document.querySelector('main') &&
        !document.querySelector('main').hasAttribute('inert') &&
        document.querySelectorAll('.pattern-svg path').length,
    );
    const button = (name) => p.getByRole('button', { name, exact: true });
    const choose = async (label, option) => {
      await p.getByRole('combobox', { name: label, exact: true }).click();
      await p.getByRole('option', { name: option, exact: true }).click();
    };
    await button('Hide 4.8^2').click();
    if (await p.locator('.pattern-svg path').count())
      throw Error('Hidden layer still rendered');
    await button('Show 4.8^2').click();
    await button('Lock 4.8^2').click();
    if (!(await button('Draw a motif').isDisabled()))
      throw Error('Locked motif editable');
    await button('Unlock 4.8^2').click();
    await p.getByRole('tab', { name: 'Position', exact: true }).click();
    await p
      .getByRole('spinbutton', { name: 'Rotation', exact: true })
      .fill('35');
    await p.getByRole('spinbutton', { name: 'Scale', exact: true }).fill('1.5');
    await p
      .getByRole('spinbutton', { name: 'Horizontal position', exact: true })
      .fill('2');
    await button('Duplicate layer').click();
    await button('Move layer down').click();
    if (!(await p.locator('.layer-card').last().innerText()).includes('copy'))
      throw Error('Reorder failed');
    await button('Delete selected layers').click();
    await button('Reset transform').click();
    results.layerControls = true;
    await p.getByRole('tab', { name: 'Motif', exact: true }).click();
    await button('Infer from neighboring motifs').click();
    if (
      !(
        await p
          .getByRole('combobox', { name: 'Construction', exact: true })
          .innerText()
      ).includes('Drawn motif')
    )
      throw Error('Infer not applied');
    await button('Undo · ⌘Z').click();
    await button('Explore variations').click();
    results.variations = await p
      .getByRole('dialog')
      .locator('.variation-grid button')
      .count();
    if (results.variations !== 9) throw Error('Variation gallery incomplete');
    await button('Close').click();
    await button('Edit tiling').click();
    const tiling = p.getByRole('application', {
      name: 'Tiling construction canvas',
      exact: true,
    });
    const handle = await tiling.locator('g circle').first().boundingBox();
    const old = await p
      .getByRole('spinbutton', { name: 'u vector · x', exact: true })
      .inputValue();
    await p.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await p.mouse.down();
    await p.mouse.move(
      handle.x + handle.width / 2 + 30,
      handle.y + handle.height / 2,
      { steps: 4 },
    );
    await p.mouse.up();
    if (
      (await p
        .getByRole('spinbutton', { name: 'u vector · x', exact: true })
        .inputValue()) === old
    )
      throw Error('Vector drag failed');
    await button('Undo construction').click();
    await p
      .getByRole('textbox', { name: 'Tiling name', exact: true })
      .fill('Round-trip tiling');
    const td = p.waitForEvent('download');
    await button('Export .tiling').click();
    await (await td).saveAs(root + 'output/playwright/roundtrip.tiling');
    await p
      .getByRole('textbox', { name: 'Tiling name', exact: true })
      .fill('Temporary');
    const fc = p.waitForEvent('filechooser');
    await button('Open tiling').click();
    await (await fc).setFiles(root + 'output/playwright/roundtrip.tiling');
    await p.waitForFunction(() =>
      Array.from(document.querySelectorAll('input')).some(
        (i) => i.value === 'Round-trip tiling',
      ),
    );
    await button('Apply tiling').click();
    results.tilingRoundTrip = true;
    const img = p.waitForEvent('filechooser');
    await button('Reference image').click();
    await (await img).setFiles(root + 'public/native-examples/050.png');
    await button('Remove reference').waitFor();
    if (!(await p.locator('.pattern-svg image').count()))
      throw Error('Reference not shown');
    await button('Remove reference').click();
    results.reference = true;
    for (const [option, format] of [
      ['DXF · centerline geometry', 'dxf-lines'],
      ['DXF · closed region outlines', 'dxf-faces'],
      ['DXF · triangulated solid faces', 'dxf-solid'],
      ['WBMP · monochrome image', 'wbmp'],
    ]) {
      await button('Export').click();
      await choose('Format', option);
      const d = p.waitForEvent('download');
      await button('Download ' + format.toUpperCase()).click();
      await (
        await d
      ).saveAs(
        root +
          'output/playwright/production-' +
          format +
          '.' +
          (format.startsWith('dxf') ? 'dxf' : format),
      );
    }
    results.exports = 4;
    results.errors = errors;
    if (errors.length) throw Error(errors.join('\n'));
    return results;
  } catch (e) {
    return {
      error: String(e),
      results,
      errors,
      text: await p?.locator('body').innerText(),
    };
  } finally {
    await c.close();
  }
}
