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
  <header class="header" data-unship-pick="Header" data-unship-canvas="stack">
    <div data-unship-option="A">Header A</div><div data-unship-option="B" hidden>Header B</div>
  </header>
  <section class="hero" data-unship-pick="Hero" data-unship-canvas="matrix" style="--gap:32px" data-unship-tweaks='[{"type":"slider","label":"Gap","var":"--gap","min":16,"max":64,"step":8,"unit":"px"}]'>
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
      return root?.querySelectorAll(".canvas-frame.ready").length === 10;
    });
    return await callback(page);
  } finally {
    await browser.close();
  }
}

test("Canvas renders every opted-in option using the agent Arrangements", async () => {
  await withCanvas(async (page) => {
    const state = await page.locator("[data-unship-toolbar]").evaluate((host) => {
      const root = host.shadowRoot;
      return {
        groups: Array.from(root.querySelectorAll(".canvas-group-name")).map((node) => node.textContent),
        frames: root.querySelectorAll(".canvas-frame").length,
        matrixWidths: Array.from(root.querySelectorAll('.canvas-group[data-group="1"] .canvas-frame')).map((frame) => frame.dataset.width),
        visibleMatrixWidths: Array.from(root.querySelectorAll('.canvas-group[data-group="1"] .canvas-frame:not(.viewport-hidden)')).map((frame) => frame.dataset.width),
        responsiveControl: (() => { const button = root.querySelector('.canvas-responsive-toggle'); return [button.title, button.getAttribute("aria-pressed")]; })(),
        gridFrameWidth: root.querySelector('.canvas-group[data-group="2"] .canvas-frame').style.width,
        frameChrome: (() => { const style = getComputedStyle(root.querySelector('.canvas-group[data-group="2"] .canvas-frame')); return [style.backgroundColor, style.borderTopWidth, style.boxShadow]; })(),
        canvasBackground: getComputedStyle(root.querySelector(".canvas-shell")).backgroundColor,
        snapshotBackgrounds: (() => { const doc = root.querySelector(".canvas-frame iframe").contentDocument; return [getComputedStyle(doc.documentElement).backgroundColor, getComputedStyle(doc.body).backgroundColor]; })(),
        scripts: Array.from(root.querySelectorAll("iframe")).map((frame) => frame.contentDocument.scripts.length),
        camera: root.querySelector(".canvas-world").style.transform,
        globalPanzoom: typeof window.Panzoom
      };
    });
    assert.deepEqual(state.groups, ["Header", "Hero", "Cards"]);
    assert.equal(state.frames, 10);
    assert.deepEqual(state.matrixWidths, ["1280", "768", "390", "1280", "768", "390"]);
    assert.deepEqual(state.visibleMatrixWidths, ["1280", "1280"]);
    assert.deepEqual(state.responsiveControl, ["Show responsive previews", "false"]);
    assert.equal(state.gridFrameWidth, "320px");
    assert.deepEqual(state.frameChrome, ["rgba(0, 0, 0, 0)", "0px", "none"]);
    assert.equal(state.canvasBackground, "rgb(255, 255, 255)");
    assert.deepEqual(state.snapshotBackgrounds, ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
    assert.deepEqual(state.scripts, Array(10).fill(0));
    assert.match(state.camera, /^scale\(/);
    assert.equal(state.globalPanzoom, "undefined");
  });
});

test("Canvas keeps the native preview visible until its visible Frames are prepared", async () => {
  const browser = await launchBrowser();
  let releaseImages;
  const imageGate = new Promise((resolve) => { releaseImages = resolve; });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route("https://unship.test/slow.svg", async (route) => {
      await imageGate;
      await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><path fill="#ddd" d="M0 0h8v8H0z"/></svg>' });
    });
    const slowPage = PAGE.replace(
      '<div data-unship-option="Proof">Proof</div>',
      '<div data-unship-option="Proof"><img src="https://unship.test/slow.svg" alt="">Proof</div>'
    );
    await page.setContent(slowPage, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open Canvas" }).click();
    await page.waitForFunction(() => window.__unshipPicker?.getState().canvas.preparing);
    const preparing = await page.locator("[data-unship-toolbar]").evaluate((host) => {
      const root = host.shadowRoot;
      const shell = root.querySelector(".canvas-shell");
      const button = root.querySelector('[data-action="open-canvas"]');
      return {
        open: window.__unshipPicker.getState().canvas.open,
        label: button.textContent,
        ariaLabel: button.getAttribute("aria-label"),
        spinner: Boolean(button.querySelector(".canvas-spinner")),
        width: button.getBoundingClientRect().width,
        opacity: getComputedStyle(shell).opacity,
        pointerEvents: getComputedStyle(shell).pointerEvents,
        overflow: document.documentElement.style.overflow
      };
    });
    assert.deepEqual(preparing, { open: false, label: "", ariaLabel: "Preparing Canvas", spinner: true, width: 59, opacity: "0", pointerEvents: "none", overflow: "" });

    releaseImages();
    await page.getByRole("button", { name: "Close Canvas" }).waitFor();
    await page.waitForFunction(() => document.querySelector("[data-unship-toolbar]")?.shadowRoot.querySelector(".canvas-shell.content-visible"));
    assert.equal(await page.evaluate(() => window.__unshipPicker.getState().canvas.open), true);
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "hidden");
  } finally {
    releaseImages?.();
    await browser.close();
  }
});

test("Canvas matrix previews default to Desktop and toggle all responsive widths together", async () => {
  await withCanvas(async (page) => {
    const host = page.locator("[data-unship-toolbar]");
    const scaleBefore = await host.evaluate((node) => Number(node.shadowRoot.querySelector(".canvas-world").style.transform.match(/scale\(([^)]+)\)/)[1]));
    const responsiveToggle = await host.evaluate(async (node) => {
      const root = node.shadowRoot;
      const anchor = root.querySelector('.canvas-matrix .canvas-frame:not(.viewport-hidden)');
      const button = root.querySelector('.canvas-responsive-toggle');
      const left = () => anchor.getBoundingClientRect().left;
      const before = left();
      button.click();
      const sync = left();
      await new Promise(requestAnimationFrame);
      const firstFrame = left();
      await new Promise(requestAnimationFrame);
      return { before, sync, firstFrame, secondFrame: left() };
    });
    for (const [phase, left] of Object.entries(responsiveToggle)) {
      if (phase === "before") continue;
      assert.equal(Math.abs(left - responsiveToggle.before) < 0.5, true, `responsive toggle shifted the existing Frame during ${phase}`);
    }
    await page.waitForTimeout(250);
    const visible = await host.evaluate((node) => {
      const frames = Array.from(node.shadowRoot.querySelectorAll('.canvas-matrix .canvas-frame:not(.viewport-hidden)'));
      const scale = Number(node.shadowRoot.querySelector(".canvas-world").style.transform.match(/scale\(([^)]+)\)/)[1]);
      return { widths: frames.map((frame) => frame.dataset.width), heights: frames.map((frame) => frame.querySelector("iframe").offsetHeight), scale };
    });
    assert.deepEqual(visible.widths, ["1280", "768", "390", "1280", "768", "390"]);
    assert.equal(visible.heights.every((height) => height > 100), true, "revealed responsive Frames must be remeasured");
    assert.equal(Math.abs(visible.scale - scaleBefore) < 0.0001, true, "responsive toggles must not refit or zoom the Canvas");

    const responsiveButton = page.getByRole("button", { name: "Show desktop-only previews" });
    assert.equal(await responsiveButton.getAttribute("aria-pressed"), "true");
    await responsiveButton.click();
    const desktopOnly = await host.evaluate((node) => Array.from(node.shadowRoot.querySelectorAll('.canvas-matrix .canvas-frame:not(.viewport-hidden)')).map((frame) => frame.dataset.width));
    assert.deepEqual(desktopOnly, ["1280", "1280"]);
    assert.equal(await page.getByRole("button", { name: "Show responsive previews" }).getAttribute("aria-pressed"), "false");
  });
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
    await page.getByRole("button", { name: "Show responsive previews" }).click();
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
      const rect = node.shadowRoot.querySelector('.canvas-frame[data-group="1"][data-option="0"][data-width="768"]').getBoundingClientRect();
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
    await page.getByRole("button", { name: "Close Canvas" }).waitFor({ state: "visible" });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.getByRole("button", { name: "Close Canvas" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Zoom in" }).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: /Canvas theme/ }).isVisible(), true);
    const dock = await page.locator("[data-unship-toolbar]").evaluate((node) => node.shadowRoot.querySelector(".canvas-dock").getBoundingClientRect().toJSON());
    assert.equal(dock.left >= 0 && dock.right <= 320, true);
  } finally {
    await browser.close();
  }
});

test("Canvas reuses tuning and keeps a warm prepared session across close and reopen", async () => {
  await withCanvas(async (page) => {
    const host = page.locator("[data-unship-toolbar]");
    const heroFrame = host.locator('.canvas-frame[data-group="1"][data-option="0"]').first();
    await heroFrame.press("T");
    assert.equal(await page.getByRole("slider", { name: "Gap" }).isVisible(), true);
    await host.evaluate((node) => {
      const input = node.shadowRoot.querySelector(".tweak-range");
      input.value = "64";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(50);
    const values = await host.evaluate((node) => {
      const root = node.shadowRoot;
      return Array.from(root.querySelectorAll('.canvas-iframe[data-group="1"][data-option="0"]')).map((frame) =>
        frame.contentDocument.querySelectorAll("[data-unship-pick]")[1].style.getPropertyValue("--gap")
      );
    });
    assert.deepEqual(values, ["64px", "64px", "64px"]);

    const dockIdentity = await host.evaluate((node) => {
      const dock = node.shadowRoot.querySelector(".canvas-dock");
      window.__unshipCanvasDock = dock;
      return Boolean(dock);
    });
    assert.equal(dockIdentity, true);
    await page.getByRole("button", { name: "Use dark Canvas theme" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(240);
    const controls = await host.evaluate((node) => ({
      theme: node.shadowRoot.querySelector(".canvas-shell").dataset.theme,
      zoom: node.shadowRoot.querySelector(".canvas-zoom-value").textContent,
      sameDock: node.shadowRoot.querySelector(".canvas-dock") === window.__unshipCanvasDock
    }));
    assert.equal(controls.theme, "dark");
    assert.match(controls.zoom, /%$/);
    assert.equal(controls.sameDock, true, "theme changes must update the existing dock instead of remounting it");

    const cachedBefore = await host.evaluate((node) => {
      const root = node.shadowRoot;
      window.__unshipCachedFrame = root.querySelector(".canvas-frame");
      return root.querySelector(".canvas-world").style.transform;
    });

    await page.getByRole("button", { name: "Close Canvas" }).click();
    await page.waitForTimeout(220);
    const closed = await host.evaluate((node) => {
      const shell = node.shadowRoot.querySelector(".canvas-shell");
      return {
        cached: window.__unshipPicker.getState().canvas.cached,
        preparing: window.__unshipPicker.getState().canvas.preparing,
        shell: Boolean(shell),
        visible: shell?.classList.contains("visible"),
        pointerEvents: shell ? getComputedStyle(shell).pointerEvents : "missing"
      };
    });
    assert.deepEqual(closed, { cached: true, preparing: false, shell: true, visible: false, pointerEvents: "none" });
    assert.equal(await page.getByRole("button", { name: "Open Canvas" }).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "Open Canvas" }).evaluate((button) => button === button.getRootNode().activeElement), true);
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "");

    await page.getByRole("button", { name: "Open Canvas" }).click();
    await page.waitForFunction(() => window.__unshipPicker.getState().canvas.open);
    const reopened = await host.evaluate((node) => {
      const root = node.shadowRoot;
      return {
        sameFrame: root.querySelector(".canvas-frame") === window.__unshipCachedFrame,
        transform: root.querySelector(".canvas-world").style.transform,
        theme: root.querySelector(".canvas-shell").dataset.theme,
        preparing: window.__unshipPicker.getState().canvas.preparing
      };
    });
    assert.deepEqual(reopened, { sameFrame: true, transform: cachedBefore, theme: "dark", preparing: false });
  });
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
    assert.match(copied, /Keep "B" for "Header"/);
    assert.match(copied, /Keep "Direct" for "Hero" with Gap 32px/);
    const kept = await host.evaluate((node) => Array.from(node.shadowRoot.querySelectorAll(".canvas-frame.kept")).map((frame) => `${frame.dataset.group}:${frame.dataset.option}`));
    assert.deepEqual(kept, ["0:1", "1:1", "1:1", "1:1"]);
  });
});

test("Canvas keeps an explicit choice even when a different option is tuned later", async () => {
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
    await act(1, 0, "tune");
    await act(0, 1, "keep");
    await page.waitForFunction(() => window.__copied.length === 2);
    const text = await page.evaluate(() => window.__copied.at(-1));
    assert.match(text, /Keep "Direct" for "Hero"/);
    assert.doesNotMatch(text, /Keep "Proof"/);
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
  });
});

test("Canvas rebuilds cached frames after in-place source edits", async () => {
  await withCanvas(async (page) => {
    await page.getByRole("button", { name: "Close Canvas" }).click();
    await page.getByRole("button", { name: "Open Canvas" }).waitFor();
    await page.evaluate(() => {
      const option = document.querySelector('.hero [data-unship-option="Proof"]');
      option.firstChild.data = "Updated proof";
      option.style.color = "rgb(255, 0, 0)";
    });
    await page.getByRole("button", { name: "Open Canvas" }).click();
    await page.waitForFunction(() => {
      const frame = document.querySelector('[data-unship-toolbar]').shadowRoot.querySelector('.canvas-iframe[data-group="1"]');
      return frame?.contentDocument?.querySelector('.hero [data-unship-option="Proof"]')?.textContent === 'Updated proof';
    });
    const color = await page.locator('[data-unship-toolbar]').evaluate(host => {
      const frame = host.shadowRoot.querySelector('.canvas-iframe[data-group="1"]');
      return frame.contentWindow.getComputedStyle(frame.contentDocument.querySelector('.hero [data-unship-option="Proof"]')).color;
    });
    assert.equal(color, "rgb(255, 0, 0)");
  });
});

test("Canvas resolves valid groups after an empty group", async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(PAGE.replace('<main>', '<main><section data-unship-pick="Empty"></section>'));
    await page.getByRole("button", { name: "Open Canvas" }).click();
    await page.waitForFunction(() => document.querySelector('[data-unship-toolbar]').shadowRoot.querySelectorAll('.canvas-frame.ready').length === 10);
    const frame = page.locator('[data-unship-toolbar] .canvas-frame[data-group="1"]').first();
    await frame.focus();
    await page.keyboard.press("t");
    await page.getByRole("slider", { name: "Gap" }).waitFor();
  } finally { await browser.close(); }
});

test("Canvas contains keyboard focus and Escape closes tuning before Canvas", async () => {
  await withCanvas(async (page) => {
    const host = page.locator('[data-unship-toolbar]');
    await page.getByRole('button', {name:'Use dark Canvas theme'}).focus();
    await page.keyboard.press('Tab');
    assert.equal(await host.evaluate(h => document.activeElement === h && Boolean(h.shadowRoot.activeElement)), true);
    const frame = host.locator('.canvas-frame[data-group="1"]').first();
    await frame.focus();
    await page.keyboard.press('t');
    await page.getByRole('slider', {name:'Gap'}).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__unshipPicker.getState().canvas.open), true);
    assert.equal(await host.locator('.dock.tuning').count(), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__unshipPicker.getState().canvas.open), false);
    assert.equal(await host.getAttribute('aria-modal'), null);
  });
});


test("Canvas preserves grid sibling space when isolating a group", async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(`<style>body{margin:0}.app{display:grid;grid-template-columns:216px minmax(0,1fr)}main{padding:32px}aside{min-height:600px}</style><div class="app"><aside>Navigation</aside><main><section data-unship-pick="Content" data-unship-canvas="matrix"><div data-unship-option="A">Content</div><div data-unship-option="B" hidden>Other</div></section></main></div><script>${picker}</script>`);
    const expected = await page.locator('[data-unship-pick]').evaluate((group) => group.getBoundingClientRect().width);
    await page.getByRole("button", { name: "Open Canvas" }).click();
    await page.waitForFunction(() => document.querySelector('[data-unship-toolbar]').shadowRoot.querySelectorAll('.canvas-frame.ready').length === 6);
    const actual = await page.locator('[data-unship-toolbar]').evaluate((host) => host.shadowRoot.querySelector('iframe').contentDocument.querySelector('[data-unship-pick]').getBoundingClientRect().width);
    assert.equal(actual, expected);
    await page.getByRole("button", { name: "Show responsive previews", exact: true }).click();
    await page.waitForFunction(() => Array.from(document.querySelector('[data-unship-toolbar]').shadowRoot.querySelectorAll('iframe')).every((frame) => Math.abs(frame.contentDocument.querySelector('[data-unship-pick]').getBoundingClientRect().top) < 1));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Fit Canvas", exact: true }).click();
    await page.waitForTimeout(220);
    const bounds = await page.locator('[data-unship-toolbar]').evaluate((host) => {
      const rect = host.shadowRoot.querySelector('.canvas-world').getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    assert.ok(bounds.left >= 0 && bounds.right <= 390, "Fit includes every responsive column on a phone");
  } finally {
    await browser.close();
  }
});
