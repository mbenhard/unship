import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

const PICKER = new URL("../src/picker/unship-picker.js", import.meta.url).pathname;

test("picker discovers one group and switches without network or reload", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.setContent(`
    <section data-unship-pick="Hero">
      <div data-unship-option="Current">A</div>
      <div data-unship-option="Proof-led" hidden>B</div>
    </section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  assert.equal(await page.locator('[data-unship-option="Current"]').isVisible(), true);
  assert.equal(await page.locator('[data-unship-option="Proof-led"]').isVisible(), false);
  await page.getByRole("button", { name: /next/i }).click();
  assert.equal(await page.locator('[data-unship-option="Current"]').isVisible(), false);
  assert.equal(await page.locator('[data-unship-option="Proof-led"]').isVisible(), true);
  assert.equal(requests.length, 0);
  await browser.close();
});

test("picker keeps multiple groups independent", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`
    <section data-unship-pick="Hero">
      <div data-unship-option="Current">Hero A</div>
      <div data-unship-option="Visual" hidden>Hero B</div>
    </section>
    <section data-unship-pick="Pricing">
      <div data-unship-option="Simple">Price A</div>
      <div data-unship-option="Detailed" hidden>Price B</div>
    </section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  await page.getByRole("button", { name: /next option/i }).click();
  const state = await page.evaluate(() => window.__unshipPicker.getState());
  assert.equal(state.groups.length, 2);
  assert.equal(state.groups[0].activeOptionIndex, 1);
  assert.equal(state.groups[1].activeOptionIndex, 0);
  await browser.close();
});

test("picker is singleton and destroy removes toolbar", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const source = await readFile(PICKER, "utf8");
  await page.setContent(`<section data-unship-pick="Hero"><div data-unship-option="Current">A</div></section><script>${source}</script><script>${source}</script>`);
  assert.equal(await page.locator("[data-unship-toolbar]").count(), 1);
  await page.evaluate(() => window.__unshipPicker.destroy());
  assert.equal(await page.locator("[data-unship-toolbar]").count(), 0);
  await browser.close();
});

test("picker uses all-hidden fallback, missing labels, and direct-child option discovery", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`
    <section data-unship-pick="Hero">
      <div data-unship-option hidden>A</div>
      <div><div data-unship-option="Nested">Ignored</div></div>
      <div data-unship-option="Named" hidden>B</div>
    </section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  const state = await page.evaluate(() => window.__unshipPicker.getState());
  assert.deepEqual(state.groups[0].options, ["Option 1", "Named"]);
  assert.equal(state.groups[0].activeOptionIndex, 0);
  assert.equal(await page.locator('[data-unship-option="Named"]').isVisible(), false);
  await browser.close();
});

test("picker keyboard controls are scoped to toolbar focus", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`
    <button id="outside">Outside</button>
    <section data-unship-pick="Hero">
      <div data-unship-option="Current">A</div>
      <div data-unship-option="Proof-led" hidden>B</div>
    </section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  await page.locator("#outside").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal((await page.evaluate(() => window.__unshipPicker.getState())).groups[0].activeOptionIndex, 0);
  await page.getByRole("button", { name: /Hero, Current/ }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal((await page.evaluate(() => window.__unshipPicker.getState())).groups[0].activeOptionIndex, 1);
  await browser.close();
});

test("picker repairs focus and announces option switches", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`
    <section data-unship-pick="Hero">
      <button data-unship-option="Current">A</button>
      <button data-unship-option="Proof-led" hidden>B</button>
    </section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  await page.locator('[data-unship-option="Current"]').focus();
  await page.getByRole("button", { name: /next option/i }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-unship-option")), "Proof-led");
  const live = await page.locator("[data-unship-toolbar]").evaluate((host) => host.shadowRoot.querySelector("[aria-live]").textContent);
  assert.match(live, /Hero, Proof-led, option 2 of 2/);
  await browser.close();
});

test("picker disambiguates duplicate group labels in state and toolbar", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`
    <section data-unship-pick="Hero"><div data-unship-option="Current">A</div></section>
    <section data-unship-pick="Hero"><div data-unship-option="Current">B</div></section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  const state = await page.evaluate(() => window.__unshipPicker.getState());
  assert.deepEqual(state.groups.map((group) => group.displayLabel), ["Hero 1", "Hero 2"]);
  assert.match(await page.locator("[data-unship-toolbar]").evaluate((host) => host.shadowRoot.textContent), /Hero 1/);
  await browser.close();
});

test("picker persists selections only when local persistence is enabled", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const source = await readFile(PICKER, "utf8");
  const html = `<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Proof-led" hidden>B</div></section><script data-unship-persist="local">${source}</script>`;
  await page.route("http://unship.test/", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://unship.test/");
  await page.getByRole("button", { name: /next option/i }).click();
  await page.reload();

  const state = await page.evaluate(() => window.__unshipPicker.getState());
  assert.equal(state.groups[0].activeOptionIndex, 1);
  await browser.close();
});

test("picker survives removing the selected option during rescan", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(`
    <section data-unship-pick="Hero">
      <div data-unship-option="Current">A</div>
      <div data-unship-option="Proof-led" hidden>B</div>
    </section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  await page.getByRole("button", { name: /next option/i }).click();
  await page.locator('[data-unship-option="Proof-led"]').evaluate((node) => node.remove());
  await page.waitForFunction(() => window.__unshipPicker.getState().groups[0].options.length === 1);
  const state = await page.evaluate(() => window.__unshipPicker.getState());
  assert.equal(state.groups[0].activeOptionIndex, 0);
  assert.equal(await page.locator('[data-unship-option="Current"]').isVisible(), true);
  assert.deepEqual(errors, []);
  await browser.close();
});

test("picker group button opens a menu for choosing groups", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`
    <section data-unship-pick="Hero">
      <div data-unship-option="Current">Hero A</div>
      <div data-unship-option="Visual" hidden>Hero B</div>
    </section>
    <section data-unship-pick="Pricing">
      <div data-unship-option="Simple">Price A</div>
      <div data-unship-option="Detailed" hidden>Price B</div>
    </section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  await page.getByRole("button", { name: /Active group Hero/ }).click();
  assert.equal(await page.getByRole("menuitem", { name: /Pricing, Simple/ }).isVisible(), true);
  await page.getByRole("menuitem", { name: /Pricing, Simple/ }).click();
  assert.equal((await page.evaluate(() => window.__unshipPicker.getState())).activeGroupIndex, 1);
  await browser.close();
});

test("picker global shortcuts are opt-in and guarded", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const source = await readFile(PICKER, "utf8");
  await page.setContent(`
    <input id="field">
    <section data-unship-pick="Hero">
      <div data-unship-option="Current">A</div>
      <div data-unship-option="Proof-led" hidden>B</div>
    </section>
    <script data-unship-global-shortcuts>${source}</script>
  `);

  await page.locator("#field").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal((await page.evaluate(() => window.__unshipPicker.getState())).groups[0].activeOptionIndex, 0);
  await page.locator("#field").blur();
  await page.keyboard.press("ArrowRight");
  assert.equal((await page.evaluate(() => window.__unshipPicker.getState())).groups[0].activeOptionIndex, 1);
  await browser.close();
});

test("picker falls back to toolbar label when incoming option is not focusable", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`
    <section data-unship-pick="Hero">
      <button data-unship-option="Current">A</button>
      <div data-unship-option="Proof-led" hidden>B</div>
    </section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  await page.locator('[data-unship-option="Current"]').focus();
  await page.getByRole("button", { name: /next option/i }).click();
  const active = await page.locator("[data-unship-toolbar]").evaluate((host) => host.shadowRoot.activeElement?.className);
  assert.equal(active, "label");
  await browser.close();
});

test("picker moves to top when bottom-focused host controls would be obscured", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(`
    <input id="bottom" style="position:fixed;bottom:8px;left:20px">
    <section data-unship-pick="Hero"><div data-unship-option="Current">A</div></section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  await page.locator("#bottom").focus();
  const dockClass = await page.locator("[data-unship-toolbar]").evaluate((host) => host.shadowRoot.querySelector(".dock").className);
  assert.match(dockClass, /top/);
  await browser.close();
});

test("picker updates state when option labels change", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`
    <section data-unship-pick="Hero"><div data-unship-option="Current">A</div></section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  await page.locator('[data-unship-option="Current"]').evaluate((node) => node.setAttribute("data-unship-option", "Renamed"));
  await page.waitForFunction(() => window.__unshipPicker.getState().groups[0].options[0] === "Renamed");
  assert.equal((await page.evaluate(() => window.__unshipPicker.getState())).groups[0].options[0], "Renamed");
  await browser.close();
});
