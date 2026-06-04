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
  let lastSwitchDir = null;
  let menuJustOpened = false;

  const api = {
    version: "0.1.1",
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
    lastSwitchDir = delta > 0 ? "next" : "prev";
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
    const group = groups[activeGroupIndex];
    const dock = root?.querySelector(".dock");

    if (menuOpen && dock) {
      // Update the visible texts in place, then contract the menu like a
      // regular close. The hidden menu list goes stale but the next render
      // (required before the menu can reopen) rebuilds it.
      const option = group.options[clamp(group.activeOptionIndex, group.options.length)];
      const groupBtn = dock.querySelector(".group");
      groupBtn?.setAttribute("aria-label", `Active group ${group.displayLabel}`);
      const nameEl = dock.querySelector(".group-name");
      if (nameEl) nameEl.textContent = group.displayLabel;
      const countEl = dock.querySelector(".group-count");
      if (countEl) countEl.textContent = `${group.activeOptionIndex + 1}/${group.options.length}`;
      const labelMain = dock.querySelector(".label-main");
      if (labelMain) labelMain.textContent = option.label;
      dock
        .querySelector(".label")
        ?.setAttribute(
          "aria-label",
          `${group.displayLabel}, ${option.label}, option ${group.activeOptionIndex + 1} of ${group.options.length}. Toggle toolbar position`
        );
      closeMenu();
    } else {
      menuOpen = false;
      render();
    }
    announce(group);
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;

    const dock = root?.querySelector(".dock");
    if (!dock) {
      render();
      return;
    }

    dock.classList.remove("open", "menu-anim");
    dock.querySelector(".group")?.setAttribute("aria-expanded", "false");
    dock.querySelector(".menu")?.setAttribute("aria-hidden", "true");
    renderedSignature = renderSignature(groups.length === 1 ? "single" : "multi");
  }

  function render() {
    if (!root) return;

    const switchDir = lastSwitchDir;
    const menuAnim = menuJustOpened;
    lastSwitchDir = null;
    menuJustOpened = false;

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
    const entering = renderedSignature === "" || renderedSignature === "none";
    renderedSignature = nextSignature;

    const swapClass = switchDir ? " swap" : "";
    root.innerHTML = `${style()}<div class="dock ${mode} ${placement} ${menuOpen ? "open" : ""}${menuAnim && menuOpen ? " menu-anim" : ""}${entering ? " enter" : ""}"${switchDir ? ` data-dir="${switchDir}"` : ""} role="group" aria-label="Unship variant picker">
      ${groups.length > 1 ? groupButton(group, swapClass) : ""}
      ${groups.length > 1 ? menu() : ""}
      <div class="row">
        <button class="prev nav" type="button" data-action="previous" aria-label="Previous option"></button>
        <button class="label" type="button" data-action="toggle-placement" aria-label="${escapeHtml(group.displayLabel)}, ${escapeHtml(option.label)}, option ${group.activeOptionIndex + 1} of ${group.options.length}. Toggle toolbar position">
          <span class="label-main${swapClass}">${escapeHtml(groups.length === 1 ? `${group.displayLabel}: ${option.label}` : option.label)}</span>
          ${groups.length === 1 ? `<span class="option-count${swapClass}">${group.activeOptionIndex + 1}/${group.options.length}</span>` : ""}
        </button>
        <button class="next nav" type="button" data-action="next" aria-label="Next option"></button>
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

  function groupButton(group, swapClass = "") {
    return `<button class="group" type="button" data-action="toggle-menu" aria-haspopup="menu" aria-expanded="${menuOpen}" aria-label="Active group ${escapeHtml(group.displayLabel)}">
      <span class="group-name">${escapeHtml(group.displayLabel)}</span><span class="group-count${swapClass}">${group.activeOptionIndex + 1}/${group.options.length}</span>
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
      if (menuOpen) {
        closeMenu();
      } else {
        menuOpen = true;
        menuJustOpened = true;
        render();
      }
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
      closeMenu();
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
      .dock{--ease:cubic-bezier(0,0,.2,1);--dur:.18s;--h:34px;--nav:34px;--r:999px;--gap:6px;--navfs:18px;--fs:12.5px;position:fixed;left:var(--unship-left,50%);bottom:var(--unship-bottom,max(14px,env(safe-area-inset-bottom)));transform:translateX(-50%);z-index:2147483647;box-sizing:border-box;width:min(328px,var(--unship-max-width,calc(100vw - 20px)));max-width:calc(100vw - 20px);display:block;padding:var(--gap);border-radius:24px;background:#000;color:#fff;font:500 var(--fs)/1.2 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:-.02em}
      .dock.top{top:var(--unship-top,max(14px,env(safe-area-inset-top)));bottom:auto}
      button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
      button:focus-visible{outline:0;background:rgba(255,255,255,.12)}
      .group{display:flex;align-items:center;gap:.65em;width:100%;min-height:var(--h);padding:0 .85em 0 .95em;border-radius:var(--r);margin-bottom:var(--gap);transition:background .14s ease,color .14s ease}
      .group:hover{background:rgba(255,255,255,.12)}
      .open .group{background:#f5f5f5;color:#000}
      .open .group .group-count{opacity:.55}
      .group-name{font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .group-count{margin-left:auto;opacity:.7;font-variant-numeric:tabular-nums}
      .menu{display:grid;gap:var(--gap);overflow:hidden;max-height:0;opacity:0;visibility:hidden;transition:max-height var(--dur) var(--ease),opacity .12s ease,visibility 0s linear var(--dur)}
      .open .menu{max-height:min(264px,calc(100vh - 168px));overflow-y:auto;opacity:1;visibility:visible;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.28) transparent}
      .menuitem{display:flex;align-items:center;gap:.8em;width:100%;min-height:var(--h);padding:0 .85em 0 .95em;border-radius:var(--r);text-align:left;transition:background .12s ease}
      .menuitem:hover{background:rgba(255,255,255,.12)}
      .menu-name{font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .menu-option{margin-left:auto;opacity:.7;font-size:.9em;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
      .row{display:flex;align-items:center;gap:.3em;transition:margin-top var(--dur) var(--ease),padding-top var(--dur) var(--ease)}
      .open .row{margin-top:var(--gap);padding-top:var(--gap);border-top:1px solid rgba(255,255,255,.15)}
      .nav{width:var(--nav);height:var(--nav);min-width:var(--nav);min-height:var(--nav);display:grid;place-items:center;font-size:var(--navfs);line-height:1;border-radius:999px;transition:transform .12s ease}
      .nav::before{content:"";width:6px;height:6px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor}
      .prev::before{transform:rotate(225deg) translate(-1px,-1px)}
      .next::before{transform:rotate(45deg) translate(-1px,1px)}
      .nav:hover{background:rgba(255,255,255,.12)}
      .nav:active{transform:scale(.9)}
      .label{flex:1;min-width:0;text-align:center;padding:0 .65em;min-height:var(--h);display:flex;align-items:center;justify-content:center;gap:.55em;white-space:nowrap;overflow:hidden;border-radius:var(--r);transition:background .12s ease}
      .label:hover,.label:focus,.label:focus-visible{background:transparent;box-shadow:none}
      .label-main{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .option-count{flex:none;opacity:.7;font-variant-numeric:tabular-nums}
      .sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      @keyframes dockIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}60%{opacity:1}to{opacity:1;transform:translateX(-50%)}}
      @keyframes dockInTop{from{opacity:0;transform:translateX(-50%) translateY(10px)}60%{opacity:1}to{opacity:1;transform:translateX(-50%)}}
      @keyframes menuIn{from{max-height:0}to{max-height:min(264px,calc(100vh - 168px))}}
      @keyframes itemIn{from{opacity:0}}
      @keyframes swapIn{from{opacity:0;transform:translate(var(--dx,0px),var(--dy,0px))}to{transform:none}}
      .dock.enter{animation:dockIn .2s cubic-bezier(0,0,.2,1)}
      .dock.top.enter{animation-name:dockInTop}
      .menu-anim .menu{animation:menuIn .22s cubic-bezier(.22,.61,.36,1)}
      .menu-anim .menuitem{animation:itemIn .24s ease backwards}
      .menu-anim .menuitem:nth-child(2){animation-delay:.03s}
      .menu-anim .menuitem:nth-child(n+3){animation-delay:.06s}
      .dock[data-dir="next"] .row{--dx:8px}
      .dock[data-dir="prev"] .row{--dx:-8px}
      .dock[data-dir="next"] .group{--dx:0px;--dy:8px}
      .dock[data-dir="prev"] .group{--dx:0px;--dy:-8px}
      .label-main.swap,.option-count.swap{animation:swapIn .11s cubic-bezier(0,0,.2,1)}
      .group-count.swap{animation:swapIn .13s cubic-bezier(0,0,.2,1)}
      @media (pointer:coarse),(max-width:520px){.dock{--h:40px;--nav:40px;--navfs:20px;width:min(344px,var(--unship-max-width,calc(100vw - 20px)))}}
      @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
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
