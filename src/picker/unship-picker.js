(() => {
    if (window.__unshipPicker) return;
    const e = "data-unship-option", t = document.currentScript, n = "local" === t?.getAttribute("data-unship-persist"), i = t?.hasAttribute("data-unship-global-shortcuts"), o = new WeakMap, a = new WeakMap;
    let r, l, s, d, p, c = [], u = 0, b = !1, h = "bottom", m = !1;
    const f = {
        version: "0.1.0",
        rescan: g,
        destroy: function() {
            p?.disconnect(), document.removeEventListener("focusin", A, !0), document.removeEventListener("keydown", E), 
            window.visualViewport?.removeEventListener("resize", O), l?.host.remove(), delete window.__unshipPicker;
        },
        getState: function() {
            return {
                groups: c.map(e => ({
                    label: e.label,
                    displayLabel: e.displayLabel,
                    activeOptionIndex: e.activeOptionIndex,
                    options: e.options.map(e => e.label)
                })),
                activeGroupIndex: u,
                toolbarMode: 0 === c.length ? "none" : 1 === c.length ? "single" : "multi"
            };
        }
    };
    function g() {
        c = Array.from(document.querySelectorAll("[data-unship-pick]")).map(v).filter(Boolean), 
        function(e) {
            const t = new Map, n = new Map;
            e.forEach(e => t.set(e.label, (t.get(e.label) || 0) + 1)), e.forEach(e => {
                const i = (n.get(e.label) || 0) + 1;
                n.set(e.label, i), e.displayLabel = t.get(e.label) > 1 ? `${e.label} ${i}` : e.label;
            });
        }(c), u >= c.length && (u = Math.max(0, c.length - 1)), c.length < 2 && (b = !1), 
        c.forEach(x), k();
    }
    function v(t, i) {
        const o = Array.from(t.children).filter(t => t.hasAttribute(e)).map((t, n) => ({
            element: t,
            label: t.getAttribute(e) || `Option ${n + 1}`,
            index: n
        }));
        if (!o.length) return null;
        const r = t.getAttribute("data-unship-pick") || `Group ${i + 1}`, l = a.get(t) ?? function(e, t, i) {
            if (!n) return;
            try {
                const n = localStorage.getItem(S(e, t)), o = i.findIndex(e => e.label === n);
                return -1 === o ? void 0 : o;
            } catch {
                return;
            }
        }(i, r, o) ?? function(e) {
            const t = e.findIndex(e => !e.element.hidden && "none" !== getComputedStyle(e.element).display);
            return -1 === t ? 0 : t;
        }(o);
        return {
            element: t,
            index: i,
            label: r,
            displayLabel: r,
            options: o,
            activeOptionIndex: M(l, o.length)
        };
    }
    function x(e) {
        e.options.forEach((t, n) => {
            n === e.activeOptionIndex ? function(e) {
                e.hidden && (e.hidden = !1);
                const t = o.get(e);
                t && e.style.display !== t ? e.style.display = t : !t && e.style.display && e.style.removeProperty("display");
            }(t.element) : function(e) {
                o.has(e) || o.set(e, e.style.display || "");
                e.hidden || (e.hidden = !0);
                "none" !== e.style.display && (e.style.display = "none");
            }(t.element);
        }), a.set(e.element, e.activeOptionIndex);
    }
    function y(e) {
        const t = c[u];
        if (!t) return;
        const i = t.options[t.activeOptionIndex].element, o = !0;
        t.activeOptionIndex = T(t.activeOptionIndex + e, t.options.length), x(t), function(e) {
            if (!n) return;
            try {
                localStorage.setItem(S(e.index, e.label), e.options[e.activeOptionIndex].label);
            } catch {}
        }(t), k(), function(e, t, n) {
            if (!n) return;
            i = t, i.hasAttribute("tabindex") && i.tabIndex >= 0 || /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(i.tagName) && !i.disabled ? (t.focus({
                preventScroll: !0
            }), d = t) : setTimeout(() => l.querySelector(".label")?.focus({
                preventScroll: !0
            }));
            var i;
        }(i, t.options[t.activeOptionIndex].element, o), L(t);
    }
    function w(e) {
        c.length < 2 || (u = T(u + e, c.length), b = !1, L(c[u]), k());
    }
    function k() {
        if (!l) return;
        const e = c[u];
        if (!e) return void (l.innerHTML = "");
        const t = e.options[e.activeOptionIndex];
        e.activeOptionIndex = M(e.activeOptionIndex, e.options.length);
        const n = 1 === c.length ? "single" : "multi";
        l.innerHTML = `<style>\n      .dock{position:fixed;left:var(--unship-left,50%);bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483647;box-sizing:border-box;max-width:var(--unship-max-width,calc(100vw - 20px));display:grid;gap:2px;padding:5px;border:1px solid rgba(255,255,255,.32);border-radius:999px;background:rgba(24,24,27,.72);backdrop-filter:blur(18px) saturate(1.4);color:white;font:500 13px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 10px 24px rgba(0,0,0,.18)}\n      .dock.top{top:14px;bottom:auto}\n      .dock.multi{border-radius:18px}\n      .row{display:flex;align-items:center;gap:2px}\n      button{min-width:44px;min-height:36px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer}\n      button:hover{background:rgba(255,255,255,.12)}\n      button:focus-visible{outline:2px solid white;outline-offset:2px}\n      .label{min-width:0;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 10px}\n      .group{width:100%;min-height:30px;font-size:12px;opacity:.86}\n      .menu{display:grid;gap:2px;border-top:1px solid rgba(255,255,255,.14);padding-top:4px}\n      .menuitem{justify-content:flex-start;min-height:32px;text-align:left;padding:0 10px}\n      .sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}\n      @media (prefers-reduced-motion:reduce){*{transition:none!important}}\n      @media (prefers-reduced-transparency:reduce){.dock{background:rgba(24,24,27,.96);backdrop-filter:none}}\n      @supports not ((backdrop-filter:blur(1px))){.dock{background:rgba(24,24,27,.96)}}\n    </style><div class="dock ${n} ${h}" role="group" aria-label="Unship variant picker">\n      ${c.length > 1 ? `<button class="group" type="button" aria-haspopup="menu" aria-expanded="${b}" aria-label="Active group ${q(e.displayLabel)}">${q(e.displayLabel)} ${e.activeOptionIndex + 1}/${e.options.length}</button>` : ""}\n      <div class="row">\n        <button class="prev" type="button" aria-label="Previous option">‹</button>\n        <button class="label" type="button" aria-label="${q(e.displayLabel)}, ${q(t.label)}, option ${e.activeOptionIndex + 1} of ${e.options.length}">${q(1 === c.length ? `${e.displayLabel}: ${t.label}` : t.label)}</button>\n        <button class="next" type="button" aria-label="Next option">›</button>\n      </div>\n      ${c.length > 1 && b ? `<div class="menu" role="menu">${c.map((e, t) => {
            const n = e.options[M(e.activeOptionIndex, e.options.length)];
            return `<button class="menuitem" type="button" role="menuitem" data-index="${t}" aria-label="${q(e.displayLabel)}, ${q(n.label)}">${q(e.displayLabel)}: ${q(n.label)}</button>`;
        }).join("")}</div>` : ""}\n    </div>`, l.append(s);
        const i = l.querySelector(".prev"), o = l.querySelector(".next");
        [ i, o ].forEach(e => e.addEventListener("mousedown", e => e.preventDefault())), 
        i.addEventListener("click", () => y(-1)), o.addEventListener("click", () => y(1)), 
        l.querySelector(".group")?.addEventListener("click", () => {
            b = !b, k();
        }), l.querySelectorAll(".menuitem").forEach(e => e.addEventListener("click", () => {
            return t = Number(e.dataset.index), u = t, b = !1, L(c[u]), void k();
            var t;
        }));
    }
    function $(e) {
        "ArrowLeft" === e.key ? (e.preventDefault(), y(-1)) : "ArrowRight" === e.key ? (e.preventDefault(), 
        y(1)) : "ArrowUp" === e.key ? (e.preventDefault(), w(-1)) : "ArrowDown" === e.key ? (e.preventDefault(), 
        w(1)) : "Escape" === e.key && (b ? (e.preventDefault(), b = !1, k()) : document.activeElement?.blur());
    }
    function E(e) {
        var t;
        l?.activeElement || (t = e.target, t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || Boolean(t.closest?.("[data-unship-ignore-shortcuts],[role='application']")))) || ("ArrowLeft" === e.key ? y(-1) : "ArrowRight" === e.key ? y(1) : "ArrowUp" === e.key ? w(-1) : "ArrowDown" === e.key && w(1));
    }
    function L(e) {
        const t = e.options[e.activeOptionIndex];
        s.textContent = `${e.displayLabel}, ${t.label}, option ${e.activeOptionIndex + 1} of ${e.options.length}`;
    }
    function I() {
        m || (m = !0, requestAnimationFrame(() => {
            m = !1, g();
        }));
    }
    function A(t) {
        d = t.target.closest?.(`[${e}]`) || d, function(e) {
            if (!e || r?.contains(e)) return;
            const t = window.visualViewport?.height || window.innerHeight, n = e.getBoundingClientRect?.();
            h = n && n.bottom > t - 96 ? "top" : "bottom", l?.querySelector(".dock")?.classList.toggle("top", "top" === h);
        }(t.target);
    }
    function O() {
        if (!r) return;
        const e = window.visualViewport, t = [ e?.width, window.innerWidth, window.outerWidth, window.screen?.width ].filter(e => Number.isFinite(e) && e > 0), n = Math.min(...t), i = (e?.offsetLeft || 0) + n / 2;
        r.style.setProperty("--unship-left", `${i}px`), r.style.setProperty("--unship-max-width", `${Math.max(240, n - 20)}px`);
    }
    function S(e, t) {
        return `unship:${location.pathname}:${e}:${t}`;
    }
    function M(e, t) {
        return Math.min(Math.max(e, 0), t - 1);
    }
    function T(e, t) {
        return (e % t + t) % t;
    }
    function q(e) {
        return String(e).replace(/[&<>"']/g, e => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[e]));
    }
    window.__unshipPicker = f, function() {
        const e = document.createElement("div");
        e.setAttribute("data-unship-toolbar", ""), document.documentElement.append(e), r = e, 
        O(), window.visualViewport?.addEventListener("resize", O), l = e.attachShadow({
            mode: "open"
        }), l.addEventListener("keydown", $), s = document.createElement("div"), s.setAttribute("aria-live", "polite"), 
        s.className = "sr";
    }(), g(), p = new MutationObserver(I), p.observe(document.documentElement, {
        childList: !0,
        subtree: !0,
        attributes: !0,
        attributeFilter: [ "data-unship-pick", "data-unship-option", "hidden" ]
    }), document.addEventListener("focusin", A, !0), i && document.addEventListener("keydown", E);
})();
