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

test("toolbar uses comfortable circular option controls", async () => {
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
    assert.equal(metrics.width >= 32 && metrics.width <= 44, true);
    assert.equal(metrics.radius >= metrics.width / 2, true);
  } finally {
    await browser.close();
  }
});

test("toolbar does not outline or ring the active variant title after switching", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<section data-unship-pick="Hero"><button data-unship-option="Current">A</button><div data-unship-option="Visual" hidden>B</div></section><script>${picker}</script>`);
    await page.locator('[data-unship-option="Current"]').focus();
    await page.getByRole("button", { name: /next option/i }).click();

    const styles = await page.locator("css=[data-unship-toolbar]").evaluate((host) => {
      const label = host.shadowRoot.querySelector(".label");
      const style = getComputedStyle(label);
      return {
        activeClass: host.shadowRoot.activeElement?.className,
        boxShadow: style.boxShadow,
        borderWidth: style.borderTopWidth,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth
      };
    });

    assert.equal(styles.activeClass, "label");
    assert.equal(styles.borderWidth, "0px");
    assert.equal(styles.outlineStyle, "none");
    assert.equal(styles.outlineWidth, "0px");
    assert.equal(styles.boxShadow, "none");
  } finally {
    await browser.close();
  }
});

test("toolbar label toggles manual top and bottom placement", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Visual" hidden>B</div></section><script>${picker}</script>`);

    await page.getByRole("button", { name: /toggle toolbar position/i }).click();
    assert.equal(
      await page.locator("css=[data-unship-toolbar]").evaluate((host) => host.shadowRoot.querySelector(".dock").classList.contains("top")),
      true
    );

    await page.getByRole("button", { name: /toggle toolbar position/i }).click();
    assert.equal(
      await page.locator("css=[data-unship-toolbar]").evaluate((host) => host.shadowRoot.querySelector(".dock").classList.contains("bottom")),
      true
    );
  } finally {
    await browser.close();
  }
});

test("toolbar does not rerender from its own visibility writes", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Visual" hidden>B</div></section><script>${picker}</script>`);
    await page.locator("css=[data-unship-toolbar]").evaluate((host) => {
      window.__unshipToolbarRenders = 0;
      new MutationObserver(() => {
        window.__unshipToolbarRenders += 1;
      }).observe(host.shadowRoot, { childList: true, subtree: true });
    });

    await page.getByRole("button", { name: /next option/i }).click();
    await page.waitForTimeout(80);

    assert.equal(await page.evaluate(() => window.__unshipToolbarRenders), 1);
  } finally {
    await browser.close();
  }
});

test("toolbar does not rerender when rescanned groups keep the same visible state", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`
      <main data-unship-pick="Hero">
        <section data-unship-option="Current">
          <div data-term-group data-unship-pick="Terminal"><div data-unship-option="Classic">A</div><div data-unship-option="Compact" hidden>B</div></div>
        </section>
        <section data-unship-option="Visual" hidden>
          <div data-term-group><div data-unship-option="Classic">C</div><div data-unship-option="Compact" hidden>D</div></div>
        </section>
      </main>
      <script>
        function syncTermGroups() {
          document.querySelectorAll("[data-term-group]").forEach((host) => {
            const hero = host.closest("[data-unship-option]");
            const visible = hero && !hero.hidden && getComputedStyle(hero).display !== "none";
            const has = host.getAttribute("data-unship-pick") === "Terminal";
            if (visible && !has) host.setAttribute("data-unship-pick", "Terminal");
            else if (!visible && has) host.removeAttribute("data-unship-pick");
          });
        }
        new MutationObserver(syncTermGroups).observe(document.querySelector('[data-unship-pick="Hero"]'), { subtree: true, attributes: true, attributeFilter: ["hidden", "style"] });
      </script>
      <script>${picker}</script>
    `);
    await page.locator("css=[data-unship-toolbar]").evaluate((host) => {
      window.__unshipToolbarRenders = 0;
      new MutationObserver(() => {
        window.__unshipToolbarRenders += 1;
      }).observe(host.shadowRoot, { childList: true, subtree: true });
    });

    await page.getByRole("button", { name: /next option/i }).click();
    await page.waitForTimeout(120);

    assert.equal(await page.evaluate(() => window.__unshipToolbarRenders), 1);
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
