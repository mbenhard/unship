import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactsDir = join(rootDir, "e2e", "artifacts");
const picker = await readFile(join(rootDir, "src", "picker", "unship-picker.js"), "utf8");

await mkdir(artifactsDir, { recursive: true });

const html = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 140vh;
        color: #16181d;
        background: #f5f7fb;
        font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main { width: min(1080px, calc(100vw - 32px)); margin: 0 auto; padding: 48px 0 180px; }
      .hero, .pricing {
        min-height: 360px;
        display: grid;
        align-items: center;
        border: 1px solid #dde3ee;
        border-radius: 28px;
        background: white;
        box-shadow: 0 24px 70px rgba(27, 39, 65, .12);
        overflow: hidden;
      }
      .hero > [data-unship-option], .pricing > [data-unship-option] { padding: clamp(28px, 6vw, 74px); }
      .hero h1 { max-width: 820px; margin: 0 0 18px; font-size: clamp(38px, 7vw, 78px); line-height: .95; letter-spacing: 0; }
      .hero p { max-width: 640px; margin: 0; color: #4c5567; font-size: 19px; }
      .hero button, .bottom-field {
        min-height: 44px;
        border: 1px solid #c8d0df;
        border-radius: 8px;
        background: #fff;
        padding: 0 14px;
        font: inherit;
      }
      .pricing { margin-top: 28px; min-height: 260px; }
      .pricing h2 { margin: 0 0 14px; font-size: 30px; letter-spacing: 0; }
      .bottom-row {
        position: fixed;
        left: 24px;
        right: 24px;
        bottom: 18px;
        display: flex;
        justify-content: flex-end;
        pointer-events: none;
      }
      .bottom-field { width: min(320px, 100%); pointer-events: auto; }
      @media (max-width: 520px) {
        main { width: calc(100vw - 20px); padding-top: 20px; }
        .hero, .pricing { border-radius: 18px; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero" data-unship-pick="Hero">
        <div data-unship-option="Current">
          <h1>Build local interface variants without adding product machinery.</h1>
          <p>A small picker lets the human compare temporary source-level options in the real app.</p>
          <button>Focusable current CTA</button>
        </div>
        <div data-unship-option="Proof-led" hidden>
          <h1>Compare the strongest UI direction in the app, not in a mockup.</h1>
          <p>Agents create variants in source. The picker only switches what is already in the DOM.</p>
        </div>
        <div data-unship-option="Compact Story With A Long Variant Name" hidden>
          <h1>Try the compact story.</h1>
          <p>This intentionally long option name checks truncation, sizing, and polish.</p>
        </div>
      </section>
      <section class="pricing" data-unship-pick="Pricing Panel">
        <div data-unship-option="Simple">
          <h2>Simple pricing</h2>
          <p>One clear path, with no permanent runtime dependency.</p>
        </div>
        <div data-unship-option="Detailed" hidden>
          <h2>Detailed pricing</h2>
          <p>More proof and plan comparison for teams that need it.</p>
        </div>
      </section>
    </main>
    <div class="bottom-row"><input class="bottom-field" placeholder="Focus me to test toolbar placement" /></div>
    <script>${picker}</script>
  </body>
</html>`;

await writeFile(join(artifactsDir, "fixture.html"), html);

const browser = await chromium.launch();
const report = {
  screenshots: [],
  metrics: {}
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await waitForToolbar(page);

  await screenshot(page, "desktop-initial");
  await assertToolbarQuality(page, { viewportWidth: 1280, viewportHeight: 800 });

  await page.getByRole("button", { name: /next option/i }).click();
  await assertVisibleOption(page, "Hero", "Proof-led");
  await page.getByRole("button", { name: /next option/i }).click();
  await assertVisibleOption(page, "Hero", "Compact Story With A Long Variant Name");

  await page.getByRole("button", { name: /active group hero/i }).click();
  await screenshot(page, "desktop-menu-open");
  await assertToolbarQuality(page, { viewportWidth: 1280, viewportHeight: 800, menuOpen: true });

  await page.getByRole("menuitem", { name: /pricing panel/i }).click();
  await assert.equal((await state(page)).activeGroupIndex, 1);
  await page.getByRole("button", { name: /previous option/i }).click();
  await assertVisibleOption(page, "Pricing Panel", "Detailed");

  const beforeBodyKey = await activeOption(page, "Pricing Panel");
  await page.keyboard.press("ArrowLeft");
  await assert.equal(await activeOption(page, "Pricing Panel"), beforeBodyKey);

  await page.getByRole("button", { name: /next option/i }).focus();
  await page.keyboard.press("ArrowRight");
  await assertVisibleOption(page, "Pricing Panel", "Simple");

  await page.locator(".bottom-field").focus();
  await page.waitForTimeout(30);
  await assert.equal(await dockPlacement(page), "top");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.setContent(html, { waitUntil: "domcontentloaded" });
  await waitForToolbar(mobile);
  await screenshot(mobile, "mobile-initial");
  await assertToolbarQuality(mobile, { viewportWidth: 390, viewportHeight: 844 });
  await mobile.getByRole("button", { name: /active group hero/i }).click();
  await screenshot(mobile, "mobile-menu-open");
  await assertToolbarQuality(mobile, { viewportWidth: 390, viewportHeight: 844, menuOpen: true });
  await mobile.close();

  report.metrics.finalState = await state(page);
  await writeFile(join(artifactsDir, "readiness-report.json"), `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}

async function screenshot(page, name) {
  const path = join(artifactsDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
}

async function waitForToolbar(page) {
  await page.waitForFunction(() => document.querySelector("[data-unship-toolbar]")?.shadowRoot?.querySelector(".dock"));
}

async function assertToolbarQuality(page, { viewportWidth, viewportHeight, menuOpen = false }) {
  const metrics = await page.locator("css=[data-unship-toolbar]").evaluate((host) => {
    const root = host.shadowRoot;
    const dock = root.querySelector(".dock");
    const box = dock.getBoundingClientRect();
    const parts = Array.from(root.querySelectorAll("button")).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        className: button.className,
        width: rect.width,
        height: rect.height,
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
        text: button.textContent.trim()
      };
    });
    return {
      dock: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        bottom: box.bottom,
        right: box.right
      },
      parts,
      visibleText: root.textContent.replace(/\s+/g, " ").trim()
    };
  });

  report.metrics[`${viewportWidth}x${viewportHeight}${menuOpen ? "-menu" : ""}`] = metrics;

  assert.equal(metrics.dock.x >= 10, true, "toolbar should keep at least 10px viewport gutter");
  assert.equal(metrics.dock.right <= viewportWidth - 10, true, "toolbar should keep right viewport gutter");
  assert.equal(metrics.dock.y >= 10, true, "toolbar should keep top viewport gutter");
  assert.equal(metrics.dock.bottom <= viewportHeight - 10, true, "toolbar should keep bottom viewport gutter");
  assert.equal(metrics.dock.width >= 288 || viewportWidth < 420, true, "desktop toolbar should not feel toy-sized");

  const minimumTarget = viewportWidth < 420 ? 40 : 32;

  for (const part of metrics.parts) {
    assert.equal(part.height >= minimumTarget, true, `${part.className} should have a comfortable ${minimumTarget}px minimum height`);
    assert.equal(part.scrollWidth <= part.clientWidth + 1, true, `${part.className} text should not overflow`);
  }

  const navButtons = metrics.parts.filter((part) => part.className.includes("nav"));
  for (const part of navButtons) {
    assert.equal(part.width >= minimumTarget, true, `${part.className} should have a comfortable ${minimumTarget}px minimum width`);
  }
}

async function state(page) {
  return page.evaluate(() => window.__unshipPicker.getState());
}

async function activeOption(page, groupLabel) {
  const current = await state(page);
  const group = current.groups.find((candidate) => candidate.label === groupLabel);
  return group.options[group.activeOptionIndex];
}

async function assertVisibleOption(page, groupLabel, optionLabel) {
  await page.waitForFunction(
    ({ groupLabel, optionLabel }) => {
      const group = window.__unshipPicker.getState().groups.find((candidate) => candidate.label === groupLabel);
      return group && group.options[group.activeOptionIndex] === optionLabel;
    },
    { groupLabel, optionLabel }
  );
}

async function dockPlacement(page) {
  return page.locator("css=[data-unship-toolbar]").evaluate((host) => {
    const dock = host.shadowRoot.querySelector(".dock");
    return dock.classList.contains("top") ? "top" : "bottom";
  });
}
