import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

const picker = await readFile(new URL("../src/picker/unship-picker.js", import.meta.url), "utf8");

const TWEAKED_PAGE = `
<section data-unship-pick="Hero" style="--hero-pad: 60px;" data-unship-tweaks='[{"type":"slider","label":"Padding","var":"--hero-pad","min":40,"max":140,"step":10,"unit":"px"}]'>
  <div data-unship-option="Essential" style="--gap: 24px; --eyebrow: block; --accent: #0071e3;" data-unship-tweaks='[
    {"type":"slider","label":"Gap","var":"--gap","min":8,"max":48,"step":4,"unit":"px"},
    {"type":"toggle","label":"Eyebrow","var":"--eyebrow","on":"block","off":"none"},
    {"type":"swatch","label":"Accent","var":"--accent","options":[{"label":"Sky","value":"#0071e3"},{"label":"Ember","value":"#f56300"}]}
  ]'>A</div>
  <div data-unship-option="Warm" hidden style="--tone: cozy;" data-unship-tweaks='[
    {"type":"slider","label":"Spacing","var":"--tone","steps":[{"label":"tight","value":"12px"},{"label":"cozy","value":"20px"},{"label":"airy","value":"32px"}]}
  ]'>B</div>
</section>
<script>${picker}</script>`;

async function withPage(callback) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(TWEAKED_PAGE);
    await page.waitForFunction(() => document.querySelector("[data-unship-toolbar]")?.shadowRoot?.querySelector(".dock"));
    return await callback(page);
  } finally {
    await browser.close();
  }
}

function shadow(page) {
  return page.locator("css=[data-unship-toolbar]");
}

test("tune icon appears when axes exist and opens the panel", async () => {
  await withPage(async (page) => {
    const hasTune = await shadow(page).evaluate((host) => Boolean(host.shadowRoot.querySelector(".tune")));
    assert.equal(hasTune, true);

    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".tune").click());
    const state = await shadow(page).evaluate((host) => {
      const root = host.shadowRoot;
      return {
        tuning: root.querySelector(".dock").classList.contains("tuning"),
        rows: Array.from(root.querySelectorAll(".tweak .tweak-name")).map((name) => name.textContent)
      };
    });
    assert.equal(state.tuning, true);
    assert.deepEqual(state.rows, ["Gap", "Eyebrow", "Accent", "Padding"]);
  });
});

test("dragging a slider writes the CSS variable and updates the readout", async () => {
  await withPage(async (page) => {
    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".tune").click());
    await shadow(page).evaluate((host) => {
      const input = host.shadowRoot.querySelector(".tweak-range");
      input.value = "40";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const applied = await page.evaluate(() =>
      document.querySelector('[data-unship-option="Essential"]').style.getPropertyValue("--gap")
    );
    assert.equal(applied, "40px");
    const readout = await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".tweak-value").textContent);
    assert.equal(readout, "40px");
  });
});

test("token-stepped sliders write step values and show step labels", async () => {
  await withPage(async (page) => {
    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".next").click());
    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".tune").click());
    await shadow(page).evaluate((host) => {
      const input = host.shadowRoot.querySelector(".tweak-range");
      input.value = "2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const applied = await page.evaluate(() =>
      document.querySelector('[data-unship-option="Warm"]').style.getPropertyValue("--tone")
    );
    assert.equal(applied, "32px");
    const readout = await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".tweak-value").textContent);
    assert.equal(readout, "airy");
  });
});

test("toggle and swatch controls write their values", async () => {
  await withPage(async (page) => {
    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".tune").click());
    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".tweak-switch").click());
    await shadow(page).evaluate((host) => host.shadowRoot.querySelectorAll(".tweak-swatch")[1].click());

    const values = await page.evaluate(() => {
      const option = document.querySelector('[data-unship-option="Essential"]');
      return {
        eyebrow: option.style.getPropertyValue("--eyebrow"),
        accent: option.style.getPropertyValue("--accent")
      };
    });
    assert.equal(values.eyebrow, "none");
    assert.equal(values.accent, "#f56300");
  });
});

test("tweak values are remembered per option across switches", async () => {
  await withPage(async (page) => {
    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".tune").click());
    await shadow(page).evaluate((host) => {
      const input = host.shadowRoot.querySelector(".tweak-range");
      input.value = "44";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".next").click());
    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".prev").click());

    const state = await shadow(page).evaluate((host) => ({
      slider: host.shadowRoot.querySelector(".tweak-range").value,
      readout: host.shadowRoot.querySelector(".tweak-value").textContent
    }));
    assert.equal(state.slider, "44");
    assert.equal(state.readout, "44px");
    const applied = await page.evaluate(() =>
      document.querySelector('[data-unship-option="Essential"]').style.getPropertyValue("--gap")
    );
    assert.equal(applied, "44px");
  });
});

test("clicking the readout resets the axis to its source default", async () => {
  await withPage(async (page) => {
    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".tune").click());
    await shadow(page).evaluate((host) => {
      const input = host.shadowRoot.querySelector(".tweak-range");
      input.value = "48";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".tweak-value").click());

    const applied = await page.evaluate(() =>
      document.querySelector('[data-unship-option="Essential"]').style.getPropertyValue("--gap")
    );
    assert.equal(applied, "24px");
  });
});

test("keep instruction carries all current axis values", async () => {
  await withPage(async (page) => {
    await page.evaluate(() => {
      window.__copied = [];
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: (text) => (window.__copied.push(text), Promise.resolve()) }
      });
    });
    await shadow(page).evaluate((host) => host.shadowRoot.querySelector(".tune").click());
    await shadow(page).evaluate((host) => {
      const input = host.shadowRoot.querySelector(".tweak-range");
      input.value = "32";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const label = await shadow(page).evaluateHandle((host) => host.shadowRoot.querySelector(".label"));
    const box = await label.asElement().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();

    const copied = await page.evaluate(() => window.__copied);
    assert.equal(copied.length, 1);
    assert.match(copied[0], /Keep "Essential" for "Hero" with Gap 32px, Eyebrow on, Accent Sky, Padding 60px; bake these values in/);
  });
});

test("malformed tweaks JSON fails soft without breaking the toolbar", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`
<section data-unship-pick="Hero">
  <div data-unship-option="A" data-unship-tweaks='[{broken'>A</div>
  <div data-unship-option="B" hidden>B</div>
</section>
<script>${picker}</script>`);
    await page.waitForFunction(() => document.querySelector("[data-unship-toolbar]")?.shadowRoot?.querySelector(".dock"));

    const state = await page.locator("css=[data-unship-toolbar]").evaluate((host) => ({
      dock: Boolean(host.shadowRoot.querySelector(".dock")),
      tune: Boolean(host.shadowRoot.querySelector(".tune"))
    }));
    assert.equal(state.dock, true);
    assert.equal(state.tune, false);
  } finally {
    await browser.close();
  }
});
