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

test("toolbar uses compact circular option controls", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Visual" hidden>B</div></section><script>${picker}</script>`);
    const metrics = await page.locator("css=[data-unship-toolbar]").evaluate((host) => {
      const button = host.shadowRoot.querySelector(".prev");
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        width: box.width,
        height: box.height,
        radius: Number.parseFloat(style.borderTopLeftRadius)
      };
    });

    assert.equal(metrics.width, metrics.height);
    assert.equal(metrics.width >= 24 && metrics.width <= 32, true);
    assert.equal(metrics.radius >= metrics.width / 2, true);
  } finally {
    await browser.close();
  }
});

test("toolbar stays inside the mobile visual viewport", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await page.setContent(`<!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { margin: 0; min-height: 100vh; font: 16px system-ui; }
            section[data-unship-pick] { min-height: 52vh; display: grid; place-items: center; }
            [data-unship-option] { width: calc(100vw - 40px); padding: 34px; border: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Visual" hidden>B</div></section>
          <section data-unship-pick="Pricing"><div data-unship-option="Simple">C</div><div data-unship-option="Detailed" hidden>D</div></section>
          <script>${picker}</script>
        </body>
      </html>`);

    const metrics = await page.locator("css=[data-unship-toolbar]").evaluate((host) => {
      const box = host.shadowRoot.querySelector(".dock").getBoundingClientRect();
      return { bottom: box.bottom, visualHeight: visualViewport.height };
    });
    assert.equal(metrics.bottom <= metrics.visualHeight, true);
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
