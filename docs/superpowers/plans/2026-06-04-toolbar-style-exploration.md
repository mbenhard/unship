# Toolbar Style Exploration Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `explorations/toolbar-styles.html` — a single self-contained comparison page showing 10 monochrome styling concepts for the Unship picker dock, per `docs/superpowers/specs/2026-06-04-toolbar-style-exploration-design.md`.

**Architecture:** One static HTML file. Shared "anatomy" CSS defines dock structure (sizes, layout, chevrons, rows); each concept is a CSS skin scoped to a card class (`.s1`–`.s10`) that overrides custom properties plus a few skin-specific rules. ~10 lines of JS toggle the stage background tone.

**Tech Stack:** Plain HTML/CSS, system font stacks only, zero dependencies. No test framework applies — verification is visual (browser) plus repo gates (`git diff --check`, `npm run verify` for package-leak protection).

**⚠️ Working-tree caution:** Another session has unrelated uncommitted changes in this repo (`src/install/`, `src/cli/index.js`, README, etc.). Every commit in this plan must `git add` **only** the explicit paths listed — never `git add -A` or `git add .`.

---

### Task 1: Page scaffold, dock anatomy, stage toggle, Concept 1 (Glass Dock)

**Files:**
- Create: `explorations/toolbar-styles.html`

- [ ] **Step 1: Create the file with page chrome, shared anatomy CSS, toggle JS, and the first card**

Write `explorations/toolbar-styles.html` with exactly this content:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unship dock — 10 monochrome styling concepts</title>
<style>
/* ============ page chrome ============ */
:root{
  --stage-bg:#f1f1f3; --stage-line:rgba(0,0,0,.06);
}
body.stage-dark{ --stage-bg:#141417; --stage-line:rgba(255,255,255,.06); }
*{box-sizing:border-box}
body{margin:0;background:#fafafa;color:#18181b;font:400 14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:40px 32px 80px}
header{max-width:1480px;margin:0 auto 28px;display:flex;align-items:baseline;gap:16px;flex-wrap:wrap}
h1{font-size:16px;font-weight:650;margin:0}
header p{margin:0;color:#71717a;font-size:13px}
#tone{margin-left:auto;font:500 12px/1 system-ui,sans-serif;padding:8px 14px;border:1px solid #d4d4d8;border-radius:999px;background:#fff;cursor:pointer}
.grid{max-width:1480px;margin:0 auto;display:grid;gap:28px}
@media(min-width:1500px){.grid{grid-template-columns:1fr 1fr}}
.card{border:1px solid #e4e4e7;border-radius:14px;background:#fff;overflow:hidden}
.card-head{display:flex;align-items:baseline;gap:10px;padding:14px 18px;flex-wrap:wrap}
.card-head .num{font:600 11px/1 ui-monospace,Menlo,monospace;color:#a1a1aa}
.card-head h2{font-size:13.5px;font-weight:650;margin:0}
.card-head p{margin:0;color:#71717a;font-size:12.5px}
.stage{display:flex;align-items:flex-end;justify-content:center;gap:36px;padding:48px 24px 28px;
  background:radial-gradient(var(--stage-line) 1px,transparent 1px) 0 0/18px 18px,var(--stage-bg);
  transition:background .2s}

/* ============ dock anatomy (shared — skins must not change structure) ============ */
.dock{
  /* skin token contract — every skin overrides a subset of these */
  --h:34px; --r:16px; --gap:6px; --fs:12px;
  --font:system-ui,-apple-system,"Segoe UI",sans-serif;
  --surface:#232327; --text:#fafafa; --muted:.62;
  --edge:1px solid transparent; --shadow:none;
  --hover-bg:rgba(255,255,255,.1); --sel-bg:rgba(255,255,255,.14);
  --divider:1px solid rgba(255,255,255,.1);
  width:328px; flex:none; padding:var(--gap);
  border:var(--edge); border-radius:calc(var(--r) + var(--gap));
  background:var(--surface); color:var(--text);
  box-shadow:var(--shadow);
  font:600 var(--fs)/1.2 var(--font);
}
.dock button{display:flex;align-items:center;border:0;margin:0;background:transparent;color:inherit;font:inherit;cursor:pointer;width:100%;min-height:var(--h);padding:0 .85em 0 .95em;border-radius:var(--r);text-align:left;transition:background .12s ease,box-shadow .12s ease}
.dock .name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dock .cnt{margin-left:auto;opacity:var(--muted);font-variant-numeric:tabular-nums}
.dock .grp{gap:.65em}
.dock .grp:hover,.dock .mi:hover{background:var(--hover-bg)}
.dock .grp.on,.dock .mi.sel{background:var(--sel-bg)}
.dock .mi{gap:.8em}
.dock .mi .name{font-weight:500}
.dock .mi .opt{margin-left:auto;opacity:var(--muted);font-size:.9em;white-space:nowrap}
.dock .menu{display:flex;flex-direction:column}
.dock .row{display:flex;align-items:center}
.dock .row button{width:auto}
.dock .split{margin-top:var(--gap);padding-top:var(--gap);border-top:var(--divider)}
.dock .nav{flex:none;width:var(--h);padding:0;display:grid;place-items:center;border-radius:999px}
.dock .nav::before{content:"";width:6px;height:6px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor}
.dock .nav.l::before{transform:rotate(-135deg)}
.dock .nav.r::before{transform:rotate(45deg)}
.dock .label{flex:1;justify-content:center;gap:.55em}
.dock .label .cnt{margin-left:0}

/* ============ skins ============ */
/* 01 Glass Dock — refined current style (control) */
.s1 .dock{
  --surface:linear-gradient(180deg,rgba(39,39,42,.96),rgba(24,24,27,.96));
  --edge:1px solid rgba(255,255,255,.18);
  --shadow:inset 0 1px 0 rgba(255,255,255,.16),0 18px 42px rgba(0,0,0,.28);
  backdrop-filter:blur(18px) saturate(1.2);
}
</style>
</head>
<body>
<header>
  <h1>Unship dock — 10 monochrome styling concepts</h1>
  <p>Same anatomy in every card; only the skin changes. Spec: docs/superpowers/specs/2026-06-04-toolbar-style-exploration-design.md</p>
  <button id="tone" type="button">Stage: light</button>
</header>
<main class="grid">

<section class="card s1">
  <div class="card-head">
    <span class="num">01</span><h2>Glass Dock</h2>
    <p>zinc gradient · 18px backdrop blur · inset top highlight · deep soft shadow</p>
  </div>
  <div class="stage">
    <div class="dock">
      <div class="row">
        <button class="nav l" aria-label="Previous variant"></button>
        <button class="label"><span class="name">Hero layout</span><span class="cnt">2/3</span></button>
        <button class="nav r" aria-label="Next variant"></button>
      </div>
    </div>
    <div class="dock">
      <button class="grp on"><span class="name">Hero layout</span><span class="cnt">2/3</span></button>
      <div class="menu">
        <button class="mi"><span class="name">Minimal hero</span><span class="opt">1</span></button>
        <button class="mi sel"><span class="name">Split hero</span><span class="opt">2</span></button>
        <button class="mi"><span class="name">Full-bleed hero</span><span class="opt">3</span></button>
      </div>
      <button class="grp"><span class="name">Pricing card</span><span class="cnt">1/2</span></button>
      <div class="row split">
        <button class="nav l" aria-label="Previous variant"></button>
        <button class="label"><span class="name">Hero layout</span><span class="cnt">2/3</span></button>
        <button class="nav r" aria-label="Next variant"></button>
      </div>
    </div>
  </div>
</section>

</main>
<script>
const tone = document.getElementById("tone");
tone.addEventListener("click", () => {
  const dark = document.body.classList.toggle("stage-dark");
  tone.textContent = dark ? "Stage: dark" : "Stage: light";
});
</script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Run: `open explorations/toolbar-styles.html`
Expected: One card. Collapsed dock (chevron / "Hero layout 2/3" / chevron) and open dock (group row, 3 menu items with "Split hero" selected, "Pricing card" row, divider, nav row) side by side, bottom-aligned on a dotted stage. Clicking "Stage: light" flips the stage to dark and the button reads "Stage: dark". The dock looks like the current Unship glass style.

- [ ] **Step 3: Commit (only this file)**

```bash
git add explorations/toolbar-styles.html
git commit -m "feat: scaffold toolbar style exploration page with Glass Dock control"
```

---

### Task 2: Dark skins 2–7

**Files:**
- Modify: `explorations/toolbar-styles.html` (append skins to the `/* ============ skins ============ */` section; append cards before `</main>`)

- [ ] **Step 1: Add skin CSS for concepts 2–7**

Append after the `.s1` block:

```css
/* 02 Matte Ink — flat near-black, hairline, tight shadow */
.s2 .dock{
  --surface:#131316; --edge:1px solid #2a2a2e; --r:12px;
  --shadow:0 2px 10px rgba(0,0,0,.35);
  --text:#e7e7ea; --hover-bg:#1c1c20; --sel-bg:#232327;
  --divider:1px solid #232327;
}

/* 03 Carbon Bevel — stacked shadows, dual inset bevel, raised controls */
.s3 .dock{
  --surface:linear-gradient(180deg,#2e2e33,#1b1b1f);
  --edge:1px solid #0b0b0d; --r:14px;
  --shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 rgba(0,0,0,.55),0 1px 2px rgba(0,0,0,.5),0 10px 22px rgba(0,0,0,.45),0 28px 56px rgba(0,0,0,.3);
  --hover-bg:rgba(255,255,255,.07);
}
.s3 .dock .grp.on,.s3 .dock .mi.sel{
  background:linear-gradient(180deg,#3b3b41,#2a2a2f);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 1px 2px rgba(0,0,0,.45);
}
.s3 .dock .nav{background:linear-gradient(180deg,#37373d,#26262b);box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 1px 2px rgba(0,0,0,.4)}

/* 04 Etched Wells — dark neumorphism, recessed active rows, embossed nav */
.s4 .dock{
  --surface:#1e1e22; --edge:1px solid rgba(255,255,255,.04); --r:18px;
  --shadow:0 12px 32px rgba(0,0,0,.38);
  --hover-bg:rgba(0,0,0,.25); --divider:1px solid rgba(0,0,0,.4);
}
.s4 .dock .grp.on,.s4 .dock .mi.sel{
  background:#17171a;
  box-shadow:inset 0 2px 6px rgba(0,0,0,.55),inset 0 -1px 0 rgba(255,255,255,.05);
}
.s4 .dock .nav{background:#26262b;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 1px 2px rgba(0,0,0,.45)}

/* 05 Hairline Instrument — 1px rules, square radii, monospace, tabular */
.s5 .dock{
  --surface:rgba(12,12,14,.93); --edge:1px solid rgba(255,255,255,.3);
  --r:5px; --fs:11px; --font:ui-monospace,"SF Mono",Menlo,monospace;
  --shadow:0 6px 18px rgba(0,0,0,.25);
  --text:#f2f2f2; --hover-bg:rgba(255,255,255,.07); --sel-bg:transparent;
  --divider:1px solid rgba(255,255,255,.18);
  font-weight:500;
}
.s5 .dock .grp.on,.s5 .dock .mi.sel{box-shadow:inset 0 0 0 1px rgba(255,255,255,.45)}
.s5 .dock .nav{border-radius:4px}
.s5 .dock .label .name{text-transform:uppercase;letter-spacing:.08em;font-size:10px}

/* 06 OLED Contour — pure black, bright contour, no shadow, inverted selection */
.s6 .dock{
  --surface:#000; --edge:1px solid rgba(255,255,255,.35); --r:16px;
  --shadow:none; --text:#fff;
  --hover-bg:rgba(255,255,255,.1); --sel-bg:rgba(255,255,255,.14);
  --divider:1px solid rgba(255,255,255,.22);
}
.s6 .dock .mi.sel{background:#fff;color:#000}

/* 07 Soft Graphite — lighter surface, generous radius, huge diffuse shadow */
.s7 .dock{
  --surface:#3f3f46; --edge:0; --r:22px; --gap:7px;
  --shadow:0 28px 64px rgba(0,0,0,.45),0 6px 16px rgba(0,0,0,.22);
  --text:#f4f4f5; --hover-bg:rgba(255,255,255,.08); --sel-bg:rgba(255,255,255,.13);
  --divider:1px solid rgba(255,255,255,.09);
}
```

- [ ] **Step 2: Add cards 2–7 before `</main>`**

Each card uses the **exact** card markup from Task 1 Step 1 (the whole `<section class="card s1">…</section>` block, including both docks unchanged), substituting only the section class, number, name, and caption from this table:

| class | num | h2 | caption |
|-------|-----|----|---------|
| `card s2` | 02 | Matte Ink | flat #131316 · hairline border · tight 10px shadow · nothing else |
| `card s3` | 03 | Carbon Bevel | stacked outer shadows · dual inset bevel · gradient raised controls |
| `card s4` | 04 | Etched Wells | inner-shadow wells · embossed nav buttons · recessed active rows |
| `card s5` | 05 | Hairline Instrument | translucent black · 1px rules · 5px radii · ui-monospace · tabular numerals |
| `card s6` | 06 | OLED Contour | pure #000 · bright contour line · no shadow · inverted selection |
| `card s7` | 07 | Soft Graphite | zinc-700 surface · 22px radius · huge diffuse ambient shadow |

Example for concept 2 (apply the same pattern for 3–7):

```html
<section class="card s2">
  <div class="card-head">
    <span class="num">02</span><h2>Matte Ink</h2>
    <p>flat #131316 · hairline border · tight 10px shadow · nothing else</p>
  </div>
  <div class="stage">
    <!-- identical collapsed + open dock markup as in card s1 -->
  </div>
</section>
```

(The comment above is for plan brevity only — in the actual file, paste the full dock markup, not a comment.)

- [ ] **Step 3: Verify in browser**

Run: `open explorations/toolbar-styles.html`
Expected: 7 cards. Each dark concept is visually distinct: 2 is flat with no gradient; 3 reads machined with a bright top bevel edge; 4 has active rows that look pressed into the surface; 5 is square-cornered monospace with hairlines; 6 is pure black with a white-on-black contour and a white selected menu item; 7 is a lighter, softer, rounder dock with a very large soft shadow. Check both stage tones.

- [ ] **Step 4: Commit (only this file)**

```bash
git add explorations/toolbar-styles.html
git commit -m "feat: add dark toolbar skins 2-7 to exploration page"
```

---

### Task 3: Light skins 8–10

**Files:**
- Modify: `explorations/toolbar-styles.html` (same two append points as Task 2)

- [ ] **Step 1: Add skin CSS for concepts 8–10**

Append after the `.s7` block:

```css
/* 08 Paper — white, gray hairline, two-layer macOS shadow */
.s8 .dock{
  --surface:#fff; --edge:1px solid #e4e4e7; --r:14px;
  --shadow:0 1px 2px rgba(0,0,0,.05),0 10px 28px rgba(0,0,0,.1);
  --text:#18181b; --muted:.55;
  --hover-bg:#f4f4f5; --sel-bg:#ececef;
  --divider:1px solid #ececef;
}
.s8 .dock .grp.on,.s8 .dock .mi.sel{box-shadow:inset 0 0 0 1px #e0e0e3}

/* 09 Porcelain Inset — light neumorphism, recessed track, embossed selection */
.s9 .dock{
  --surface:linear-gradient(180deg,#f6f6f7,#e9e9ec);
  --edge:1px solid #dcdce0; --r:18px;
  --shadow:inset 0 1px 0 #fff,0 12px 28px rgba(0,0,0,.12);
  --text:#27272a; --muted:.55;
  --hover-bg:rgba(0,0,0,.04); --sel-bg:#e3e3e7;
  --divider:1px solid rgba(0,0,0,.07);
}
.s9 .dock .grp.on{background:#e3e3e7;box-shadow:inset 0 2px 5px rgba(0,0,0,.1),inset 0 -1px 0 rgba(255,255,255,.7)}
.s9 .dock .mi.sel{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.14),inset 0 1px 0 #fff}
.s9 .dock .nav{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.12),inset 0 1px 0 #fff}

/* 10 Print Offset — off-white, solid black border, hard offset shadow, mono */
.s10 .dock{
  --surface:#faf9f6; --edge:1.5px solid #111; --r:9px;
  --fs:11.5px; --font:ui-monospace,"SF Mono",Menlo,monospace;
  --shadow:4px 4px 0 #111;
  --text:#111; --muted:.6;
  --hover-bg:#efede8; --sel-bg:#111;
  --divider:1.5px solid #111;
}
.s10 .dock .grp.on,.s10 .dock .mi.sel{background:#111;color:#faf9f6}
```

- [ ] **Step 2: Add cards 8–10 before `</main>`**

Same pattern as Task 2 Step 2 — full card markup with both docks, substituting:

| class | num | h2 | caption |
|-------|-----|----|---------|
| `card s8` | 08 | Paper | white · gray hairline · two-layer macOS shadow |
| `card s9` | 09 | Porcelain Inset | porcelain gradient · recessed active track · embossed white selection |
| `card s10` | 10 | Print Offset | off-white · 1.5px black border · hard 4px offset shadow · mono type |

- [ ] **Step 3: Verify in browser**

Run: `open explorations/toolbar-styles.html`
Expected: 10 cards. 8 is the canonical clean light toolbar; 9 reads as molded porcelain with the active group pressed in and the selected menu item floating as a white chip; 10 is a stark print object with a hard, unblurred black offset shadow and mono type. Light skins must remain legible on the dark stage tone (their own surfaces carry the contrast).

- [ ] **Step 4: Commit (only this file)**

```bash
git add explorations/toolbar-styles.html
git commit -m "feat: add light toolbar skins 8-10 to exploration page"
```

---

### Task 4: Visual QA pass and repo gates

**Files:**
- Modify (only if QA finds issues): `explorations/toolbar-styles.html`

- [ ] **Step 1: Full visual QA in both stage tones**

Run: `open explorations/toolbar-styles.html`
Checklist:
- All 10 captions accurately describe what is rendered (captions are the comparison aid — fix caption or CSS if they disagree).
- Concepts are mutually distinct at a glance; no two skins read as near-duplicates.
- Hover states work and stay in-character per skin (hover each group row, menu item, nav button).
- Dock width is 328px everywhere; anatomy identical across cards (only styling differs).
- Toggle to dark stage: every dock edge remains readable; light docks still hold together.
- Tune values only within a concept's identity (e.g. adjust a shadow alpha); do not restructure.

- [ ] **Step 2: Repo gates**

```bash
git diff --check
npm run verify
```

Expected: `git diff --check` silent. `npm run verify` passes — confirms `explorations/` does not leak into the packed package (`test/package-smoke.test.js`). Note: the working tree contains unrelated in-progress changes from another session; if `npm run verify` fails in code this plan never touched, report it but do not fix it here.

- [ ] **Step 3: Commit any QA fixes (only this file)**

```bash
git add explorations/toolbar-styles.html
git commit -m "polish: tune toolbar exploration skins after visual QA"
```

(Skip if QA produced no changes.)
