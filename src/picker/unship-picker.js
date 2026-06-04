(() => {
  if (window.__unshipPicker) return;

  const OPTION_ATTR = "data-unship-option";
  const GROUP_SELECTOR = "[data-unship-pick]";
  const currentScript = document.currentScript;
  const persistLocal = currentScript?.getAttribute("data-unship-persist") === "local";
  const useGlobalShortcuts = currentScript?.hasAttribute("data-unship-global-shortcuts");

  const originalDisplayByOption = new WeakMap();
  const selectedIndexByGroup = new WeakMap();

  let host;
  let root;
  let liveRegion;
  let observer;
  let groups = [];
  let activeGroupIndex = 0;
  let menuOpen = false;
  let placement = "bottom";
  let placementLocked = false;
  let rescanQueued = false;
  let renderedSignature = "";

  const api = {
    version: "0.1.0",
    rescan,
    destroy,
    getState
  };

  function rescan() {
    groups = Array.from(document.querySelectorAll(GROUP_SELECTOR)).map(toGroup).filter(Boolean);
    disambiguateGroupLabels(groups);
    if (activeGroupIndex >= groups.length) activeGroupIndex = Math.max(0, groups.length - 1);
    if (groups.length < 2) menuOpen = false;
    groups.forEach(applyGroupVisibility);
    render();
  }

  function destroy() {
    observer?.disconnect();
    document.removeEventListener("focusin", handleDocumentFocus, true);
    document.removeEventListener("keydown", handleGlobalKeydown);
    window.visualViewport?.removeEventListener("resize", syncViewportBounds);
    window.visualViewport?.removeEventListener("scroll", syncViewportBounds);
    host?.remove();
    delete window.__unshipPicker;
  }

  function getState() {
    return {
      groups: groups.map((group) => ({
        label: group.label,
        displayLabel: group.displayLabel,
        activeOptionIndex: group.activeOptionIndex,
        options: group.options.map((option) => option.label)
      })),
      activeGroupIndex,
      toolbarMode: groups.length === 0 ? "none" : groups.length === 1 ? "single" : "multi"
    };
  }

  function toGroup(element, groupIndex) {
    const options = Array.from(element.children)
      .filter((child) => child.hasAttribute(OPTION_ATTR))
      .map((child, optionIndex) => ({
        element: child,
        label: child.getAttribute(OPTION_ATTR) || `Option ${optionIndex + 1}`,
        index: optionIndex
      }));

    if (!options.length) return null;

    const label = element.getAttribute("data-unship-pick") || `Group ${groupIndex + 1}`;
    const activeOptionIndex =
      selectedIndexByGroup.get(element) ??
      restorePersistedSelection(groupIndex, label, options) ??
      findVisibleOptionIndex(options);

    return {
      element,
      index: groupIndex,
      label,
      displayLabel: label,
      options,
      activeOptionIndex: clamp(activeOptionIndex, options.length)
    };
  }

  function disambiguateGroupLabels(nextGroups) {
    const totals = new Map();
    const seen = new Map();

    nextGroups.forEach((group) => totals.set(group.label, (totals.get(group.label) || 0) + 1));
    nextGroups.forEach((group) => {
      const count = (seen.get(group.label) || 0) + 1;
      seen.set(group.label, count);
      group.displayLabel = totals.get(group.label) > 1 ? `${group.label} ${count}` : group.label;
    });
  }

  function findVisibleOptionIndex(options) {
    const index = options.findIndex((option) => {
      const element = option.element;
      return !element.hidden && getComputedStyle(element).display !== "none";
    });
    return index === -1 ? 0 : index;
  }

  function applyGroupVisibility(group) {
    pauseObserver(() => {
      group.activeOptionIndex = clamp(group.activeOptionIndex, group.options.length);
      group.options.forEach((option, index) => {
        if (index === group.activeOptionIndex) showOption(option.element);
        else hideOption(option.element);
      });
      selectedIndexByGroup.set(group.element, group.activeOptionIndex);
    });
  }

  function showOption(element) {
    if (element.hidden) element.hidden = false;

    if (originalDisplayByOption.has(element)) {
      const originalDisplay = originalDisplayByOption.get(element);
      if (originalDisplay) element.style.display = originalDisplay;
      else if (element.style.display) element.style.removeProperty("display");
    } else if (element.style.display) {
      element.style.removeProperty("display");
    }
  }

  function hideOption(element) {
    if (!originalDisplayByOption.has(element)) {
      originalDisplayByOption.set(element, element.style.display || "");
    }
    if (!element.hidden) element.hidden = true;
    if (element.style.display !== "none") element.style.display = "none";
  }

  function switchOption(delta) {
    const group = groups[activeGroupIndex];
    if (!group) return;

    group.activeOptionIndex = wrap(group.activeOptionIndex + delta, group.options.length);
    applyGroupVisibility(group);
    persistSelection(group);
    render();
    repairFocus(group.options[group.activeOptionIndex].element);
    announce(group);
  }

  function switchGroup(delta) {
    if (groups.length < 2) return;

    activeGroupIndex = wrap(activeGroupIndex + delta, groups.length);
    menuOpen = false;
    render();
    announce(groups[activeGroupIndex]);
  }

  function pickGroup(index) {
    if (!Number.isInteger(index) || !groups[index]) return;

    activeGroupIndex = index;
    menuOpen = false;
    render();
    announce(groups[activeGroupIndex]);
  }

  function render() {
    if (!root) return;

    const group = groups[activeGroupIndex];
    if (!group) {
      if (renderedSignature === "none") return;
      renderedSignature = "none";
      root.innerHTML = "";
      root.append(liveRegion);
      return;
    }

    group.activeOptionIndex = clamp(group.activeOptionIndex, group.options.length);
    const option = group.options[group.activeOptionIndex];
    const mode = groups.length === 1 ? "single" : "multi";
    const nextSignature = renderSignature(mode);
    if (nextSignature === renderedSignature) return;
    renderedSignature = nextSignature;

    root.innerHTML = `${style()}<div class="dock ${mode} ${placement} ${menuOpen ? "open" : ""}" role="group" aria-label="Unship variant picker">
      ${groups.length > 1 ? groupButton(group) : ""}
      ${groups.length > 1 ? menu() : ""}
      <div class="row">
        <button class="prev nav" type="button" data-action="previous" aria-label="Previous option">&#8249;</button>
        <button class="label" type="button" data-action="toggle-placement" aria-label="${escapeHtml(group.displayLabel)}, ${escapeHtml(option.label)}, option ${group.activeOptionIndex + 1} of ${group.options.length}. Toggle toolbar position">
          <span class="label-main">${escapeHtml(groups.length === 1 ? `${group.displayLabel}: ${option.label}` : option.label)}</span>
          ${groups.length === 1 ? `<span class="option-count">${group.activeOptionIndex + 1}/${group.options.length}</span>` : ""}
        </button>
        <button class="next nav" type="button" data-action="next" aria-label="Next option">&#8250;</button>
      </div>
    </div>`;
    root.append(liveRegion);
  }

  function renderSignature(mode) {
    return JSON.stringify({
      activeGroupIndex,
      menuOpen,
      mode,
      placement,
      groups: groups.map((group) => {
        const activeOption = group.options[clamp(group.activeOptionIndex, group.options.length)];
        return {
          displayLabel: group.displayLabel,
          activeOptionIndex: group.activeOptionIndex,
          activeOptionLabel: activeOption?.label,
          optionCount: group.options.length
        };
      })
    });
  }

  function groupButton(group) {
    return `<button class="group" type="button" data-action="toggle-menu" aria-haspopup="menu" aria-expanded="${menuOpen}" aria-label="Active group ${escapeHtml(group.displayLabel)}">
      <span class="group-name">${escapeHtml(group.displayLabel)}</span><span class="group-count">${group.activeOptionIndex + 1}/${group.options.length}</span><span class="caret">&#9662;</span>
    </button>`;
  }

  function menu() {
    const items = groups
      .map((group, index) => {
        if (index === activeGroupIndex) return "";
        const option = group.options[clamp(group.activeOptionIndex, group.options.length)];
        return `<button class="menuitem" type="button" role="menuitem" data-action="pick-group" data-index="${index}" aria-label="${escapeHtml(group.displayLabel)}, ${escapeHtml(option.label)}"><span class="menu-name">${escapeHtml(group.displayLabel)}</span><span class="menu-option">${escapeHtml(option.label)}</span></button>`;
      })
      .join("");

    return `<div class="menu" role="menu" aria-hidden="${!menuOpen}">${items}</div>`;
  }

  function handleToolbarClick(event) {
    const button = event.target.closest?.("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    if (action === "previous") switchOption(-1);
    else if (action === "next") switchOption(1);
    else if (action === "toggle-menu") {
      menuOpen = !menuOpen;
      render();
    } else if (action === "toggle-placement") {
      placementLocked = true;
      placement = placement === "top" ? "bottom" : "top";
      render();
    } else if (action === "pick-group") {
      pickGroup(Number(button.dataset.index));
    }
  }

  function handleToolbarMouseDown(event) {
    if (event.target.closest?.("button")) event.preventDefault();
  }

  function handleToolbarKeydown(event) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      switchOption(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      switchOption(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      switchGroup(-1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      switchGroup(1);
    } else if (event.key === "Escape") {
      if (!menuOpen) {
        document.activeElement?.blur();
        return;
      }
      event.preventDefault();
      menuOpen = false;
      render();
    }
  }

  function handleGlobalKeydown(event) {
    if (root?.activeElement || isTypingTarget(event.target)) return;

    if (event.key === "ArrowLeft") switchOption(-1);
    else if (event.key === "ArrowRight") switchOption(1);
    else if (event.key === "ArrowUp") switchGroup(-1);
    else if (event.key === "ArrowDown") switchGroup(1);
  }

  function isTypingTarget(target) {
    return Boolean(
      target &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.isContentEditable ||
          target.closest?.("[data-unship-ignore-shortcuts],[role='application']"))
    );
  }

  function repairFocus(incomingOption) {
    if (isFocusable(incomingOption)) {
      incomingOption.focus({ preventScroll: true });
      return;
    }
    setTimeout(() => root?.querySelector(".label")?.focus({ preventScroll: true }));
  }

  function isFocusable(element) {
    return Boolean(
      element &&
        ((element.hasAttribute("tabindex") && element.tabIndex >= 0) ||
          (/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(element.tagName) && !element.disabled))
    );
  }

  function announce(group) {
    const option = group.options[group.activeOptionIndex];
    liveRegion.textContent = `${group.displayLabel}, ${option.label}, option ${group.activeOptionIndex + 1} of ${group.options.length}`;
  }

  function queueRescan() {
    if (rescanQueued) return;
    rescanQueued = true;
    requestAnimationFrame(() => {
      rescanQueued = false;
      rescan();
    });
  }

  function pauseObserver(callback) {
    if (!observer) return callback();

    observer.disconnect();
    try {
      return callback();
    } finally {
      observer.takeRecords();
      observeDocument();
    }
  }

  function observeDocument() {
    observer?.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-unship-pick", OPTION_ATTR, "hidden"]
    });
  }

  function handleDocumentFocus(event) {
    placeAwayFrom(event.target);
  }

  function placeAwayFrom(target) {
    if (!target || host?.contains(target)) return;
    if (placementLocked) return;

    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const rect = target.getBoundingClientRect?.();
    placement = rect && rect.bottom > viewportHeight - 96 ? "top" : "bottom";
    root?.querySelector(".dock")?.classList.toggle("top", placement === "top");
    root?.querySelector(".dock")?.classList.toggle("bottom", placement !== "top");
  }

  function syncViewportBounds() {
    if (!host) return;

    const visualViewport = window.visualViewport;
    const widths = [visualViewport?.width, window.innerWidth, window.outerWidth, window.screen?.width].filter(
      (width) => Number.isFinite(width) && width > 0
    );
    const width = Math.min(...widths);
    const center = (visualViewport?.offsetLeft || 0) + width / 2;
    const visibleBottom = visualViewport
      ? Math.max(14, window.innerHeight - visualViewport.height - visualViewport.offsetTop + 14)
      : 14;
    const visibleTop = visualViewport ? Math.max(14, visualViewport.offsetTop + 14) : 14;

    host.style.setProperty("--unship-left", `${center}px`);
    host.style.setProperty("--unship-max-width", `${Math.max(240, width - 20)}px`);
    host.style.setProperty("--unship-bottom", `${visibleBottom}px`);
    host.style.setProperty("--unship-top", `${visibleTop}px`);
  }

  function restorePersistedSelection(groupIndex, label, options) {
    if (!persistLocal) return undefined;
    try {
      const savedLabel = localStorage.getItem(storageKey(groupIndex, label));
      const savedIndex = options.findIndex((option) => option.label === savedLabel);
      return savedIndex === -1 ? undefined : savedIndex;
    } catch {
      return undefined;
    }
  }

  function persistSelection(group) {
    if (!persistLocal) return;
    try {
      localStorage.setItem(storageKey(group.index, group.label), group.options[group.activeOptionIndex].label);
    } catch {}
  }

  function storageKey(groupIndex, label) {
    return `unship:${location.pathname}:${groupIndex}:${label}`;
  }

  function clamp(value, length) {
    return Math.min(Math.max(value, 0), length - 1);
  }

  function wrap(value, length) {
    return ((value % length) + length) % length;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function style() {
    return `<style>
      .dock{--ease:cubic-bezier(.37,0,.63,1);--dur:.28s;--h:34px;--nav:34px;--r:10px;--gap:6px;--navfs:18px;--fs:12px;position:fixed;left:var(--unship-left,50%);bottom:var(--unship-bottom,max(14px,env(safe-area-inset-bottom)));transform:translateX(-50%);z-index:2147483647;box-sizing:border-box;width:min(328px,var(--unship-max-width,calc(100vw - 20px)));max-width:calc(100vw - 20px);display:block;padding:var(--gap);border:1px solid rgba(255,255,255,.18);border-radius:calc(var(--r) + var(--gap));background:linear-gradient(180deg,rgba(39,39,42,.96),rgba(24,24,27,.96));backdrop-filter:blur(18px) saturate(1.2);color:#fafafa;font:600 var(--fs)/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 18px 42px rgba(0,0,0,.28)}
      .dock.top{top:var(--unship-top,max(14px,env(safe-area-inset-top)));bottom:auto}
      button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
      button:focus-visible{outline:0;background:rgba(255,255,255,.12)}
      .group{display:flex;align-items:center;gap:.65em;width:100%;min-height:var(--h);padding:0 .85em 0 .95em;border-radius:var(--r);margin-bottom:var(--gap);transition:background .14s ease,box-shadow .14s ease}
      .group:hover{background:rgba(255,255,255,.1)}
      .open .group{background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
      .group-name{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .group-count{margin-left:auto;opacity:.62;font-variant-numeric:tabular-nums}
      .caret{opacity:.65;font-size:.8em;transition:transform var(--dur) var(--ease)}
      .open .caret{transform:rotate(180deg)}
      .menu{display:grid;gap:var(--gap);overflow:hidden;max-height:0;opacity:0;visibility:hidden;transition:max-height var(--dur) var(--ease),opacity .14s ease}
      .open .menu{max-height:min(264px,calc(100vh - 168px));overflow-y:auto;opacity:1;visibility:visible;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.28) transparent}
      .menuitem{display:flex;align-items:center;gap:.8em;width:100%;min-height:var(--h);padding:0 .85em 0 .95em;border-radius:var(--r);text-align:left;transition:background .12s ease}
      .menuitem:hover{background:rgba(255,255,255,.1)}
      .menu-name{font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .menu-option{margin-left:auto;opacity:.62;font-size:.9em;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
      .row{display:flex;align-items:center;gap:.3em;transition:margin-top var(--dur) var(--ease),padding-top var(--dur) var(--ease)}
      .open .row{margin-top:var(--gap);padding-top:var(--gap);border-top:1px solid rgba(255,255,255,.1)}
      .nav{width:var(--nav);height:var(--nav);min-width:var(--nav);min-height:var(--nav);display:grid;place-items:center;font-size:var(--navfs);line-height:1;border-radius:999px;transition:background .12s ease,transform .12s ease}
      .nav:hover{background:rgba(255,255,255,.14)}
      .nav:active{transform:scale(.9)}
      .label{flex:1;min-width:0;text-align:center;padding:0 .65em;min-height:var(--h);display:flex;align-items:center;justify-content:center;gap:.55em;white-space:nowrap;overflow:hidden;border-radius:var(--r);transition:background .12s ease}
      .label:hover{background:rgba(255,255,255,.08)}
      .label-main{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .option-count{flex:none;opacity:.62;font-variant-numeric:tabular-nums}
      .sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      @media (pointer:coarse),(max-width:520px){.dock{--h:40px;--nav:40px;--navfs:20px;width:min(344px,var(--unship-max-width,calc(100vw - 20px)))}}
      @media (prefers-reduced-motion:reduce){*{transition:none!important}}
      @media (prefers-reduced-transparency:reduce){.dock{background:rgba(24,24,27,.98);backdrop-filter:none}}
      @supports not ((backdrop-filter:blur(1px))){.dock{background:rgba(24,24,27,.98)}}
    </style>`;
  }

  function init() {
    host = document.createElement("div");
    host.setAttribute("data-unship-toolbar", "");
    document.documentElement.append(host);

    syncViewportBounds();
    window.visualViewport?.addEventListener("resize", syncViewportBounds);
    window.visualViewport?.addEventListener("scroll", syncViewportBounds);

    root = host.attachShadow({ mode: "open" });
    root.addEventListener("click", handleToolbarClick);
    root.addEventListener("mousedown", handleToolbarMouseDown);
    root.addEventListener("keydown", handleToolbarKeydown);

    liveRegion = document.createElement("div");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.className = "sr";

    rescan();
    observer = new MutationObserver(queueRescan);
    observeDocument();
    document.addEventListener("focusin", handleDocumentFocus, true);
    if (useGlobalShortcuts) document.addEventListener("keydown", handleGlobalKeydown);
  }

  window.__unshipPicker = api;
  init();
})();
