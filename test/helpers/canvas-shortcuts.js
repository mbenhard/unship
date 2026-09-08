import assert from 'node:assert/strict';

export async function checkCanvasShortcuts(page) {
  const world = page.locator('.canvas-world');
  // Start away from Fit so a swallowed reset shortcut is observable too.
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.waitForTimeout(250);
  const before = await world.evaluate(node => node.style.transform);
  const prevented = await page.evaluate(() => {
    const controls = document.querySelector('[data-unship-toolbar]').shadowRoot;
    const events = [];
    for (const target of [document.body, controls.querySelector('.canvas-close')]) {
      for (const key of ['+', '=', '-', '0', '1']) {
        for (const modifiers of [{}, { metaKey: true }, { ctrlKey: true }]) {
          const event = new KeyboardEvent('keydown', {
            key, code: key === '+' ? 'Digit1' : '',
            ...modifiers, bubbles: true, composed: true, cancelable: true
          });
          target.dispatchEvent(event);
          events.push(event.defaultPrevented);
        }
      }
    }
    return events;
  });
  await page.waitForTimeout(250);
  assert.equal(prevented.some(Boolean), false, 'Canvas must leave keyboard zoom and browser tab shortcuts alone');
  assert.equal(await world.evaluate(node => node.style.transform), before, 'Keyboard shortcuts must not change the Canvas camera');
}
