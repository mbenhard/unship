import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

const picker = await readFile(new URL("../src/picker/unship-picker.js", import.meta.url), "utf8");

test("double-clicking the label minimizes the dock to a circular button and click restores", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Visual" hidden>B</div></section><script>${picker}</script>`);

    await page.getByRole("button", { name: /hold to keep this option/i }).dblclick();
    await page.waitForFunction(() => {
      const root = document.querySelector("[data-unship-toolbar]")?.shadowRoot;
      return root && !root.querySelector(".dock") && root.querySelector(".minimized");
    });
    await page.mouse.move(5, 5);
    await page.locator("css=[data-unship-toolbar]").evaluate((host) =>
      Promise.all(host.shadowRoot.querySelector(".minimized").getAnimations().map((animation) => animation.finished))
    );
    const button = await page.locator("css=[data-unship-toolbar]").evaluate((host) => {
      const element = host.shadowRoot.querySelector(".minimized");
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, radius: getComputedStyle(element).borderTopLeftRadius };
    });
    assert.equal(button.width, 32);
    assert.equal(button.height, 32);
    assert.equal(button.radius, "50%");

    await page.locator("css=[data-unship-toolbar]").evaluate((host) => host.shadowRoot.querySelector(".minimized").click());
    await page.waitForFunction(() => {
      const root = document.querySelector("[data-unship-toolbar]")?.shadowRoot;
      return root && root.querySelector(".dock") && !root.querySelector(".minimized");
    });
  } finally {
    await browser.close();
  }
});

test("holding the label copies a keep instruction for the agent", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Visual" hidden>B</div></section><script>${picker}</script>`);
    await page.evaluate(() => {
      window.__copied = [];
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: (text) => { window.__copied.push(text); return Promise.resolve(); } }
      });
    });

    const label = await page.locator("css=[data-unship-toolbar]").evaluate((host) => {
      const rect = host.shadowRoot.querySelector(".label").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(label.x, label.y);
    await page.mouse.down();
    await page.waitForFunction(() => window.__copied.length === 1);
    await page.mouse.up();

    assert.deepEqual(await page.evaluate(() => window.__copied), [
      'Keep "Current" for "Hero" and remove the other unship options in that group.'
    ]);
    assert.match(
      await page.locator("css=[data-unship-toolbar]").evaluate((host) => host.shadowRoot.querySelector(".label-main").textContent),
      /Copied\. Paste it to your agent/
    );
  } finally {
    await browser.close();
  }
});

test("switching groups scrolls the page to the chosen group", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`
      <style>section{min-height:1400px}</style>
      <section data-unship-pick="Hero"><div data-unship-option="Current">A</div></section>
      <section data-unship-pick="Pricing"><div data-unship-option="Simple">B</div></section>
      <script>${picker}</script>
    `);

    await page.getByRole("menuitem", { name: /Active group Hero/ }).click();
    await page.getByRole("menuitem", { name: /Pricing, Simple/ }).click();
    await page.waitForFunction(() => window.scrollY > 600);
  } finally {
    await browser.close();
  }
});

test("group switcher keeps page order after picking a group", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`
      <section data-unship-pick="Hero"><div data-unship-option="Current">A</div></section>
      <section data-unship-pick="Pricing"><div data-unship-option="Simple">B</div></section>
      <script>${picker}</script>
    `);

    await page.getByRole("menuitem", { name: /Active group Hero/ }).click();
    await page.getByRole("menuitem", { name: /Pricing, Simple/ }).click();
    await page.getByRole("menuitem", { name: /Active group Pricing/ }).click();
    const menu = await page.locator("[data-unship-toolbar]").evaluate((host) =>
      Array.from(host.shadowRoot.querySelectorAll('[role="menuitem"]')).map((item) => ({
        name: item.querySelector(".menu-name").textContent,
        current: item.getAttribute("aria-current") === "true"
      }))
    );
    assert.deepEqual(menu, [
      { name: "Hero", current: false },
      { name: "Pricing", current: true }
    ]);
  } finally {
    await browser.close();
  }
});
