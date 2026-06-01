import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

const picker = await readFile(new URL("../src/picker/unship-picker.js", import.meta.url), "utf8");

test("toolbar fits mobile viewport and exposes title-only visible text", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await page.setContent(`<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Visual" hidden>B</div></section><script>${picker}</script>`);
    const box = await page.locator("css=[data-unship-toolbar]").evaluate((host) => host.shadowRoot.querySelector(".dock").getBoundingClientRect().toJSON());
    assert.equal(box.x >= 0, true);
    assert.equal(box.x + box.width <= 390, true);
    assert.match(await page.locator("css=[data-unship-toolbar]").evaluate((host) => host.shadowRoot.textContent), /Hero: Current/);
  } finally {
    await browser.close();
  }
});

test("mutation observer discovers variants added after load", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<main id="app"></main><script>${picker}</script>`);
    await page.evaluate(() => {
      document.querySelector("#app").innerHTML = '<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Compact" hidden>B</div></section>';
    });
    await page.waitForFunction(() => window.__unshipPicker.getState().groups.length === 1);
    assert.equal((await page.evaluate(() => window.__unshipPicker.getState())).groups[0].options[1], "Compact");
  } finally {
    await browser.close();
  }
});
