import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

const picker = await readFile(new URL("../src/picker/unship-picker.js", import.meta.url), "utf8");

test("single-option groups render a keep label without navigation", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`
<nav data-unship-pick="Navigation" style="--nav-pad: 16px;">
  <div data-unship-option="Current" style="--accent: #0071e3;">links</div>
</nav>
<script>${picker}</script>`);
    await page.waitForFunction(() => document.querySelector("[data-unship-toolbar]")?.shadowRoot?.querySelector(".dock"));

    const state = await page.locator("css=[data-unship-toolbar]").evaluate((host) => {
      const root = host.shadowRoot;
      return {
        prev: Boolean(root.querySelector(".prev")),
        next: Boolean(root.querySelector(".next")),
        counter: Boolean(root.querySelector(".option-count")),
        label: root.querySelector(".label-main").textContent
      };
    });
    assert.equal(state.prev, false);
    assert.equal(state.next, false);
    assert.equal(state.counter, false);
    assert.equal(state.label, "Navigation");
  } finally {
    await browser.close();
  }
});

test("multi-group mode shows the option counter beside the label with a header caret", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`
<section data-unship-pick="Hero"><div data-unship-option="A">a</div><div data-unship-option="B" hidden>b</div><div data-unship-option="C" hidden>c</div></section>
<section data-unship-pick="CTA"><div data-unship-option="X">x</div><div data-unship-option="Y" hidden>y</div></section>
<script>${picker}</script>`);
    await page.waitForFunction(() => document.querySelector("[data-unship-toolbar]")?.shadowRoot?.querySelector(".dock"));

    const state = await page.locator("css=[data-unship-toolbar]").evaluate((host) => {
      const root = host.shadowRoot;
      return {
        counterInLabel: Boolean(root.querySelector(".label .option-count")),
        counterText: root.querySelector(".label .option-count")?.textContent,
        headerCaret: Boolean(root.querySelector(".menuitem.current .menu-caret")),
        headerCounter: Boolean(root.querySelector(".menuitem.current .group-count"))
      };
    });
    assert.equal(state.counterInLabel, true);
    assert.equal(state.counterText, "1/3");
    assert.equal(state.headerCaret, true);
    assert.equal(state.headerCounter, false);
  } finally {
    await browser.close();
  }
});


test("retired control metadata cannot add controls or values to a Keep instruction", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<section data-unship-pick="Hero" style="--space:16px" data-unship-tweaks='[{"type":"slider","label":"Spacing","var":"--space","min":0,"max":40}]'><div data-unship-option="A">A</div><div data-unship-option="B" hidden>B</div></section><script>${picker}</script>`);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.__copied = text; } } }));
    const toolbar = page.locator('[data-unship-toolbar]');
    assert.equal(await toolbar.locator('input,[role="slider"],[role="switch"],.tune,.panel').count(), 0);
    await page.getByRole('button', {name:'Next option',exact:true}).click();
    await toolbar.locator('.label').press('Enter');
    await page.waitForFunction(() => Boolean(window.__copied));
    assert.equal(await page.evaluate(() => window.__copied), 'Keep "B" for "Hero" and remove the other unship options in that group.');
    assert.equal(await page.locator('[data-unship-pick]').evaluate(el => el.style.getPropertyValue('--space')), '16px');
  } finally { await browser.close(); }
});
