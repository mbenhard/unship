# Toolbar Motion Exploration Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `explorations/toolbar-animations.html` — an interactive comparison page with four motion systems (entrance, menu open/close, option switch) on Godly Ink dock replicas, per `docs/superpowers/specs/2026-06-04-toolbar-motion-exploration-design.md`.

**Architecture:** One static HTML file reusing the chassis from `explorations/toolbar-styles.html`. The dock anatomy mirrors `src/picker/unship-picker.js` with the Godly Ink skin baked in. Motion is 100% CSS (transitions + one shared `@keyframes`); ~45 lines of vanilla JS wire real interactions only (menu toggle, option cycling with direction, entrance replay, stage tone). Each system is a card-scoped CSS block (`.m1`–`.m4`) so the winning block ports 1:1 into the picker's `style()`.

**Tech Stack:** Plain HTML/CSS/JS, zero dependencies. Verification is visual plus repo gates.

**Key mechanisms (shared):**
- Entrance: `.dock` starts at `opacity:0` (+ per-system transform); JS adds `.in` after a double `requestAnimationFrame`; per-system transitions animate in. Replay = remove `.in`, force reflow, re-add.
- Option switch: JS swaps label/count text, sets `data-dir="next|prev"` on the dock, and re-triggers a `.swap` class. One shared keyframe uses custom properties: `@keyframes swapIn{from{opacity:0;transform:translate(var(--dx,0px),var(--dy,0px))}to{opacity:1;transform:none}}`. Direction plumbing: `.dock[data-dir="next"] .row{--dx:var(--amp)}` / `prev` negates; each system sets `--amp` (0 for fade-only systems). M4 additionally sets `--dy` on `.group` for the count tick.
- Menu: anatomy keeps the real picker's `max-height`/`opacity` mechanics with `--dur`/`--ease` tokens; each system overrides them and may add item transitions/stagger.
- `prefers-reduced-motion: reduce` kills all animation and forces docks visible.

**⚠️ Working-tree caution:** another session works in this repo. Commit only the exact paths listed.

---

### Task 1: Page with chassis, Godly Ink anatomy, interaction JS, and system M1

**Files:**
- Create: `explorations/toolbar-animations.html`

- [ ] **Step 1: Write the file**

Full content:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unship dock — motion concepts</title>
<style>
/* ============ page chrome ============ */
:root{ --stage-bg:#f1f1f3; --stage-line:rgba(0,0,0,.06); }
body.stage-dark{ --stage-bg:#141417; --stage-line:rgba(255,255,255,.06); }
*{box-sizing:border-box}
body{margin:0;background:#fafafa;color:#18181b;font:400 14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:40px 32px 80px}
header{max-width:1480px;margin:0 auto 28px;display:flex;align-items:baseline;gap:16px;flex-wrap:wrap}
h1{font-size:16px;font-weight:650;margin:0}
header p{margin:0;color:#71717a;font-size:13px}
#tone{margin-left:auto;font:500 12px/1 system-ui,sans-serif;padding:8px 14px;border:1px solid #d4d4d8;border-radius:999px;background:#fff;cursor:pointer}
.grid{max-width:1480px;margin:0 auto;display:grid;gap:28px}
@media(min-width:1100px){.grid{grid-template-columns:1fr 1fr}}
.card{border:1px solid #e4e4e7;border-radius:14px;background:#fff;overflow:hidden}
.card-head{display:flex;align-items:baseline;gap:10px;padding:14px 18px;flex-wrap:wrap}
.card-head .num{font:600 11px/1 ui-monospace,Menlo,monospace;color:#a1a1aa}
.card-head h2{font-size:13.5px;font-weight:650;margin:0}
.card-head p{margin:0;color:#71717a;font-size:12.5px}
.stage{display:flex;align-items:flex-end;justify-content:center;padding:48px 24px 22px;
  background:radial-gradient(var(--stage-line) 1px,transparent 1px) 0 0/18px 18px,var(--stage-bg);
  transition:background .2s}
.spec{display:flex;flex-direction:column;align-items:center;gap:12px}
.tag{font:500 10px/1.6 ui-monospace,Menlo,monospace;color:#85858e;letter-spacing:.05em;text-transform:uppercase}
.replay{border:0;padding:0;background:none;color:inherit;font:inherit;cursor:pointer;text-decoration:underline}

/* ============ dock anatomy — Godly Ink, mirrors src/picker/unship-picker.js ============ */
.dock{
  --h:34px; --nav:34px; --r:999px; --gap:6px; --fs:12.5px; --navfs:18px;
  --dur:.28s; --ease:cubic-bezier(.37,0,.63,1); /* motion tokens; systems override */
  width:328px; flex:none; display:block; padding:var(--gap);
  border-radius:24px; background:#000; color:#fff;
  font:500 var(--fs)/1.2 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
  letter-spacing:-.02em;
}
.dock button{border:0;margin:0;padding:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
.dock .group{display:flex;align-items:center;gap:.65em;width:100%;min-height:var(--h);padding:0 .85em 0 .95em;border-radius:var(--r);margin-bottom:var(--gap);transition:background .14s ease,color .14s ease}
.dock .group:hover{background:rgba(255,255,255,.12)}
.dock.open .group{background:#f5f5f5;color:#000}
.dock.open .group .group-count{opacity:.55}
.dock .group-name{font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dock .group-count{margin-left:auto;opacity:.7;font-variant-numeric:tabular-nums}
.dock .menu{display:grid;gap:var(--gap);overflow:hidden;max-height:0;opacity:0;visibility:hidden;transition:max-height var(--dur) var(--ease),opacity .14s ease}
.dock.open .menu{max-height:264px;opacity:1;visibility:visible}
.dock .menuitem{display:flex;align-items:center;gap:.8em;width:100%;min-height:var(--h);padding:0 .85em 0 .95em;border-radius:var(--r);text-align:left;transition:background .12s ease}
.dock .menuitem:hover{background:rgba(255,255,255,.12)}
.dock .menu-name{font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dock .menu-option{margin-left:auto;opacity:.7;font-size:.9em;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dock .row{display:flex;align-items:center;gap:.3em;transition:margin-top var(--dur) var(--ease),padding-top var(--dur) var(--ease)}
.dock.open .row{margin-top:var(--gap);padding-top:var(--gap);border-top:1px solid rgba(255,255,255,.15)}
.dock .nav{width:var(--nav);height:var(--nav);min-width:var(--nav);min-height:var(--nav);display:grid;place-items:center;font-size:var(--navfs);line-height:1;border-radius:999px;transition:background .12s ease}
.dock .nav::before{content:"";width:6px;height:6px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor}
.dock .prev::before{transform:rotate(225deg) translate(-1px,-1px)}
.dock .next::before{transform:rotate(45deg) translate(-1px,1px)}
.dock .nav:hover{background:rgba(255,255,255,.12)}
.dock .label{flex:1;min-width:0;text-align:center;padding:0 .65em;min-height:var(--h);display:flex;align-items:center;justify-content:center;gap:.55em;white-space:nowrap;overflow:hidden;border-radius:var(--r)}
.dock .label:hover{background:transparent}
.dock .label-main{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ============ shared motion plumbing ============ */
@keyframes swapIn{from{opacity:0;transform:translate(var(--dx,0px),var(--dy,0px))}to{opacity:1;transform:none}}
.dock[data-dir="next"] .row{--dx:var(--amp,0px)}
.dock[data-dir="prev"] .row{--dx:calc(var(--amp,0px) * -1)}

/* ============ M1 Godly Strict — 150ms cubic-bezier(.4,0,.2,1), opacity-first ============ */
.m1 .dock{--dur:.15s;--ease:cubic-bezier(.4,0,.2,1);--amp:0px;
  opacity:0;transform:translateY(6px);
  transition:opacity .3s cubic-bezier(.4,0,.2,1),transform .3s cubic-bezier(.4,0,.2,1)}
.m1 .dock.in{opacity:1;transform:none}
.m1 .dock .menu{transform:translateY(-4px);transition:max-height .15s cubic-bezier(.4,0,.2,1),opacity .15s ease,transform .15s cubic-bezier(.4,0,.2,1)}
.m1 .dock.open .menu{transform:none}
.m1 .dock .label-main.swap,.m1 .dock .group-count.swap{animation:swapIn .15s cubic-bezier(.4,0,.2,1)}

@media (prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important}
  .dock{opacity:1!important;transform:none!important}
}
</style>
</head>
<body>
<header>
  <h1>Unship dock — motion concepts</h1>
  <p>Four motion systems on the final Godly Ink dock. All CSS-only. Spec: docs/superpowers/specs/2026-06-04-toolbar-motion-exploration-design.md</p>
  <button id="tone" type="button">Stage: light</button>
</header>
<main class="grid">

<section class="card m1">
  <div class="card-head">
    <span class="num">M1</span><h2>Godly Strict</h2>
    <p>150ms cubic-bezier(.4,0,.2,1) · 300ms fade + 6px rise entrance · menu fade-drop · label crossfade</p>
  </div>
  <div class="stage">
    <div class="spec">
      <div class="dock multi">
        <button class="group" type="button"><span class="group-name">Hero layout</span><span class="group-count">2/3</span></button>
        <div class="menu">
          <button class="menuitem" type="button"><span class="menu-name">Pricing card</span><span class="menu-option">Two column</span></button>
          <button class="menuitem" type="button"><span class="menu-name">Testimonials</span><span class="menu-option">Carousel</span></button>
        </div>
        <div class="row">
          <button class="prev nav" type="button" aria-label="Previous option"></button>
          <button class="label" type="button"><span class="label-main">Split hero</span></button>
          <button class="next nav" type="button" aria-label="Next option"></button>
        </div>
      </div>
      <span class="tag">click row · ‹ › · <button class="replay" type="button" data-replay>replay entrance</button></span>
    </div>
  </div>
</section>

</main>
<script>
const OPTS = ["Minimal hero", "Split hero", "Full-bleed hero"];
document.querySelectorAll(".dock").forEach((dock) => {
  let index = 1;
  const label = dock.querySelector(".label-main");
  const count = dock.querySelector(".group-count");
  dock.querySelector(".group").addEventListener("click", () => dock.classList.toggle("open"));
  const swap = (dir) => {
    index = (index + dir + OPTS.length) % OPTS.length;
    dock.dataset.dir = dir > 0 ? "next" : "prev";
    label.textContent = OPTS[index];
    count.textContent = `${index + 1}/${OPTS.length}`;
    for (const el of [label, count]) { el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap"); }
  };
  dock.querySelector(".prev").addEventListener("click", () => swap(-1));
  dock.querySelector(".next").addEventListener("click", () => swap(1));
});
document.querySelectorAll("[data-replay]").forEach((button) => {
  button.addEventListener("click", () => {
    const dock = button.closest(".stage").querySelector(".dock");
    dock.classList.remove("in"); void dock.offsetWidth; dock.classList.add("in");
  });
});
const tone = document.getElementById("tone");
tone.addEventListener("click", () => {
  const dark = document.body.classList.toggle("stage-dark");
  tone.textContent = dark ? "Stage: dark" : "Stage: light";
});
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.querySelectorAll(".dock").forEach((dock) => dock.classList.add("in"));
}));
</script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Run: serve repo root (`python3 -m http.server 8517`) and open `http://127.0.0.1:8517/explorations/toolbar-animations.html`.
Expected: the M1 dock fades up 6px on load; clicking "Hero layout" opens the menu with a quick fade-drop and the row divider eases in; ‹ › cycle Minimal/Split/Full-bleed with a 150ms crossfade on label and count; "replay entrance" re-runs the load-in.

- [ ] **Step 3: Commit (only this file)**

```bash
git add explorations/toolbar-animations.html
git commit -m "feat: scaffold motion exploration page with Godly Strict system"
```

---

### Task 2: Systems M2–M4

**Files:**
- Modify: `explorations/toolbar-animations.html` (append CSS before the reduced-motion block; append cards before `</main>`)

- [ ] **Step 1: Add system CSS for M2–M4**

Insert before the `@media (prefers-reduced-motion...)` block:

```css
/* ============ M2 Calm Spring — overshoot transforms ~240ms ============ */
.m2 .dock{--dur:.24s;--ease:cubic-bezier(.34,1.56,.64,1);--amp:8px;
  opacity:0;transform:translateY(14px);
  transition:opacity .2s ease,transform .28s cubic-bezier(.34,1.56,.64,1)}
.m2 .dock.in{opacity:1;transform:none}
.m2 .dock .menu{transition:max-height .24s cubic-bezier(.34,1.56,.64,1),opacity .14s ease}
.m2 .dock .menuitem{opacity:0;transform:translateY(-6px);transition:background .12s ease,opacity .2s ease,transform .24s cubic-bezier(.34,1.56,.64,1)}
.m2 .dock.open .menuitem{opacity:1;transform:none}
.m2 .dock.open .menuitem:nth-child(2){transition-delay:.025s}
.m2 .dock .label-main.swap,.m2 .dock .group-count.swap{animation:swapIn .24s cubic-bezier(.34,1.56,.64,1)}

/* ============ M3 Ink Quiet — 120ms opacity-only, zero movement ============ */
.m3 .dock{--dur:0s;--ease:linear;--amp:0px;opacity:0;transition:opacity .2s ease}
.m3 .dock.in{opacity:1}
.m3 .dock .menu{transition:max-height 0s linear,opacity .12s ease}
.m3 .dock .label-main.swap,.m3 .dock .group-count.swap{animation:swapIn .12s ease}

/* ============ M4 Directional — 180–260ms decel, motion shows direction ============ */
.m4 .dock{--dur:.26s;--ease:cubic-bezier(0,0,.2,1);--amp:10px;
  opacity:0;transform:translateY(12px);
  transition:opacity .22s ease,transform .26s cubic-bezier(0,0,.2,1)}
.m4 .dock.in{opacity:1;transform:none}
.m4 .dock .menuitem{opacity:0;transform:translateY(-10px);transition:background .12s ease,opacity .18s ease,transform .22s cubic-bezier(0,0,.2,1)}
.m4 .dock.open .menuitem{opacity:1;transform:none}
.m4 .dock.open .menuitem:nth-child(2){transition-delay:.03s}
.m4 .dock .label-main.swap{animation:swapIn .18s cubic-bezier(0,0,.2,1)}
.m4 .dock .group-count.swap{animation:swapIn .18s cubic-bezier(0,0,.2,1)}
.m4 .dock[data-dir="next"] .group{--dy:-6px}
.m4 .dock[data-dir="prev"] .group{--dy:6px}
```

Note: stagger delays only target `:nth-child(2)` because the demo menu has two items; the port adds a per-item rule.

- [ ] **Step 2: Add cards M2–M4 before `</main>`**

Use the exact card markup from Task 1 Step 1 (the whole `<section>` including the full dock and tag), substituting:

| class | num | h2 | caption |
|-------|-----|----|---------|
| `card m2` | M2 | Calm Spring | 240ms cubic-bezier(.34,1.56,.64,1) · overshoot rise · 25ms item stagger · 8px spring slide |
| `card m3` | M3 | Ink Quiet | 120ms opacity-only · zero movement · 200ms fade entrance |
| `card m4` | M4 | Directional | 180–260ms decel · slides from pressed chevron · downward unfurl · count tick |

- [ ] **Step 3: Verify in browser**

Reload. Expected per card: M2 rises with a visible overshoot settle, menu items spring in staggered, labels slide 8px in press direction. M3 only fades — no element moves. M4 slides up on entrance, menu unfurls downward with stagger, the incoming label slides from the chevron side, and the count ticks vertically (down for next, up for prev).

- [ ] **Step 4: Commit (only this file)**

```bash
git add explorations/toolbar-animations.html
git commit -m "feat: add Calm Spring, Ink Quiet, and Directional motion systems"
```

---

### Task 3: QA and repo gates

**Files:**
- Modify (only if QA finds issues): `explorations/toolbar-animations.html`

- [ ] **Step 1: Full QA**

- Exercise all three moments on all four cards, both stage tones.
- Captions must match what renders (durations, distances, stagger).
- Open/close the menu rapidly — no stuck states; swap rapidly — animation re-triggers every press.
- Confirm nothing animates slower than 300ms.

- [ ] **Step 2: Repo gates**

```bash
git diff --check
npm run verify
```

Expected: both clean (`explorations/` is excluded from the packed package by `test/package-smoke.test.js`).

- [ ] **Step 3: Commit any QA fixes (only this file)**

```bash
git add explorations/toolbar-animations.html
git commit -m "polish: tune motion systems after QA"
```

(Skip if no changes.)
