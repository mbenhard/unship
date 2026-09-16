import { checkCanvasShortcuts } from './helpers/canvas-shortcuts.js';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

const picker = await readFile(new URL("../src/picker/unship-picker.js", import.meta.url), "utf8");

const launchBrowser = () => chromium.launch(process.env.UNSHIP_BROWSER_EXECUTABLE ? { executablePath: process.env.UNSHIP_BROWSER_EXECUTABLE } : {});

const PAGE = `
<style>
  [hidden]{display:none!important} html,body{background:#eee7dc} body{margin:0} main{width:960px;margin:24px auto;display:grid;gap:24px}
  [data-unship-pick]{border:1px solid #ddd}
  .header>[data-unship-option]{height:64px;padding:0 20px;display:flex;align-items:center}
  .hero>[data-unship-option]{min-height:240px;padding:32px;display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)}
  .cards{width:320px}.cards>[data-unship-option]{height:240px;padding:24px}
  @media(max-width:500px){.hero>[data-unship-option]{grid-template-columns:1fr;min-height:360px}}
</style>
<main>
  <header class="header" data-unship-pick="Header">
    <div data-unship-option="A">Header A</div><div data-unship-option="B" hidden>Header B</div>
  </header>
  <section class="hero" data-unship-pick="Hero" data-unship-canvas="matrix" style="--gap:32px">
    <div data-unship-option="Proof">Proof</div><div data-unship-option="Direct" hidden>Direct</div>
  </section>
  <section class="cards" data-unship-pick="Cards" data-unship-canvas="grid">
    <article data-unship-option="Local">Local</article><article data-unship-option="Fast" hidden>Fast</article>
  </section>
</main>
<script>${picker}</script>`;

async function withCanvas(callback) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(PAGE, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open Canvas" }).click();
    await page.waitForFunction(() => {
      const root = document.querySelector("[data-unship-toolbar]")?.shadowRoot;
      return root?.querySelectorAll(".canvas-frame.ready").length === 6;
    });
    return await callback(page);
  } finally {
    await browser.close();
  }
}

test("Canvas is available for plain comparisons and builds previews only on entry", async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(PAGE.replace(/ data-unship-canvas="[^"]+"/g, ""));
    assert.equal(await page.getByRole("button", { name: "Open Canvas" }).count(), 1);
    assert.equal(await page.locator(".canvas-shell, .canvas-frame, iframe").count(), 0);
    assert.deepEqual(await page.evaluate(() => window.__unshipPicker.getState().canvas.groups), [
      { label: "Header", layout: "stack" },
      { label: "Hero", layout: "stack" },
      { label: "Cards", layout: "stack" }
    ]);
    await page.getByRole("button", { name: "Open Canvas" }).click();
    await page.waitForFunction(() => document.querySelector("[data-unship-toolbar]").shadowRoot.querySelectorAll(".canvas-frame.ready").length === 6);
    assert.equal(await page.locator(".canvas-group").count(), 3);
    await page.getByRole("button", { name: "Back to page" }).click();
    await page.getByRole("button", { name: "Open Canvas" }).waitFor();
    assert.deepEqual(await page.locator("[data-unship-option]:not([hidden])").allTextContents(), ["Header A", "Proof", "Local"]);
  } finally {
    await browser.close();
  }
});

test("Canvas button zoom animates fixed ten-point steps smoothly", async () => {
  await withCanvas(async (page) => {
    const host = page.locator("[data-unship-toolbar]");
    const readScale = () => host.evaluate((node) => Number(node.shadowRoot.querySelector(".canvas-world").style.transform.match(/scale\(([^)]+)\)/)[1]));
    const before = await readScale();
    await host.evaluate((node) => node.shadowRoot.querySelector('[data-action="canvas-zoom-in"]').click());
    await page.waitForTimeout(40);
    const during = await readScale();
    await page.waitForTimeout(220);
    const after = await readScale();
    const expected = Math.min(2, Math.round((before + 0.1) * 20) / 20);
    assert.equal(during > before && during < expected, true, "button zoom should still be moving after its first frames");
    assert.equal(Math.abs(after - expected) < 0.001, true);
  });
});

test("Canvas zoom stays anchored to the cursor and accumulates rapid controls", async () => {
  await withCanvas(async (page) => {
    const host = page.locator("[data-unship-toolbar]");
    await page.waitForTimeout(250);
    const point = { x: 900, y: 400 };
    const worldAtPoint = () => host.evaluate((node, cursor) => {
      const world = node.shadowRoot.querySelector(".canvas-world");
      const transform = world.style.transform.match(/scale\(([^)]+)\) translate\(([^p]+)px, ([^p]+)px\)/);
      const scale = Number(transform[1]);
      const panX = Number(transform[2]);
      const panY = Number(transform[3]);
      const originX = world.offsetWidth / 2;
      const originY = world.offsetHeight / 2;
      return {
        scale,
        x: (cursor.x - originX) / scale - panX + originX,
        y: (cursor.y - originY) / scale - panY + originY
      };
    }, point);

    const before = await worldAtPoint();
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(900);
    const after = await worldAtPoint();
    assert.equal(after.scale > before.scale, true);
    assert.equal(Math.abs(after.x - before.x) < 0.2, true, `cursor x drifted ${after.x - before.x}px`);
    assert.equal(Math.abs(after.y - before.y) < 0.2, true, `cursor y drifted ${after.y - before.y}px`);

    const beforePinch = await worldAtPoint();
    await host.evaluate((node, cursor) => {
      node.shadowRoot.querySelector(".canvas-viewport").dispatchEvent(new WheelEvent("wheel", {
          composed: true,
        bubbles: true,
        cancelable: true,
        clientX: cursor.x,
        clientY: cursor.y,
        deltaY: -12,
        ctrlKey: true
      }));
    }, point);
    await page.waitForTimeout(40);
    const afterPinch = await worldAtPoint();
    assert.equal(afterPinch.scale > beforePinch.scale, true);
    assert.equal(afterPinch.scale > beforePinch.scale * 1.06, true, "Quick pinch should feel immediately responsive");
    assert.equal(afterPinch.scale < beforePinch.scale * 1.075, true, "pinch should respond quickly without racing ahead");
    assert.equal(Math.abs(afterPinch.x - beforePinch.x) < 0.2, true);
    assert.equal(Math.abs(afterPinch.y - beforePinch.y) < 0.2, true);
    const pinchTransition = await host.evaluate((node) => node.shadowRoot.querySelector(".canvas-world").style.transition);
    assert.equal(pinchTransition, "none", "continuous pinch must not inherit the button zoom transition");

    const beforePinchOut = await worldAtPoint();
    await host.evaluate((node, cursor) => {
      const viewport = node.shadowRoot.querySelector(".canvas-viewport");
      for (let index = 0; index < 20; index += 1) {
        viewport.dispatchEvent(new WheelEvent("wheel", {
          composed: true,
          bubbles: true,
          cancelable: true,
          clientX: cursor.x,
          clientY: cursor.y,
          deltaY: 12,
          ctrlKey: true
        }));
      }
    }, point);
    await page.waitForTimeout(50);
    const afterPinchOut = await worldAtPoint();
    assert.equal(afterPinchOut.scale < beforePinchOut.scale, true);
    assert.equal(afterPinchOut.scale > beforePinchOut.scale * 0.91, true, "pinch-out events in one frame should be coalesced and rate-limited");
    assert.equal(Math.abs(afterPinchOut.x - beforePinchOut.x) < 0.2, true);
    assert.equal(Math.abs(afterPinchOut.y - beforePinchOut.y) < 0.2, true);

    await host.evaluate((node, cursor) => {
      node.shadowRoot.querySelector(".canvas-viewport").dispatchEvent(new WheelEvent("wheel", {
          composed: true,
        bubbles: true,
        cancelable: true,
        clientX: cursor.x,
        clientY: cursor.y,
        deltaX: 12,
        deltaY: 18
      }));
    }, point);
    await page.waitForTimeout(30);
    const afterTrackpadPan = await worldAtPoint();
    assert.equal(Math.abs(afterTrackpadPan.scale - afterPinchOut.scale) < 0.0001, true, "two-finger scroll should pan without zooming");
    assert.equal(Math.abs(afterTrackpadPan.x - afterPinchOut.x) > 1, true);
    assert.equal(Math.abs(afterTrackpadPan.y - afterPinchOut.y) > 1, true);

    const framePoint = await host.evaluate((node) => {
      const rect = node.shadowRoot.querySelector('.canvas-frame[data-group="1"][data-option="0"]').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + 12 };
    });
    await page.mouse.move(framePoint.x, framePoint.y);
    await page.waitForTimeout(150);
    const toolbarHeight = await host.evaluate((node) => node.shadowRoot.querySelector(".canvas-frame-toolbar").getBoundingClientRect().height);
    assert.equal(toolbarHeight >= 32 && toolbarHeight <= 48, true);

    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    await zoomIn.click();
    await zoomIn.click();
    await zoomIn.click();
    await page.waitForTimeout(900);
    const accumulated = await host.evaluate((node) => Number(node.shadowRoot.querySelector(".canvas-world").style.transform.match(/scale\(([^)]+)\)/)[1]));
    assert.equal(accumulated >= after.scale + 0.25, true);

    await page.mouse.move(1000, 650);
    await page.mouse.down();
    await page.mouse.move(500, 320, { steps: 4 });
    await page.mouse.move(10, 20, { steps: 4 });
    const transformAtBoundary = await host.evaluate((node) => node.shadowRoot.querySelector(".canvas-world").style.transform);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const transformAfterRelease = await host.evaluate((node) => node.shadowRoot.querySelector(".canvas-world").style.transform);
    assert.equal(transformAfterRelease, transformAtBoundary, "releasing at the boundary must not spring the Canvas back");
    const bounded = await host.evaluate((node) => {
      const root = node.shadowRoot;
      const world = root.querySelector(".canvas-world");
      const viewport = root.querySelector(".canvas-viewport");
      const match = world.style.transform.match(/scale\(([^)]+)\) translate\(([^p]+)px, ([^p]+)px\)/);
      const scale = Number(match[1]);
      const panX = Number(match[2]);
      const panY = Number(match[3]);
      const left = (1 - scale) * world.offsetWidth / 2 + panX * scale;
      const top = (1 - scale) * world.offsetHeight / 2 + panY * scale;
      const screenWidth = world.offsetWidth * scale;
      const screenHeight = world.offsetHeight * scale;
      const horizontalSlack = Math.min(360, Math.max(180, viewport.clientWidth * 0.28));
      const topSlack = Math.min(280, Math.max(140, viewport.clientHeight * 0.2));
      const bottomSlack = Math.min(420, Math.max(220, viewport.clientHeight * 0.3));
      return {
        left,
        top,
        minLeft: screenWidth <= viewport.clientWidth ? -horizontalSlack : viewport.clientWidth - screenWidth - horizontalSlack,
        maxLeft: screenWidth <= viewport.clientWidth ? viewport.clientWidth - screenWidth + horizontalSlack : horizontalSlack,
        minTop: screenHeight <= viewport.clientHeight ? -topSlack : viewport.clientHeight - screenHeight - bottomSlack,
        maxTop: screenHeight <= viewport.clientHeight ? viewport.clientHeight - screenHeight + bottomSlack : topSlack
      };
    });
    assert.equal(bounded.left >= bounded.minLeft - 1 && bounded.left <= bounded.maxLeft + 1, true);
    assert.equal(bounded.top >= bounded.minTop - 1 && bounded.top <= bounded.maxTop + 1, true);

    await page.getByRole("button", { name: "Fit Canvas", exact: true }).last().click();
    await page.waitForTimeout(300);
    const fitted = await worldAtPoint();
    const expectedFit = await host.evaluate((node) => {
      const root = node.shadowRoot;
      const viewport = root.querySelector(".canvas-viewport");
      const world = root.querySelector(".canvas-world");
      return Math.min(1, Math.max(0.05, Math.min((viewport.clientWidth - 96) / world.scrollWidth, (viewport.clientHeight - 176) / world.scrollHeight)));
    });
    assert.equal(Math.abs(fitted.scale - expectedFit) < 0.001, true, "Fit should be the explicit operation that reframes newly shown viewports");
  });
});

test("Canvas entry remains available in a narrow desktop preview", async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 519, height: 863 } });
    await page.setContent(PAGE, { waitUntil: "domcontentloaded" });
    const entry = page.getByRole("button", { name: "Open Canvas" });
    assert.equal(await entry.isVisible(), true);
    await entry.click();
    await page.getByRole("button", { name: "Back to page" }).waitFor({ state: "visible" });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.getByRole("button", { name: "Back to page" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Zoom in" }).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: /Canvas theme/ }).isVisible(), true);
    const dock = await page.locator("[data-unship-toolbar]").evaluate((node) => node.shadowRoot.querySelector(".canvas-dock").getBoundingClientRect().toJSON());
    assert.equal(dock.left >= 0 && dock.right <= 320, true);
    const rightInset = await page.locator("[data-unship-toolbar]").evaluate((node) => {
      const root = node.shadowRoot;
      return root.querySelector(".canvas-dock").getBoundingClientRect().right - root.querySelector(".canvas-close").getBoundingClientRect().right;
    });
    assert.ok(rightInset <= 8, "Canvas pill should hug Close at narrow widths");
  } finally {
    await browser.close();
  }
});

test("Canvas Keep actions accumulate one choice per Group", async () => {
  await withCanvas(async (page) => {
    await page.evaluate(() => {
      window.__copied = [];
      Object.defineProperty(navigator, "clipboard", { value: { writeText: (text) => (window.__copied.push(text), Promise.resolve()) } });
    });
    const host = page.locator("[data-unship-toolbar]");
    await host.evaluate((node) => {
      const root = node.shadowRoot;
      root.querySelector('.canvas-frame[data-group="1"][data-option="1"]')?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      root.querySelector(".canvas-frame-toolbar .canvas-keep")?.click();
      root.querySelector('.canvas-frame[data-group="0"][data-option="1"]')?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      root.querySelector(".canvas-frame-toolbar .canvas-keep")?.click();
    });
    const copied = await page.evaluate(() => window.__copied.at(-1));
    assert.match(copied, /Unship selection: "B" for "Header"/);
    assert.match(copied, /Unship selection: "Direct" for "Hero"/);
    const kept = await host.evaluate((node) => Array.from(node.shadowRoot.querySelectorAll(".canvas-frame.kept")).map((frame) => `${frame.dataset.group}:${frame.dataset.option}`));
    assert.deepEqual(kept, ["0:1", "1:1"]);
    assert.equal(await page.locator(".canvas-keep").textContent(), "Copied — paste into your AI chat");
    await host.evaluate((node) => node.shadowRoot.querySelector('.canvas-frame[data-group="0"][data-option="0"]').dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    assert.equal(await page.locator(".canvas-keep").textContent(), "Hold to copy choice");
  });
});

test("Canvas keeps an explicit choice even when source selection changes later", async () => {
  await withCanvas(async (page) => {
    await page.evaluate(() => {
      window.__copied = [];
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.__copied.push(text); } } });
    });
    const host = page.locator("[data-unship-toolbar]");
    const act = (group, option, action) => host.evaluate((node, { group, option, action }) => {
      const root = node.shadowRoot;
      root.querySelector(`.canvas-frame[data-group="${group}"][data-option="${option}"]`).dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      root.querySelector(`.canvas-frame-toolbar [data-action="canvas-${action}"]`).click();
    }, { group, option, action });
    await act(1, 1, "keep");
    await page.waitForFunction(() => window.__copied.length === 1);
    await page.evaluate(() => {
      const group = document.querySelector('[data-unship-pick="Hero"]');
      group.children[0].hidden = false;
      group.children[1].hidden = true;
    });
    await act(0, 1, "keep");
    await page.waitForFunction(() => window.__copied.length === 2);
    const text = await page.evaluate(() => window.__copied.at(-1));
    assert.match(text, /Unship selection: "Direct" for "Hero"/);
    assert.doesNotMatch(text, /Unship selection: "Proof"/);
  });
});

test("Canvas does not mark failed copies as kept", async () => {
  await withCanvas(async (page) => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } } });
      document.execCommand = () => false;
    });
    const frame = page.locator('[data-unship-toolbar] .canvas-frame').first();
    await frame.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[data-unship-toolbar]').shadowRoot.querySelector('[aria-live]').textContent === 'Copy failed');
    assert.equal(await page.locator('[data-unship-toolbar] .canvas-frame.kept').count(), 0);
    assert.equal(await page.locator('.canvas-keep').textContent(), "Couldn't copy. Try again");
  });
});

test("Canvas resolves valid groups after an empty group", async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(PAGE.replace('<main>', '<main><section data-unship-pick="Empty"></section>'));
    await page.getByRole("button", { name: "Open Canvas" }).click();
    await page.waitForFunction(() => document.querySelector('[data-unship-toolbar]').shadowRoot.querySelectorAll('.canvas-frame.ready').length === 6);
    const frame = page.locator('[data-unship-toolbar] .canvas-frame[data-group="1"]').first();
    await frame.focus();
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.__copied = text; } } }));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => Boolean(window.__copied));
    assert.match(await page.evaluate(() => window.__copied), /Unship selection: "Proof" for "Hero"/);
  } finally { await browser.close(); }
});

test("Canvas contains keyboard focus and Escape returns to the page", async () => {
  await withCanvas(async (page) => {
    const host = page.locator('[data-unship-toolbar]');
    await page.getByRole('button', {name:'Use dark Canvas theme'}).focus();
    await page.keyboard.press('Tab');
    assert.equal(await host.evaluate(h => document.activeElement === h && Boolean(h.shadowRoot.activeElement)), true);
    const frame = host.locator('.canvas-frame[data-group="1"]').first();
    await frame.focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__unshipPicker.getState().canvas.open), false);
    assert.equal(await host.getAttribute('aria-modal'), null);
  });
});


test("Canvas leaves keyboard zoom and browser tab shortcuts alone", async () => {
  await withCanvas(checkCanvasShortcuts);
});

test('live Canvas restores nodes, layout and styles and keeps state after repeated entry', async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>[hidden]{display:none!important}.card{padding:20px}</style><section data-unship-pick="Form"><div class="card" style="color:blue" data-unship-option="A"><input value="Before"><button>Count 0</button></div><div class="card" data-unship-option="B" hidden>Other</div></section><script>window.saved=document.querySelector('input');window.savedParent=saved.parentNode;let count=0;document.querySelector('button').onclick=e=>e.target.textContent='Count '+(++count);</script><script>${picker}</script>`);
    const styles = await page.locator('[data-unship-option]').evaluateAll(nodes => nodes.map(n => n.style.cssText || null));
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Open Canvas', exact: true }).click();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-live-option]')).visibility === 'visible');
      await page.locator('input').fill('Edited');
      await page.locator('.card button').click();
      await page.getByRole('button', { name: 'Back to page', exact: true }).click();
      await page.getByRole('button', { name: 'Open Canvas', exact: true }).waitFor();
    }
    assert.equal(await page.evaluate(() => saved === document.querySelector('input') && saved.parentNode === window.savedParent), true);
    assert.equal(await page.locator('input').inputValue(), 'Edited');
    assert.equal(await page.locator('.card button').textContent(), 'Count 2');
    assert.deepEqual(await page.locator('[data-unship-option]').evaluateAll(nodes => nodes.map(n => n.style.cssText || null)), styles);
    assert.equal(await page.locator('[data-live-option]').count(), 0);
    assert.equal(await page.locator('iframe').count(), 0);
  } finally { await browser.close(); }
});

test('Canvas returns to the interacting option for a portal without losing the overlay', async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>[hidden]{display:none!important}</style><section data-unship-pick="Menu"><div data-unship-option="A">First</div><div data-unship-option="B" hidden><button onclick="const menu=document.createElement('button');menu.id='portal';menu.style.cssText='position:fixed;top:20px;left:20px';menu.textContent='Portal action';document.body.append(menu)">Open menu</button></div></section><script>${picker}</script>`);
    await page.getByRole('button', { name: 'Open Canvas', exact: true }).click();
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.waitForFunction(() => !__unshipPicker.getState().canvas.open);
    await page.getByRole('button', { name: 'Portal action', exact: true }).click();
    assert.equal(await page.locator('[data-unship-option="B"]').evaluate(n => n.hidden), false);
    assert.equal(await page.locator('[data-unship-option="A"]').evaluate(n => n.hidden), true);
  } finally { await browser.close(); }
});

test('Canvas safely restores remaining options when a component is removed', async () => {
  await withCanvas(async page => {
    await page.locator('[data-unship-option="Direct"]').evaluate(n => n.remove());
    await page.waitForFunction(() => !__unshipPicker.getState().canvas.open);
    assert.equal(await page.locator('[data-live-option]').count(), 0);
    assert.equal(await page.locator('[data-unship-option][popover]').count(), 0);
    assert.equal(await page.locator('[data-unship-option="Proof"]').isVisible(), true);
  });
});

test('Canvas preserves inline changes made by the app during comparison', async () => {
  await withCanvas(async page => {
    await page.locator('[data-unship-option="Proof"]').evaluate(n => n.style.color = 'rgb(10, 20, 30)');
    await page.getByRole('button', { name: 'Back to page', exact: true }).click();
    assert.equal(await page.locator('[data-unship-option="Proof"]').evaluate(n => n.style.color), 'rgb(10, 20, 30)');
  });
});

test('Canvas leaves app-owned popover option roots untouched', async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`<section data-unship-pick="Popover"><div data-unship-option="A" popover="manual">A</div></section><script>${picker}</script>`);
    await page.getByRole('button', { name: 'Open Canvas', exact: true }).click();
    assert.equal(await page.evaluate(() => __unshipPicker.getState().canvas.open), false);
    assert.equal(await page.locator('[data-unship-option]').getAttribute('popover'), 'manual');
    assert.equal(await page.locator('[data-live-option]').count(), 0);
  } finally { await browser.close(); }
});
