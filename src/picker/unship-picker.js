(() => {
  if (window.__unshipPicker) return;

  const OPTION_ATTR = "data-unship-option";
  const CANVAS_ATTR = "data-unship-canvas";
  const GROUP_SELECTOR = "[data-unship-pick]";
  const CANVAS_LAYOUTS = new Set(["stack", "grid", "matrix"]);
  const MATRIX_WIDTHS = [1280, 768, 390];
  const CANVAS_ICONS = {
    desktop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg>',
    backToPage: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-2"/><path d="M5 12h8m-2.5-2.5 2.5 2.5-2.5 2.5"/></svg>',
    frames: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v5"/><rect x="10" y="11" width="11" height="9" rx="2"/></svg>',
    responsive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 15.5H4.5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2V9M10 15.5v4m-4 0h6"/><rect x="13" y="9" width="8.5" height="12" rx="2"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.2 3.6a8.6 8.6 0 1 0 10.2 10.2A7 7 0 0 1 10.2 3.6Z"></path></svg>'
  };
  const CANVAS_MIN_ZOOM = 0.05;
  const CANVAS_MAX_ZOOM = 2;
  const CANVAS_ZOOM_MOTION = { duration: 190, step: 0.1, pinch: 2.4 };
  const CANVAS_CACHE_MS = 45_000;
  // Hold-to-keep timing: the commit timer equals the fill animation's delay
  // plus duration, so the pill is fully filled exactly when the copy fires.
  const HOLD_FILL_DELAY_MS = 120;
  const HOLD_FILL_MS = 600;
  const HOLD_COMMIT_MS = HOLD_FILL_DELAY_MS + HOLD_FILL_MS;
  // Minimized button diameter; the box morph animates the dock to and from
  // this exact geometry, so it must stay in sync with the .minimized CSS.
  const MINI_SIZE_PX = 28;
  const currentScript = document.currentScript;
  const persistLocal = currentScript?.getAttribute("data-unship-persist") === "local";
  const useGlobalShortcuts = currentScript?.hasAttribute("data-unship-global-shortcuts");

  const originalDisplayByOption = new WeakMap();
  const selectedIndexByGroup = new WeakMap();

  let host;
  let root;
  let styleNode;
  let liveRegion;
  let observer;
  let groups = [];
  let activeGroupIndex = 0;
  let menuOpen = false;
  let menuCloseTimer = null;
  let menuCloseAction = null;
  let placement = "bottom";
  let rescanFrame = 0;
  let renderedSignature = "";
  let lastSwitchDir = null;
  // Minimize, hold-to-keep, drag-snap, and scroll-to-group state. Placement is
  // bottom-only unless the user drags the dock; there is no label-click
  // placement toggle and no focus-driven auto-flip.
  let minimized = false;
  let copied = false;
  let copiedTimer = null;
  let holdTimer = null;
  let holdFired = false;
  let anchorH = null;
  restoreToolbarPlacement();
  let gesturePointerId = null;
  let gestureCleanup = null;
  let ghost = null;
  let canvasOpen = false;
  let canvasPreparing = false;
  let canvasShell = null;
  let canvasCloseTimer = null;
  let canvasRevealTimer = null;
  let canvasEntryTimer = null;
  let canvasContentTimer = null;
  let canvasCacheTimer = null;
  let canvasDockEntering = false;
  let canvasSnapshot = "";
  let canvasDirty = false;
  let canvasKeepQueue = Promise.resolve();
  let canvasSourceIdentity = [];
  let canvasZoom = 1;
  let canvasTheme = "light";
  let canvasPreviousOverflow = "";
  let canvasCamera = null;
  let canvasCursor = null;
  let canvasZoomAnimation = null;
  let canvasWheelMode = null;
  let canvasWheelModeTimer = null;
  let canvasPinchFrame = 0;
  let canvasPinchDelta = 0;
  let canvasPinchFocal = null;
  let canvasPanGesture = null;
  let canvasFrameTarget = null;
  let canvasFrameHideTimer = null;
  const canvasVisibleWidths = new Set([MATRIX_WIDTHS[0]]);
  const canvasKeeps = new Map();

  const api = {
    version: "0.2.0",
    rescan,
    destroy,
    getState
  };

  function rescan() {
    if (canvasShell) canvasDirty = true;
    groups = Array.from(document.querySelectorAll(GROUP_SELECTOR)).map(toGroup).filter(Boolean);
    groups.forEach((group, index) => { group.index = index; });
    disambiguateGroupLabels(groups);
    if (activeGroupIndex >= groups.length) activeGroupIndex = Math.max(0, groups.length - 1);
    if (groups.length < 2) menuOpen = false;
    groups.forEach(applyGroupVisibility);
    render();
  }

  function destroy() {
    closeCanvas({ renderAfter: false });
    gestureCleanup?.();
    clearTimeout(menuCloseTimer);
    menuCloseAction = null;
    observer?.disconnect();
    cancelAnimationFrame(rescanFrame);
    clearTimeout(holdTimer);
    clearTimeout(copiedTimer);
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
      toolbarMode: groups.length === 0 ? "none" : groups.length === 1 ? "single" : "multi",
      canvas: {
        open: canvasOpen,
        preparing: canvasPreparing,
        cached: Boolean(canvasShell && !canvasOpen && !canvasPreparing),
        theme: canvasTheme,
        zoom: canvasZoom,
        visibleWidths: Array.from(canvasVisibleWidths),
        groups: groups.map((group) => ({ label: group.displayLabel, layout: group.canvasLayout }))
      }
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
    const canvasHint = (element.getAttribute(CANVAS_ATTR) || "").trim();
    const activeOptionIndex =
      selectedIndexByGroup.get(element) ??
      restorePersistedSelection(groupIndex, label, options) ??
      findVisibleOptionIndex(options);

    return {
      element,
      index: groupIndex,
      sourceIndex: groupIndex,
      label,
      displayLabel: label,
      options,
      canvasLayout: CANVAS_LAYOUTS.has(canvasHint) ? canvasHint : "stack",
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
    if (element.style.display !== "none" && getComputedStyle(element).display !== "none") element.style.display = "none";
  }

  function switchOption(delta) {
    const group = groups[activeGroupIndex];
    if (!group) return;

    clearCopiedStatus();
    group.activeOptionIndex = wrap(group.activeOptionIndex + delta, group.options.length);
    lastSwitchDir = delta > 0 ? "next" : "prev";
    applyGroupVisibility(group);
    persistSelection(group);
    render();
    repairFocus(group.options[group.activeOptionIndex].element);
    announce(group);
  }

  function navigateOption(delta) {
    afterMenuClose(() => switchOption(delta));
  }

  function switchGroup(delta) {
    if (groups.length < 2) return;

    clearCopiedStatus();
    activeGroupIndex = wrap(activeGroupIndex + delta, groups.length);
    menuOpen = false;
    render();
    announce(groups[activeGroupIndex]);
    scrollToGroup(groups[activeGroupIndex]);
  }

  function navigateGroup(delta) {
    afterMenuClose(() => switchGroup(delta));
  }

  function pickGroup(index) {
    if (!Number.isInteger(index) || !groups[index]) return;

    afterMenuClose(() => {
      clearCopiedStatus();
      activeGroupIndex = index;
      const group = groups[activeGroupIndex];
      renderedSignature = "";
      render();
      announce(group);
      scrollToGroup(group);
    });
  }

  function finishMenuClose() {
    clearTimeout(menuCloseTimer);
    menuCloseTimer = null;
    const action = menuCloseAction;
    menuCloseAction = null;
    action?.();
  }

  function afterMenuClose(action) {
    if (menuOpen) {
      closeMenu(action);
      return;
    }
    if (menuCloseTimer) {
      const previous = menuCloseAction;
      menuCloseAction = () => {
        previous?.();
        action();
      };
      return;
    }
    action();
  }

  function openMenu() {
    if (menuOpen) return;
    if (menuCloseTimer) finishMenuClose();
    menuOpen = true;
    clearTimeout(menuCloseTimer);
    menuCloseTimer = null;
    menuCloseAction = null;

    const dock = root?.querySelector(".dock");
    if (!dock) {
      render();
      return;
    }

    const list = dock.querySelector(".menu-list");
    if (list) {
      const reservedHeight = dock.offsetHeight - list.offsetHeight - dock.querySelector(".row").offsetHeight
        - parseFloat(getComputedStyle(list).marginTop) - parseFloat(getComputedStyle(dock.querySelector(".menu")).marginBottom)
        + parseFloat(getComputedStyle(dock).getPropertyValue("--gap"));
      const viewportLimit = Math.max(0, Math.min(224, window.innerHeight - reservedHeight - 28));
      list.style.setProperty("--menu-list-height", `${Math.min(list.scrollHeight, viewportLimit)}px`);
    }
    dock.querySelector(".row").inert = true;
    dock.classList.add("open");
    dock.querySelector(".menuitem.current")?.setAttribute("aria-expanded", "true");
    renderedSignature = renderSignature(groups.length === 1 ? "single" : "multi");
  }

  function closeMenu(afterClose) {
    if (!menuOpen) return;
    menuOpen = false;

    const dock = root?.querySelector(".dock");
    if (!dock) {
      render();
      afterClose?.();
      return;
    }

    dock.querySelector(".row").inert = false;
    dock.classList.remove("open");
    dock.querySelector(".menuitem.current")?.setAttribute("aria-expanded", "false");
    clearTimeout(menuCloseTimer);
    menuCloseAction = afterClose || null;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) finishMenuClose();
    else menuCloseTimer = setTimeout(finishMenuClose, 290);
    renderedSignature = renderSignature(groups.length === 1 ? "single" : "multi");
  }

  function render() {
    if (!root) return;
    if (canvasOpen) {
      host.setAttribute("role", "dialog");
      host.setAttribute("aria-modal", "true");
      host.setAttribute("aria-label", "Unship Canvas");
    } else {
      host.removeAttribute("role");
      host.removeAttribute("aria-modal");
      host.removeAttribute("aria-label");
    }

    const switchDir = lastSwitchDir;
    lastSwitchDir = null;

    const group = groups[activeGroupIndex];
    if (!group) {
      if (renderedSignature === "none") return;
      renderedSignature = "none";
      setToolbarHtml("");
      return;
    }

    group.activeOptionIndex = clamp(group.activeOptionIndex, group.options.length);
    const option = group.options[group.activeOptionIndex];
    const mode = canvasOpen ? "canvas" : groups.length === 1 ? "single" : "multi";
    const nextSignature = renderSignature(mode);
    if (nextSignature === renderedSignature) return;
    const entering = renderedSignature === "" || renderedSignature === "none";
    renderedSignature = nextSignature;
    if (canvasOpen) {
      setToolbarHtml(`<div class="dock canvas-dock bottom${canvasDockEntering ? " enter" : ""}" role="group" aria-label="Unship Canvas controls">
        <div class="row canvas-row">${canvasRowMarkup()}</div>
      </div>`);
      return;
    }

    // Minimized form: a small circular button holding the diamond mark.
    if (minimized) {
      setToolbarHtml(`<button class="minimized ${placement}" type="button" data-action="restore" aria-label="Restore Unship toolbar — ${escapeHtml(option.label)}, option ${group.activeOptionIndex + 1} of ${group.options.length}"></button>`);
      return;
    }

    const swapClass = switchDir ? " swap" : "";
    setToolbarHtml(`<div class="dock ${mode} ${placement} ${menuOpen ? "open" : ""}${entering ? " enter" : ""}"${switchDir ? ` data-dir="${switchDir}"` : ""} role="group" aria-label="Unship variant picker">
      ${groups.length > 1 ? menu() : `<div class="menu"><div class="menu-header full-canvas">${canvasButton()}</div></div>`}
      <div class="row"${menuOpen ? " inert" : ""}>
        ${rowMarkup(group, option, swapClass)}
      </div>
    </div>`);
  }

  // Capability slots: chevrons and the counter exist only when there is more
  // than one option to compare. The label supports keep, drag and minimize.
  function rowMarkup(group, option, swapClass = "") {
    const comparable = group.options.length > 1;
    const title =
      copied === "ok"
        ? '<span>Copied</span><span class="copy-next">Paste into your AI chat</span>'
        : copied === "fail"
          ? "Couldn't copy. Try again"
          : escapeHtml(option.label);
    const ariaLabel = comparable
      ? `${escapeHtml(group.displayLabel)}, ${escapeHtml(option.label)}, option ${group.activeOptionIndex + 1} of ${group.options.length}. Hold to copy this choice, then paste into your AI chat. Double-click to minimize, drag to move. Press Enter to copy, Shift plus Enter to minimize`
      : `${escapeHtml(group.displayLabel)}, ${escapeHtml(option.label)}. Hold to copy this choice, then paste into your AI chat. Double-click to minimize, drag to move. Press Enter to copy, Shift plus Enter to minimize`;
    return `${comparable ? '<button class="prev nav" type="button" data-action="previous" aria-label="Previous option"></button>' : ""}
        <button class="label" type="button" aria-label="${ariaLabel}" title="Hold to copy choice, then paste into your AI chat">
          <span class="choice-unit${swapClass}">
            <span class="label-main${copied === "ok" ? " copy-status" : ""}">${title}</span>
            ${comparable && !copied ? counterMarkup("option-count", group) : ""}
          </span>
        </button>
        ${comparable ? '<button class="next nav" type="button" data-action="next" aria-label="Next option"></button>' : ""}`;
  }

  function canvasButton() {
    return `<button class="canvas-enter" type="button" data-action="open-canvas" aria-label="Open Canvas" title="Open Canvas"><span>Canvas</span><span class="canvas-entry-icon" aria-hidden="true">${CANVAS_ICONS.frames}</span></button>`;
  }

  function canvasRowMarkup() {
    const percent = Math.round(canvasZoom * 100);
    const responsive = canvasResponsiveMarkup();
    return `<button class="canvas-zoom nav" type="button" data-action="canvas-zoom-out" aria-label="Zoom out"></button>
      <span class="canvas-zoom-value" aria-label="Canvas zoom ${percent}%">${percent}%</span>
      <button class="canvas-zoom canvas-zoom-in nav" type="button" data-action="canvas-zoom-in" aria-label="Zoom in"></button>
      <button class="canvas-fit" type="button" data-action="canvas-fit" aria-label="Fit Canvas">Fit</button>
      ${responsive ? `<i class="canvas-divider" aria-hidden="true"></i>${responsive}` : ""}
      ${canvasThemeMarkup()}
      <i class="canvas-divider" aria-hidden="true"></i>
      <button class="canvas-close nav" type="button" data-action="close-canvas" aria-label="Back to page" title="Back to page">${CANVAS_ICONS.backToPage}</button>`;
  }

  function canvasResponsiveMarkup() {
    if (!groups.some((group) => group.canvasLayout === "matrix")) return "";
    const responsive = canvasVisibleWidths.size > 1;
    const action = responsive ? "Show desktop-only previews" : "Show responsive previews";
    return `<button class="canvas-state-toggle canvas-responsive-toggle" type="button" data-action="canvas-responsive" aria-label="${action}" aria-pressed="${responsive}" title="${action}">
      <span class="canvas-state-icon canvas-state-primary">${CANVAS_ICONS.desktop}</span>
      <span class="canvas-state-icon canvas-state-secondary">${CANVAS_ICONS.responsive}</span>
    </button>`;
  }

  function canvasThemeMarkup() {
    const dark = canvasTheme === "dark";
    const action = dark ? "Use light Canvas theme" : "Use dark Canvas theme";
    return `<button class="canvas-state-toggle canvas-theme-toggle" type="button" data-action="canvas-theme" aria-label="${action}" aria-pressed="${dark}" title="${action}">
      <span class="canvas-state-icon canvas-state-primary">${CANVAS_ICONS.sun}</span>
      <span class="canvas-state-icon canvas-state-secondary">${CANVAS_ICONS.moon}</span>
    </button>`;
  }

  function openCanvas() {
    if (canvasOpen || canvasPreparing || !groups.length) return;
    clearTimeout(canvasCloseTimer);
    clearTimeout(canvasCacheTimer);
    if (canvasShell) {
      if (canReuseCanvas()) {
        reopenCanvas();
        return;
      }
      disposeCanvasCache();
    }
    canvasPreparing = true;
    document.addEventListener("wheel", handleCanvasWheel, { passive: false, capture: true });
    minimized = false;
    menuOpen = false;
    canvasKeeps.clear();
    canvasSnapshot = snapshotDocument();
    canvasDirty = false;
    canvasSourceIdentity = canvasIdentity();
    canvasPreviousOverflow = document.documentElement.style.overflow;
    canvasShell = buildCanvasShell();
    canvasShell.inert = true;
    canvasShell.setAttribute("aria-hidden", "true");
    root.append(canvasShell);
    setCanvasEntryPreparing(true);
    initCanvasCamera();
    document.addEventListener("keydown", handleCanvasKeydown);
    clearTimeout(canvasRevealTimer);
    canvasRevealTimer = setTimeout(() => revealCanvas(), 1800);
    requestAnimationFrame(maybeRevealCanvas);
  }

  function canReuseCanvas() {
    const current = canvasIdentity();
    return !canvasDirty && current.length === canvasSourceIdentity.length && current.every((item, index) => item === canvasSourceIdentity[index]);
  }

  function canvasIdentity() {
    return groups.flatMap((group) => [group.element, group.canvasLayout, ...group.options.map((option) => option.element)]);
  }

  function reopenCanvas() {
    if (!canvasShell || !canvasCamera) return;
    canvasOpen = true;
    document.addEventListener("wheel", handleCanvasWheel, { passive: false, capture: true });
    canvasPreviousOverflow = document.documentElement.style.overflow;
    pauseObserver(() => { document.documentElement.style.overflow = "hidden"; });
    canvasShell.classList.remove("leaving");
    canvasShell.inert = false;
    canvasShell.setAttribute("aria-hidden", "false");
    canvasDockEntering = true;
    renderedSignature = "";
    render();
    canvasDockEntering = false;
    document.addEventListener("keydown", handleCanvasKeydown);
    requestAnimationFrame(() => {
      canvasShell?.classList.add("visible", "content-visible");
      root?.querySelector(".canvas-close")?.focus({ preventScroll: true });
    });
  }

  function setCanvasEntryPreparing(preparing) {
    clearTimeout(canvasEntryTimer);
    const button = root?.querySelector('[data-action="open-canvas"]');
    if (!button) return;
    button.classList.toggle("preparing", preparing);
    button.toggleAttribute("aria-busy", preparing);
    button.setAttribute("aria-disabled", String(preparing));
    button.setAttribute("aria-label", preparing ? "Preparing Canvas" : "Open Canvas");
    const icon = button.querySelector(".canvas-entry-icon");
    if (!icon) return;
    if (preparing) {
      canvasEntryTimer = setTimeout(() => {
        if (canvasPreparing && button.isConnected) icon.innerHTML = '<span class="canvas-spinner"></span>';
      }, 200);
    } else {
      icon.innerHTML = CANVAS_ICONS.frames;
    }
  }

  function maybeRevealCanvas() {
    if (!canvasPreparing || !canvasShell) return;
    const frames = Array.from(canvasShell.querySelectorAll(".canvas-frame:not(.viewport-hidden)"));
    if (frames.length && frames.every((frame) => frame.classList.contains("ready") || frame.classList.contains("failed"))) revealCanvas();
  }

  function revealCanvas() {
    if (!canvasPreparing || !canvasShell) return;
    clearTimeout(canvasRevealTimer);
    canvasPreparing = false;
    setCanvasEntryPreparing(false);
    canvasOpen = true;
    pauseObserver(() => { document.documentElement.style.overflow = "hidden"; });
    fitCanvas({ animate: false });
    canvasDockEntering = true;
    renderedSignature = "";
    render();
    canvasDockEntering = false;
    canvasShell.inert = false;
    canvasShell.setAttribute("aria-hidden", "false");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => {
      canvasShell?.classList.add("visible");
      clearTimeout(canvasContentTimer);
      canvasContentTimer = setTimeout(() => {
        canvasShell?.classList.add("content-visible");
        root?.querySelector(".canvas-close")?.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 70);
    });
  }

  function closeCanvas({ renderAfter = true } = {}) {
    if (!canvasOpen && !canvasShell) return;
    const wasPreparing = canvasPreparing;
    canvasOpen = false;
    canvasPreparing = false;
    setCanvasEntryPreparing(false);
    clearTimeout(canvasRevealTimer);
    clearTimeout(canvasContentTimer);
    clearTimeout(canvasCacheTimer);
    clearTimeout(canvasFrameHideTimer);
    canvasFrameTarget = null;
    canvasCursor = null;
    stopCanvasZoomAnimation();
    stopCanvasPinch();
    clearTimeout(canvasWheelModeTimer);
    canvasWheelMode = null;
    canvasPanGesture = null;
    const closingShell = canvasShell;
    const wasVisible = closingShell?.classList.contains("visible");
    closingShell?.classList.remove("content-visible");
    closingShell?.classList.remove("visible");
    closingShell?.classList.add("leaving");
    if (closingShell) closingShell.inert = true;
    closingShell?.setAttribute("aria-hidden", "true");
    pauseObserver(() => { document.documentElement.style.overflow = canvasPreviousOverflow; });
    document.removeEventListener("keydown", handleCanvasKeydown);
    document.removeEventListener("wheel", handleCanvasWheel, true);
    renderedSignature = "";
    if (renderAfter && root) {
      render();
    }
    const finish = () => {
      if (canvasShell === closingShell) {
        closingShell?.classList.remove("leaving");
        if (!renderAfter || wasPreparing || !wasVisible) disposeCanvasCache();
        else canvasCacheTimer = setTimeout(() => {
          if (!canvasOpen && !canvasPreparing) disposeCanvasCache();
        }, CANVAS_CACHE_MS);
      }
      if (renderAfter) root?.querySelector('[data-action="open-canvas"]')?.focus({ preventScroll: true });
    };
    clearTimeout(canvasCloseTimer);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!renderAfter || reduceMotion || !wasVisible) finish();
    else canvasCloseTimer = setTimeout(finish, 140);
  }

  function disposeCanvasCache() {
    clearTimeout(canvasCacheTimer);
    clearTimeout(canvasCloseTimer);
    stopCanvasZoomAnimation();
    stopCanvasPinch();
    canvasCamera = null;
    canvasShell?.remove();
    canvasShell = null;
    canvasSnapshot = "";
    canvasSourceIdentity = [];
  }

  function snapshotDocument() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll("script,[data-unship-toolbar]").forEach((node) => node.remove());
    const base = clone.ownerDocument.createElement("base");
    base.href = location.href;
    clone.querySelector("head")?.prepend(base);
    return `<!doctype html>${clone.outerHTML}`;
  }

  function buildCanvasShell() {
    const shell = document.createElement("div");
    shell.className = "canvas-shell";
    shell.dataset.theme = canvasTheme;
    shell.innerHTML = `<div class="canvas-viewport" tabindex="-1"><div class="canvas-world"></div></div>
      <div class="canvas-frame-toolbar" role="toolbar" aria-label="Canvas Frame actions" aria-hidden="true" inert>
        <span class="canvas-option-name"></span>
        <span class="canvas-frame-width"></span>
        <button class="canvas-keep" type="button" data-action="canvas-keep" title="Hold or press Enter to copy this choice, then paste into your AI chat">Hold to copy choice</button>
      </div>`;
    const world = shell.querySelector(".canvas-world");

    for (const group of groups) {
      const section = document.createElement("section");
      section.className = `canvas-group canvas-${group.canvasLayout}`;
      section.dataset.group = String(group.index);
      section.innerHTML = `<h2 class="canvas-group-name">${escapeHtml(group.displayLabel)}</h2><div class="canvas-options"></div>`;
      const optionsNode = section.querySelector(".canvas-options");
      const naturalWidth = canvasNaturalWidth(group);

      group.options.forEach((option) => {
        const optionRow = document.createElement("div");
        optionRow.className = "canvas-option-row";
        optionRow.dataset.option = String(option.index);
        const widths = group.canvasLayout === "matrix" ? MATRIX_WIDTHS : [naturalWidth];
        widths.forEach((width) => optionRow.append(buildCanvasFrame(group, option, width)));
        optionsNode.append(optionRow);
      });
      world.append(section);
    }
    return shell;
  }

  function canvasNaturalWidth(group) {
    const rect = group.element.getBoundingClientRect();
    const optionRect = group.options[group.activeOptionIndex]?.element.getBoundingClientRect();
    const measured = Math.round(group.canvasLayout === "grid" ? optionRect?.width : rect.width) || Math.round(rect.width) || window.innerWidth;
    // ponytail: grid favors a readable component preview; add an explicit
    // width hint only if real use shows this cap is too blunt.
    return group.canvasLayout === "grid" ? Math.min(560, Math.max(280, measured)) : Math.min(1440, Math.max(320, measured));
  }

  function buildCanvasFrame(group, option, width) {
    const frame = document.createElement("article");
    frame.className = "canvas-frame";
    frame.dataset.group = String(group.index);
    frame.dataset.option = String(option.index);
    frame.dataset.width = String(width);
    if (group.canvasLayout === "matrix" && !canvasVisibleWidths.has(width)) {
      frame.classList.add("viewport-hidden");
      frame.setAttribute("aria-hidden", "true");
    }
    frame.style.width = `${width}px`;
    frame.tabIndex = 0;
    frame.setAttribute("aria-label", `${group.displayLabel}: ${option.label} at ${width} pixels. Press Enter to copy this choice, then paste into your AI chat`);
    const iframe = document.createElement("iframe");
    iframe.className = "canvas-iframe";
    iframe.title = `${group.displayLabel}: ${option.label} at ${width} pixels`;
    iframe.width = String(width);
    iframe.tabIndex = -1;
    iframe.dataset.group = String(group.index);
    iframe.dataset.option = String(option.index);
    iframe.setAttribute("sandbox", "allow-same-origin");
    iframe.setAttribute("scrolling", "no");
    iframe.addEventListener("load", () => prepareCanvasFrame(iframe));
    iframe.srcdoc = canvasSnapshot;
    frame.append(iframe);
    return frame;
  }

  function prepareCanvasFrame(iframe) {
    const doc = iframe.contentDocument;
    const view = iframe.contentWindow;
    if (!doc || !view) return;
    const group = doc.querySelectorAll(GROUP_SELECTOR)[groups[Number(iframe.dataset.group)]?.sourceIndex];
    const options = group ? Array.from(group.children).filter((child) => child.hasAttribute(OPTION_ATTR)) : [];
    const option = options[Number(iframe.dataset.option)];
    const sourceOption = groups[Number(iframe.dataset.group)]?.options[Number(iframe.dataset.option)]?.element;
    if (!group || !option) {
      iframe.closest(".canvas-frame")?.classList.add("failed");
      maybeRevealCanvas();
      return;
    }

    options.forEach((candidate) => {
      candidate.hidden = candidate !== option;
      if (candidate === option) {
        const originalDisplay = sourceOption ? originalDisplayByOption.get(sourceOption) : "";
        if (originalDisplay) candidate.style.display = originalDisplay;
        else candidate.style.removeProperty("display");
      }
      else candidate.style.setProperty("display", "none", "important");
    });
    let current = group;
    while (current?.parentElement && current !== doc.body) {
      Array.from(current.parentElement.children).forEach((sibling) => {
        if (sibling !== current) sibling.style.setProperty("opacity", "0", "important");
      });
      current = current.parentElement;
    }
    doc.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    doc.documentElement.style.setProperty("overflow", "hidden", "important");
    doc.documentElement.style.setProperty("background", "transparent", "important");
    doc.body.style.setProperty("background", "transparent", "important");
    option.querySelectorAll("img").forEach((image) => { image.loading = "eager"; });

    let assetsReady = false;
    const measure = () => {
      doc.body.style.transform = "none";
      const rect = group.getBoundingClientRect();
      doc.body.style.transformOrigin = "0 0";
      doc.body.style.transform = `translate(${-rect.left}px,${-rect.top}px)`;
      const height = Math.max(48, Math.ceil(rect.height));
      const nextHeight = `${height}px`;
      if (iframe.style.height !== nextHeight) iframe.style.height = nextHeight;
      view.scrollTo({ left: 0, top: 0, behavior: "auto" });
      const frame = iframe.closest(".canvas-frame");
      const wasReady = frame?.classList.contains("ready");
      if (assetsReady) frame?.classList.add("ready");
      if (assetsReady && !wasReady) maybeRevealCanvas();
      if (canvasOpen) requestAnimationFrame(updateCanvasZoomLabel);
    };
    iframe.__unshipMeasure = measure;
    requestAnimationFrame(() => requestAnimationFrame(measure));
    const images = Array.from(option.querySelectorAll("img"));
    Promise.allSettled([doc.fonts?.ready, ...images.map((image) => image.decode?.())]).then(() => {
      assetsReady = true;
      requestAnimationFrame(() => requestAnimationFrame(measure));
    });
  }

  function toggleCanvasResponsive() {
    const responsive = canvasVisibleWidths.size === 1;
    const button = root?.querySelector(".canvas-responsive-toggle");
    const action = responsive ? "Show desktop-only previews" : "Show responsive previews";
    const revealedFrames = [];
    const anchor = canvasShell?.querySelector(`.canvas-matrix .canvas-frame[data-width="${MATRIX_WIDTHS[0]}"]:not(.viewport-hidden)`)
      || canvasShell?.querySelector(".canvas-frame:not(.viewport-hidden)");
    const anchorBefore = anchor?.getBoundingClientRect();
    canvasVisibleWidths.clear();
    canvasVisibleWidths.add(MATRIX_WIDTHS[0]);
    if (responsive) MATRIX_WIDTHS.slice(1).forEach((width) => canvasVisibleWidths.add(width));
    if (button) {
      button.setAttribute("aria-pressed", String(responsive));
      button.setAttribute("aria-label", action);
      button.title = action;
    }
    canvasShell?.querySelectorAll(".canvas-matrix .canvas-frame").forEach((frame) => {
      const visible = canvasVisibleWidths.has(Number(frame.dataset.width));
      const wasHidden = frame.classList.contains("viewport-hidden");
      frame.classList.toggle("viewport-hidden", !visible);
      frame.setAttribute("aria-hidden", String(!visible));
      if (visible && wasHidden) revealedFrames.push(frame);
    });
    const world = canvasShell?.querySelector(".canvas-world");
    if (anchor && anchorBefore && canvasCamera && world) {
      const anchorAfter = anchor.getBoundingClientRect();
      const scale = canvasCamera.scale;
      const pan = canvasCamera;
      const next = constrainCanvasPan(
        pan.x + (anchorBefore.left - anchorAfter.left) / scale,
        pan.y + (anchorBefore.top - anchorAfter.top) / scale,
        scale
      );
      setCanvasTransform(next.x, next.y);
    }
    hideCanvasFrameToolbar();
    requestAnimationFrame(() => {
      revealedFrames.forEach((frame) => frame.querySelector(".canvas-iframe")?.__unshipMeasure?.());
    });
  }

  function activateCanvasOption(groupIndex, optionIndex) {
    const group = groups[groupIndex];
    if (!group?.options[optionIndex]) return null;
    activeGroupIndex = groupIndex;
    group.activeOptionIndex = optionIndex;
    applyGroupVisibility(group);
    persistSelection(group);
    return group;
  }

  function keepCanvasOption(groupIndex, optionIndex) {
    const group = activateCanvasOption(groupIndex, optionIndex);
    if (!group) return;
    const instruction = keepInstruction(group);
    const shell = canvasShell;
    // Serialize clipboard writes and capture the deliberate choice now.
    // Later navigation must not change a previous Keep action.
    canvasKeepQueue = canvasKeepQueue.then(async () => {
      if (shell !== canvasShell || !canvasOpen) return;
      const choices = new Map(canvasKeeps).set(groupIndex, instruction);
      const text = Array.from(choices).sort(([a], [b]) => a - b).map(([, value]) => value).join(" ");
      const ok = await copyText(text);
      if (shell !== canvasShell) return;
      if (ok) {
        canvasKeeps.set(groupIndex, instruction);
        shell.querySelectorAll(`.canvas-frame[data-group="${groupIndex}"]`).forEach((frame) => frame.classList.toggle("kept", Number(frame.dataset.option) === optionIndex));
      }
      if (canvasFrameTarget) {
        const failedTarget = !ok && Number(canvasFrameTarget.dataset.group) === groupIndex && Number(canvasFrameTarget.dataset.option) === optionIndex;
        showCanvasFrameToolbar(canvasFrameTarget, failedTarget);
      }
      liveRegion.textContent = ok ? `Copied ${canvasKeeps.size} ${canvasKeeps.size === 1 ? "choice" : "choices"}. Paste into your AI chat to apply` : "Copy failed";
    });
    return canvasKeepQueue;
  }

  function initCanvasCamera() {
    const viewport = canvasShell?.querySelector(".canvas-viewport");
    const world = canvasShell?.querySelector(".canvas-world");
    const toolbar = canvasShell?.querySelector(".canvas-frame-toolbar");
    if (!viewport || !world || !toolbar) return;

    canvasCamera = { x: 0, y: 0, scale: 1 };
    viewport.addEventListener("pointerover", handleCanvasFramePointerOver);
    viewport.addEventListener("pointerout", handleCanvasFramePointerOut);
    viewport.addEventListener("focusin", handleCanvasFramePointerOver);
    viewport.addEventListener("focusout", handleCanvasFramePointerOut);
    viewport.addEventListener("pointerdown", handleCanvasPanStart);
    viewport.addEventListener("pointermove", handleCanvasPanMove);
    viewport.addEventListener("pointerup", handleCanvasPanEnd);
    viewport.addEventListener("pointercancel", handleCanvasPanEnd);
    toolbar.addEventListener("pointerenter", () => clearTimeout(canvasFrameHideTimer));
    toolbar.addEventListener("pointerleave", scheduleCanvasFrameToolbarHide);
  }

  function setCanvasTransform(x, y, scale = canvasCamera.scale, animate = false) {
    const world = canvasShell?.querySelector(".canvas-world");
    if (!world) return;
    canvasCamera = { x, y, scale };
    world.style.transition = animate ? "transform 180ms ease-in-out" : "none";
    world.style.transform = `scale(${scale}) translate(${x}px, ${y}px)`;
    const originX = (world?.offsetWidth || 0) / 2;
    const originY = (world?.offsetHeight || 0) / 2;
    canvasZoom = scale;
    canvasShell?.style.setProperty("--canvas-grid-size", `${Math.max(12, 24 * scale)}px`);
    canvasShell?.style.setProperty("--canvas-grid-x", `${(1 - scale) * originX + x * scale}px`);
    canvasShell?.style.setProperty("--canvas-grid-y", `${(1 - scale) * originY + y * scale}px`);
    updateCanvasZoomLabel();
    positionCanvasFrameToolbar();
  }

  function handleCanvasFramePointerOver(event) {
    const frame = event.target.closest?.(".canvas-frame");
    if (!frame || frame === canvasFrameTarget) return;
    showCanvasFrameToolbar(frame);
  }

  function handleCanvasFramePointerOut(event) {
    const frame = event.target.closest?.(".canvas-frame");
    if (!frame || frame.contains(event.relatedTarget)) return;
    scheduleCanvasFrameToolbarHide();
  }

  function showCanvasFrameToolbar(frame, copyFailed = false) {
    clearTimeout(canvasFrameHideTimer);
    canvasFrameTarget = frame;
    const toolbar = canvasShell?.querySelector(".canvas-frame-toolbar");
    if (!toolbar) return;
    const group = groups[Number(frame.dataset.group)];
    const option = group?.options[Number(frame.dataset.option)];
    if (!group || !option) return;
    toolbar.querySelector(".canvas-option-name").textContent = option.label;
    toolbar.querySelector(".canvas-frame-width").textContent = `${frame.dataset.width}px`;
    toolbar.querySelectorAll("button").forEach((button) => {
      button.dataset.group = frame.dataset.group;
      button.dataset.option = frame.dataset.option;
    });
    toolbar.querySelector(".canvas-keep").textContent = copyFailed
      ? "Couldn't copy. Try again"
      : frame.classList.contains("kept") ? "Copied — paste into your AI chat" : "Hold to copy choice";
    toolbar.inert = false;
    toolbar.setAttribute("aria-hidden", "false");
    toolbar.classList.add("visible");
    positionCanvasFrameToolbar();
  }

  function positionCanvasFrameToolbar() {
    const toolbar = canvasShell?.querySelector(".canvas-frame-toolbar");
    if (!toolbar?.classList.contains("visible") || !canvasFrameTarget?.isConnected) return;
    const frameRect = canvasFrameTarget.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const left = Math.min(window.innerWidth - toolbarRect.width / 2 - 12, Math.max(toolbarRect.width / 2 + 12, frameRect.left + frameRect.width / 2));
    const above = frameRect.top - toolbarRect.height - 10;
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${above >= 12 ? above : Math.min(window.innerHeight - toolbarRect.height - 12, frameRect.bottom + 10)}px`;
  }

  function scheduleCanvasFrameToolbarHide() {
    clearTimeout(canvasFrameHideTimer);
    canvasFrameHideTimer = setTimeout(hideCanvasFrameToolbar, 100);
  }

  function hideCanvasFrameToolbar() {
    clearTimeout(canvasFrameHideTimer);
    canvasFrameTarget = null;
    const toolbar = canvasShell?.querySelector(".canvas-frame-toolbar");
    if (!toolbar) return;
    toolbar.classList.remove("visible");
    toolbar.inert = true;
    toolbar.setAttribute("aria-hidden", "true");
  }

  function canvasFocalPoint() {
    const viewport = canvasShell?.querySelector(".canvas-viewport");
    if (canvasCursor || !viewport) return canvasCursor;
    const rect = viewport.getBoundingClientRect();
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }

  function setCanvasZoom(next, { focal = canvasFocalPoint() } = {}) {
    if (!canvasCamera || !focal) return;
    stopCanvasPinch();
    const scale = Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, Math.round(next * 20) / 20));
    smoothCanvasZoom(scale, focal);
  }

  function stepCanvasZoom(direction) {
    setCanvasZoom(canvasRequestedScale() + CANVAS_ZOOM_MOTION.step * Math.sign(direction));
  }

  function canvasRequestedScale() {
    return canvasZoomAnimation?.targetScale ?? canvasCamera?.scale ?? canvasZoom;
  }

  function smoothCanvasZoom(next, focal) {
    if (!canvasCamera) return;
    const targetScale = Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, next));
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      stopCanvasZoomAnimation();
      applyCanvasFocalScale(targetScale, focal);
      return;
    }
    const startScale = canvasCamera.scale;
    if (Math.abs(targetScale - startScale) < 0.0005) return;
    stopCanvasZoomAnimation();
    canvasZoomAnimation = { targetScale, startScale, focal, frame: 0, startTime: performance.now() };
    const tick = (now) => {
      if (!canvasCamera || !canvasZoomAnimation) return;
      const progress = Math.min(1, (now - canvasZoomAnimation.startTime) / CANVAS_ZOOM_MOTION.duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const scale = canvasZoomAnimation.startScale + (canvasZoomAnimation.targetScale - canvasZoomAnimation.startScale) * eased;
      applyCanvasFocalScale(scale, canvasZoomAnimation.focal);
      if (progress >= 1) {
        canvasZoomAnimation = null;
      }
      else canvasZoomAnimation.frame = requestAnimationFrame(tick);
    };
    canvasZoomAnimation.frame = requestAnimationFrame(tick);
  }

  function stopCanvasZoomAnimation() {
    if (!canvasZoomAnimation) return;
    cancelAnimationFrame(canvasZoomAnimation.frame);
    canvasZoomAnimation = null;
  }

  function queueCanvasPinch(delta, focal) {
    canvasPinchDelta += delta;
    canvasPinchFocal = focal;
    if (canvasPinchFrame) return;
    canvasPinchFrame = requestAnimationFrame(() => {
      canvasPinchFrame = 0;
      if (!canvasCamera || !canvasPinchFocal) return;
      const { pinch } = CANVAS_ZOOM_MOTION;
      const frameDelta = Math.min(36, Math.max(-36, canvasPinchDelta * pinch));
      const scale = canvasCamera.scale;
      const factor = Math.pow(2, -frameDelta / 300);
      const next = Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, scale * factor));
      canvasPinchDelta = 0;
      applyCanvasFocalScale(next, canvasPinchFocal);
    });
  }

  function applyCanvasFocalScale(nextScale, focal) {
    const viewport = canvasShell?.querySelector(".canvas-viewport");
    const world = canvasShell?.querySelector(".canvas-world");
    if (!viewport || !world || !canvasCamera) return;
    const rect = viewport.getBoundingClientRect();
    const scale = canvasCamera.scale;
    const currentPan = canvasCamera;
    const originX = world.offsetWidth / 2;
    const originY = world.offsetHeight / 2;
    const screenX = focal.clientX - rect.left;
    const screenY = focal.clientY - rect.top;
    const worldX = (screenX - originX) / scale - currentPan.x + originX;
    const worldY = (screenY - originY) / scale - currentPan.y + originY;
    const x = (screenX - originX) / nextScale - worldX + originX;
    const y = (screenY - originY) / nextScale - worldY + originY;
    const boundedPan = constrainCanvasPan(x, y, nextScale);
    setCanvasTransform(boundedPan.x, boundedPan.y, nextScale);
  }

  function stopCanvasPinch() {
    cancelAnimationFrame(canvasPinchFrame);
    canvasPinchFrame = 0;
    canvasPinchDelta = 0;
    canvasPinchFocal = null;
  }

  function constrainCanvasPan(x, y, scale) {
    const viewport = canvasShell?.querySelector(".canvas-viewport");
    const world = canvasShell?.querySelector(".canvas-world");
    if (!viewport || !world) return { x, y };
    const width = world.offsetWidth;
    const height = world.offsetHeight;
    const screenWidth = width * scale;
    const screenHeight = height * scale;
    const screenLeft = (1 - scale) * width / 2 + x * scale;
    const screenTop = (1 - scale) * height / 2 + y * scale;
    const horizontalSlack = Math.min(360, Math.max(180, viewport.clientWidth * 0.28));
    const topSlack = Math.min(280, Math.max(140, viewport.clientHeight * 0.2));
    const bottomSlack = Math.min(420, Math.max(220, viewport.clientHeight * 0.3));
    const minLeft = screenWidth <= viewport.clientWidth ? -horizontalSlack : viewport.clientWidth - screenWidth - horizontalSlack;
    const maxLeft = screenWidth <= viewport.clientWidth ? viewport.clientWidth - screenWidth + horizontalSlack : horizontalSlack;
    const minTop = screenHeight <= viewport.clientHeight ? -topSlack : viewport.clientHeight - screenHeight - bottomSlack;
    const maxTop = screenHeight <= viewport.clientHeight ? viewport.clientHeight - screenHeight + bottomSlack : topSlack;
    const left = Math.min(maxLeft, Math.max(minLeft, screenLeft));
    const top = Math.min(maxTop, Math.max(minTop, screenTop));
    return {
      x: (left - (1 - scale) * width / 2) / scale,
      y: (top - (1 - scale) * height / 2) / scale
    };
  }

  function keepCanvasInBounds() {
    if (!canvasCamera) return;
    const scale = canvasCamera.scale;
    const current = canvasCamera;
    const pan = constrainCanvasPan(current.x, current.y, scale);
    if (Math.abs(pan.x - current.x) < 0.1 && Math.abs(pan.y - current.y) < 0.1) return;
    setCanvasTransform(pan.x, pan.y);
  }

  function handleCanvasPanStart(event) {
    const viewport = canvasShell?.querySelector(".canvas-viewport");
    if (!viewport || !canvasCamera || event.button !== 0) return;
    stopCanvasZoomAnimation();
    stopCanvasPinch();
    canvasPanGesture = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      pan: canvasCamera,
      scale: canvasCamera.scale
    };
    viewport.setPointerCapture?.(event.pointerId);
    viewport.classList.add("panning");
    hideCanvasFrameToolbar();
    event.preventDefault();
  }

  function handleCanvasPanMove(event) {
    canvasCursor = { clientX: event.clientX, clientY: event.clientY };
    if (!canvasPanGesture || canvasPanGesture.pointerId !== event.pointerId || !canvasCamera) return;
    const x = canvasPanGesture.pan.x + (event.clientX - canvasPanGesture.clientX) / canvasPanGesture.scale;
    const y = canvasPanGesture.pan.y + (event.clientY - canvasPanGesture.clientY) / canvasPanGesture.scale;
    const pan = constrainCanvasPan(x, y, canvasPanGesture.scale);
    setCanvasTransform(pan.x, pan.y);
    event.preventDefault();
  }

  function handleCanvasPanEnd(event) {
    if (!canvasPanGesture || canvasPanGesture.pointerId !== event.pointerId) return;
    const viewport = canvasShell?.querySelector(".canvas-viewport");
    if (viewport?.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    viewport?.classList.remove("panning");
    canvasPanGesture = null;
  }

  function fitCanvas({ animate = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches } = {}) {
    const viewport = canvasShell?.querySelector(".canvas-viewport");
    const world = canvasShell?.querySelector(".canvas-world");
    if (!viewport || !world || !canvasCamera) return;
    const width = world.scrollWidth || world.offsetWidth;
    const height = world.scrollHeight || world.offsetHeight;
    const scale = Math.min(1, Math.max(CANVAS_MIN_ZOOM, Math.min((viewport.clientWidth - 96) / Math.max(1, width), (viewport.clientHeight - 176) / Math.max(1, height))));
    const desiredTop = Math.max(32, (viewport.clientHeight - height * scale) / 2);
    const x = (viewport.clientWidth - width) / 2 / scale;
    const y = (desiredTop - (1 - scale) * height / 2) / scale;
    stopCanvasZoomAnimation();
    stopCanvasPinch();
    setCanvasTransform(x, y, scale, animate);
  }

  function updateCanvasZoomLabel() {
    const label = root?.querySelector(".canvas-zoom-value");
    if (label) {
      const percent = Math.round(canvasZoom * 100);
      label.textContent = `${percent}%`;
      label.setAttribute("aria-label", `Canvas zoom ${percent}%`);
    }
  }

  function toggleCanvasTheme() {
    canvasTheme = canvasTheme === "light" ? "dark" : "light";
    if (canvasShell) canvasShell.dataset.theme = canvasTheme;
    const button = root?.querySelector('[data-action="canvas-theme"]');
    if (button) {
      const dark = canvasTheme === "dark";
      const action = dark ? "Use light Canvas theme" : "Use dark Canvas theme";
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", action);
      button.title = action;
    }
    renderedSignature = renderSignature("canvas");
  }

  function handleCanvasKeydown(event) {
    if (event.defaultPrevented || (!canvasOpen && !canvasPreparing) || isTypingTarget(event.composedPath?.()[0] || event.target)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeCanvas();
    }
  }

  function handleCanvasWheel(event) {
    if (!canvasOpen && !canvasPreparing) return;
    const target = event.composedPath()[0] || event.target;
    if (!event.ctrlKey && !target.closest?.(".canvas-viewport")) return;
    // Claim pinch from the entry click, before prepared previews take pointer input.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!canvasOpen || !canvasCamera) return;
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * window.innerHeight : event.deltaY;
    const focal = { clientX: event.clientX, clientY: event.clientY };
    canvasCursor = focal;
    if (event.ctrlKey) {
      stopCanvasZoomAnimation();
      // A pinch is a continuous gesture, so it must never inherit the
      // transition used by button/fit zooms. Clear it synchronously before
      // Chrome can deliver the next event in the same compositor frame.
      queueCanvasPinch(delta, focal);
      return;
    }
    const likelyTrackpad = event.deltaMode === 0 && (Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) < 80);
    const mode = canvasWheelMode === "pan" || likelyTrackpad ? "pan" : "zoom";
    if (mode === "pan") {
      canvasWheelMode = "pan";
      clearTimeout(canvasWheelModeTimer);
      canvasWheelModeTimer = setTimeout(() => { canvasWheelMode = null; }, 180);
      stopCanvasZoomAnimation();
      stopCanvasPinch();
      const scale = canvasCamera.scale;
      const pan = canvasCamera;
      const next = constrainCanvasPan(pan.x - event.deltaX / scale, pan.y - event.deltaY / scale, scale);
      setCanvasTransform(next.x, next.y);
      hideCanvasFrameToolbar();
      return;
    }
    clearTimeout(canvasWheelModeTimer);
    canvasWheelMode = null;
    stopCanvasPinch();
    const strength = Math.min(0.18, Math.max(0.015, Math.abs(delta) * 0.0025));
    const base = canvasZoomAnimation?.targetScale ?? canvasCamera.scale;
    smoothCanvasZoom(base * Math.exp(-Math.sign(delta) * strength), focal);
  }

  function renderPreservingLabelFocus() {
    const restoreLabelFocus = root?.activeElement?.classList?.contains("label");
    render();
    if (restoreLabelFocus) root?.querySelector(".label")?.focus({ preventScroll: true, focusVisible: false });
  }

  function setToolbarHtml(html) {
    Array.from(root.childNodes).forEach((node) => {
      if (node !== styleNode && node !== canvasShell && node !== liveRegion) node.remove();
    });
    if (!styleNode) {
      styleNode = document.createElement("style");
      styleNode.textContent = css();
    }
    if (!styleNode.isConnected) root.append(styleNode);
    if (canvasShell && !canvasShell.isConnected) root.append(canvasShell);
    if (html) {
      const template = document.createElement("template");
      template.innerHTML = html;
      root.append(template.content);
    }
    if (!liveRegion.isConnected) root.append(liveRegion);
  }

  function renderSignature(mode) {
    return JSON.stringify({
      activeGroupIndex,
      menuOpen,
      mode,
      placement,
      minimized,
      copied,
      canvasOpen,
      canvasTheme,
      canvasZoom,
      groups: groups.map((group) => {
        const activeOption = group.options[clamp(group.activeOptionIndex, group.options.length)];
        return {
          displayLabel: group.displayLabel,
          activeOptionIndex: group.activeOptionIndex,
          activeOptionLabel: activeOption?.label,
          optionCount: group.options.length,
          canvasLayout: group.canvasLayout
        };
      })
    });
  }

  function counterMarkup(className, group) {
    return `<span class="${className}"><span class="${className}-current">${group.activeOptionIndex + 1}</span><span class="${className}-slash">/</span><span class="${className}-total">${group.options.length}</span></span>`;
  }

  // The active group stays pinned as the menu header. Other groups live in a
  // separate scroll region so a long list never moves the user's anchor away.
  function menu() {
    const current = groups[activeGroupIndex];
    const items = groups
      .map((group, index) => {
        if (index === activeGroupIndex) return "";
        const option = group.options[clamp(group.activeOptionIndex, group.options.length)];
        return `<button class="menuitem" type="button" role="menuitem" data-action="pick-group" data-index="${index}" aria-label="${escapeHtml(group.displayLabel)}, ${escapeHtml(option.label)}"><span class="menu-name">${escapeHtml(group.displayLabel)}</span><span class="menu-option">${escapeHtml(option.label)}</span></button>`;
      })
      .join("");

    return `<div class="menu" role="menu"><div class="menu-header has-canvas" role="none"><button class="menuitem current" type="button" role="menuitem" aria-current="true" data-action="toggle-menu" aria-haspopup="menu" aria-expanded="${menuOpen}" aria-label="Active group ${escapeHtml(current.displayLabel)}"><span class="menu-name">${escapeHtml(current.displayLabel)}</span><svg class="menu-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/><path d="M6 12h12"/><path d="M6 12h12"/></svg></button>${canvasButton()}</div><div class="menu-list" role="none">${items}</div></div>`;
  }

  function handleMenuWheel(event) {
    if (!menuOpen) return;
    const list = root?.querySelector(".menu-list");
    if (!list || list.scrollHeight <= list.clientHeight) return;
    const before = list.scrollTop;
    list.scrollTop += event.deltaY;
    if (list.scrollTop !== before) {
      event.preventDefault();
    }
  }

  function handleToolbarClick(event) {
    const button = event.target.closest?.("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    if (action === "open-canvas") openCanvas();
    else if (action === "close-canvas") closeCanvas();
    else if (action === "canvas-zoom-out") stepCanvasZoom(-1);
    else if (action === "canvas-zoom-in") stepCanvasZoom(1);
    else if (action === "canvas-fit") fitCanvas();
    else if (action === "canvas-theme") toggleCanvasTheme();
    else if (action === "canvas-responsive") toggleCanvasResponsive();
    else if (action === "canvas-keep") {
      if (button.dataset.held === "true") delete button.dataset.held;
      else keepCanvasOption(Number(button.dataset.group), Number(button.dataset.option));
    }
    else if (action === "previous") navigateOption(-1);
    else if (action === "next") navigateOption(1);
    else if (action === "toggle-menu") {
      if (menuOpen) closeMenu();
      else openMenu();
    } else if (action === "restore") {
      const square = root.querySelector(".minimized");
      if (square && !square.classList.contains("fading")) {
        square.classList.add("fading");
        setTimeout(() => {
          minimized = false;
          render();
          // Reverse box morph: snap to the square's geometry with transitions
          // OFF (preboxed), commit a reflow, then enable transitions and grow
          // to natural size.
          const dock = root.querySelector(".dock");
          if (!dock) return;
          const width = dock.offsetWidth;
          const height = dock.offsetHeight;
          dock.classList.add("preboxed");
          dock.style.width = `${MINI_SIZE_PX}px`;
          dock.style.height = `${MINI_SIZE_PX}px`;
          dock.style.borderRadius = `${MINI_SIZE_PX / 2}px`;
          dock.style.padding = "0px";
          void dock.offsetHeight;
          dock.classList.remove("preboxed");
          dock.classList.add("boxing", "unboxing");
          dock.style.width = `${width}px`;
          dock.style.height = `${height}px`;
          dock.style.borderRadius = "24px";
          dock.style.padding = "";
          // Re-anchor edge snaps on the full dock width so the growing dock
          // slides back to its corner instead of overflowing past the edge.
          syncViewportBounds(width);
          setTimeout(() => {
            dock.classList.remove("boxing", "unboxing");
            dock.style.width = "";
            dock.style.height = "";
            dock.style.borderRadius = "";
          }, 320);
        }, 30);
      } else {
        minimized = false;
        render();
      }
    } else if (action === "pick-group") {
      pickGroup(Number(button.dataset.index));
    }
  }

  function handleToolbarMouseDown(event) {
    if (event.target.closest?.("button")) event.preventDefault();
  }

  function handleToolbarKeydown(event) {
    if (canvasOpen) {
      if (event.key === "Tab") {
        const controls = Array.from(root.querySelectorAll('button,input,[tabindex="0"]')).filter((node) =>
          !node.disabled && !node.closest('[inert],.viewport-hidden') &&
          node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
        const next = wrap(controls.indexOf(root.activeElement) + (event.shiftKey ? -1 : 1), controls.length);
        event.preventDefault();
        controls[next]?.focus({ preventScroll: true });
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeCanvas();
      } else {
        const frame = event.target.closest?.(".canvas-frame");
        if (frame && event.key === "Enter") {
          event.preventDefault();
          keepCanvasOption(Number(frame.dataset.group), Number(frame.dataset.option));
        }
      }
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.closest?.(".label")) {
      // Keyboard parity for the pointer-only label gestures: Enter/Space keeps
      // the current option, Shift+Enter minimizes.
      event.preventDefault();
      if (event.shiftKey) handleLabelDblclick(event);
      else keepCurrent();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigateOption(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      navigateOption(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      navigateGroup(-1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      navigateGroup(1);
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
    if (canvasOpen || event.defaultPrevented || event.composedPath?.().includes(host) || root?.activeElement || isTypingTarget(event.target)) return;

    if (event.key === "ArrowLeft") navigateOption(-1);
    else if (event.key === "ArrowRight") navigateOption(1);
    else if (event.key === "ArrowUp") navigateGroup(-1);
    else if (event.key === "ArrowDown") navigateGroup(1);
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
    // focusVisible:false keeps the programmatic refocus after option switches
    // from painting the keyboard focus ring; Tab focus still shows it.
    setTimeout(() => root?.querySelector(".label")?.focus({ preventScroll: true, focusVisible: false }));
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
    liveRegion.textContent =
      group.options.length > 1
        ? `${group.displayLabel}, ${option.label}, option ${group.activeOptionIndex + 1} of ${group.options.length}`
        : `${group.displayLabel}, ${option.label}`;
  }

  // Copy a ready-to-paste keep instruction for the agent. Only claims success
  // when a copy path actually succeeded; otherwise shows a failure state.
  async function keepCurrent() {
    const group = groups[activeGroupIndex];
    if (!group) return;
    const instruction = keepInstruction(group);
    const ok = await copyText(instruction);
    copied = ok ? "ok" : "fail";
    renderPreservingLabelFocus();
    liveRegion.textContent = ok ? "Copied. Paste into your AI chat to apply" : "Copy failed";
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copied = false;
      renderPreservingLabelFocus();
    }, 4000);
  }

  function keepInstruction(group) {
    const option = group.options[group.activeOptionIndex];
    return `Unship selection: "${option.label}" for "${group.displayLabel}".`;
  }

  function clearCopiedStatus() {
    if (!copied) return;
    copied = false;
    clearTimeout(copiedTimer);
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {}
    }
    const scratch = document.createElement("textarea");
    scratch.value = text;
    document.body.append(scratch);
    scratch.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    scratch.remove();
    return ok;
  }

  // Scroll the page to the active group when switching. window.scrollTo (not
  // scrollIntoView) so an embedded frame never scrolls its parent page; skips
  // hidden groups (e.g. nested inside an inactive option) and groups that are
  // already mostly on screen, so nearby groups do not jitter.
  function scrollToGroup(group) {
    const element = group?.element;
    if (!element?.getBoundingClientRect) return;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const visible = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
    if (visible >= Math.min(rect.height, viewportHeight) * 0.6) return;
    const top = window.scrollY + rect.top - Math.max(24, (viewportHeight - rect.height) / 2);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
  }

  // Double-click the label collapses the dock via a box morph — real
  // width/height/border-radius animate to the minimized button's exact
  // geometry, so the corners stay correct throughout.
  function handleLabelDblclick(event) {
    if (!event.target.closest?.(".label") || minimized) return;
    if (menuOpen || menuCloseTimer) {
      afterMenuClose(() => handleLabelDblclick(event));
      return;
    }
    clearTimeout(holdTimer);
    menuOpen = false;

    const dock = root.querySelector(".dock");
    if (!dock || dock.classList.contains("boxing")) {
      minimized = true;
      render();
      syncViewportBounds(MINI_SIZE_PX);
      return;
    }

    dock.style.width = `${dock.offsetWidth}px`;
    dock.style.height = `${dock.offsetHeight}px`;
    void dock.offsetHeight;
    dock.classList.add("boxing");
    dock.style.width = `${MINI_SIZE_PX}px`;
    dock.style.height = `${MINI_SIZE_PX}px`;
    dock.style.borderRadius = `${MINI_SIZE_PX / 2}px`;
    dock.style.padding = "0px";
    // Re-anchor edge snaps on the minimized geometry so the box morph slides
    // the shrinking dock into the corner instead of leaving it centered on
    // the wide dock's anchor.
    syncViewportBounds(MINI_SIZE_PX);
    setTimeout(() => {
      minimized = true;
      render();
    }, 300);
  }

  // One pointer gesture on the label, three outcomes that cannot overlap:
  // hold still until the fill completes = keep; move 6px first = drag-snap
  // (cancels the hold); release early = nothing (leaves double-click free
  // for minimize).
  function handleLabelPointerDown(event) {
    const canvasKeep = event.target.closest?.(".canvas-keep");
    if (canvasKeep) {
      handleCanvasKeepPointerDown(event, canvasKeep);
      return;
    }
    const label = event.target.closest?.(".label");
    if (event.button !== 0 || event.ctrlKey) return;
    if (!label || gesturePointerId !== null) return;
    const dock = root.querySelector(".dock");
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    holdFired = false;
    gesturePointerId = event.pointerId;

    label.classList.add("holding");
    holdTimer = setTimeout(() => {
      if (dragging) return;
      holdFired = true;
      root.querySelector(".label")?.classList.remove("holding");
      keepCurrent();
    }, HOLD_COMMIT_MS);

    const cleanup = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      clearTimeout(holdTimer);
      removeGhost();
      root.querySelector(".label")?.classList.remove("holding");
      gesturePointerId = null;
      gestureCleanup = null;
    };

    const move = (e) => {
      if (e.pointerId !== gesturePointerId || holdFired) return;
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
        dragging = true;
        clearTimeout(holdTimer);
        label.classList.remove("holding");
        dock?.classList.add("dragging");
        showGhost();
      }
      host.style.setProperty("--unship-left", `${e.clientX}px`);
      if (placement === "top") host.style.setProperty("--unship-top", `${Math.max(8, e.clientY - (dock?.offsetHeight || 40) / 2)}px`);
      else host.style.setProperty("--unship-bottom", `${Math.max(8, window.innerHeight - e.clientY - (dock?.offsetHeight || 40) / 2)}px`);
      moveGhost(e.clientX, e.clientY, dock);
    };

    const up = (e) => {
      if (e.pointerId !== gesturePointerId) return;
      cleanup();
      if (!dragging) return;

      dock?.classList.remove("dragging");
      anchorH = horizontalAnchorFor(e.clientX, window.innerWidth);
      placement = placementFor(e.clientY, window.innerHeight);
      persistToolbarPlacement();
      dock?.classList.add("snapping");
      dock?.classList.toggle("top", placement === "top");
      dock?.classList.toggle("bottom", placement !== "top");
      syncViewportBounds();
      setTimeout(() => root.querySelector(".dock")?.classList.remove("snapping"), 260);
    };

    // A cancelled pointer (touch interrupted, capture lost) aborts the gesture
    // and snaps back to the last committed anchor instead of finishing a drag.
    const cancel = (e) => {
      if (e.pointerId !== gesturePointerId) return;
      cleanup();
      if (dragging) {
        dock?.classList.remove("dragging");
        syncViewportBounds();
      }
    };

    gestureCleanup = cleanup;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
  }

  function handleCanvasKeepPointerDown(event, button) {
    if (event.button !== 0 || gesturePointerId !== null) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    gesturePointerId = pointerId;
    button.classList.add("holding");
    holdTimer = setTimeout(() => {
      button.classList.remove("holding");
      button.dataset.held = "true";
      keepCanvasOption(Number(button.dataset.group), Number(button.dataset.option));
    }, HOLD_COMMIT_MS);
    const cleanup = () => {
      clearTimeout(holdTimer);
      button.classList.remove("holding");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      gesturePointerId = null;
      gestureCleanup = null;
    };
    const move = (next) => {
      if (next.pointerId !== pointerId) return;
      if (Math.hypot(next.clientX - startX, next.clientY - startY) >= 6) cleanup();
    };
    const up = (next) => {
      if (next.pointerId === pointerId) cleanup();
    };
    gestureCleanup = cleanup;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }

  // Snap-zone ghost: while dragging, a dashed outline previews the rest spot
  // of the zone the pointer is in, using the same thresholds and gutters the
  // release handler commits, so the preview and the landing always agree.
  function showGhost() {
    if (ghost) return;
    ghost = document.createElement("div");
    ghost.className = "ghost";
    root.append(ghost);
  }

  function moveGhost(x, y, dock) {
    if (!ghost || !dock) return;
    const width = dock.offsetWidth;
    const height = dock.offsetHeight;
    const { left, top } = ghostRectFor({
      x,
      y,
      width,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });
    ghost.style.width = `${width}px`;
    ghost.style.height = `${height}px`;
    ghost.style.left = `${left}px`;
    ghost.style.top = `${top}px`;
  }

  function removeGhost() {
    ghost?.remove();
    ghost = null;
  }

  function queueRescan(records) {
    if (canvasShell) canvasDirty = true;
    // Text and presentation changes invalidate snapshots without rebuilding
    // the picker; structural and option metadata changes still rescan.
    if (records?.every((record) => record.type === "characterData" ||
      (record.type === "attributes" && ["style", "class", "src", "href"].includes(record.attributeName)))) return;
    if (rescanFrame) return;
    rescanFrame = requestAnimationFrame(() => {
      rescanFrame = 0;
      rescan();
    });
  }

  function pauseObserver(callback) {
    if (!observer) return callback();

    const records = observer.takeRecords();
    if (records.length) queueRescan(records);
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
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-unship-pick", OPTION_ATTR, CANVAS_ATTR, "hidden", "class", "style", "src", "href"]
    });
  }

  // controlWidth lets the minimize/restore morphs anchor on the geometry they
  // are animating toward before it is laid out; viewport listeners pass an
  // Event here, which the isFinite guard ignores.
  function syncViewportBounds(controlWidth) {
    if (!host) return;

    const visualViewport = window.visualViewport;
    const widths = [visualViewport?.width, window.innerWidth, window.outerWidth, window.screen?.width].filter(
      (width) => Number.isFinite(width) && width > 0
    );
    const width = Math.min(...widths);
    const offsetLeft = visualViewport?.offsetLeft || 0;
    // Anchor on whichever control is rendered: the dock or, when minimized,
    // the small circular button — otherwise edge snaps drift on viewport sync.
    const dockWidth =
      (Number.isFinite(controlWidth) ? controlWidth : (root?.querySelector(".dock") || root?.querySelector(".minimized"))?.offsetWidth) || 328;
    const center = anchorCenterFor(anchorH, { offsetLeft, viewportWidth: width, controlWidth: dockWidth });
    const visibleBottom = visualViewport
      ? Math.max(14, window.innerHeight - visualViewport.height - visualViewport.offsetTop + 14)
      : 14;
    const visibleTop = visualViewport ? Math.max(14, visualViewport.offsetTop + 14) : 14;

    host.style.setProperty("--unship-left", `${center}px`);
    host.style.setProperty("--unship-max-width", `${Math.max(240, width - 20)}px`);
    host.style.setProperty("--unship-bottom", `${visibleBottom}px`);
    host.style.setProperty("--unship-top", `${visibleTop}px`);
    if (canvasOpen) requestAnimationFrame(() => {
      keepCanvasInBounds();
      positionCanvasFrameToolbar();
    });
  }

  function horizontalAnchorFor(x, viewportWidth) {
    if (x < viewportWidth / 3) return "left";
    if (x > (viewportWidth * 2) / 3) return "right";
    return "center";
  }

  function placementFor(y, viewportHeight) {
    return y < viewportHeight / 2 ? "top" : "bottom";
  }

  function ghostRectFor({ x, y, width, height, viewportWidth, viewportHeight }) {
    const anchor = horizontalAnchorFor(x, viewportWidth);
    return {
      left:
        anchor === "left" ? 10 :
        anchor === "right" ? viewportWidth - 10 - width :
        (viewportWidth - width) / 2,
      top: placementFor(y, viewportHeight) === "top" ? 14 : viewportHeight - 14 - height
    };
  }

  function anchorCenterFor(anchor, { offsetLeft, viewportWidth, controlWidth }) {
    if (anchor === "left") return offsetLeft + 10 + controlWidth / 2;
    if (anchor === "right") return offsetLeft + viewportWidth - 10 - controlWidth / 2;
    return offsetLeft + viewportWidth / 2;
  }

  function restoreToolbarPlacement() {
    try {
      const saved = JSON.parse(localStorage.getItem(toolbarStorageKey()) || "null");
      if (!saved || typeof saved !== "object") return;
      if (saved.anchorH === "left" || saved.anchorH === "right") anchorH = saved.anchorH;
      else anchorH = null;
      placement = saved.placement === "top" ? "top" : "bottom";
    } catch {}
  }

  function persistToolbarPlacement() {
    try {
      localStorage.setItem(
        toolbarStorageKey(),
        JSON.stringify({
          anchorH: anchorH || "center",
          placement: placement === "top" ? "top" : "bottom"
        })
      );
    } catch {}
  }

  function toolbarStorageKey() {
    return `unship:toolbar:${location.pathname}`;
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

  function css() {
    return `
      .dock{--ease:cubic-bezier(.32,.72,0,1);--dur:.28s;--h:34px;--nav:34px;--r:999px;--gap:6px;--navfs:18px;--fs:12.5px;position:fixed;left:var(--unship-left,50%);bottom:var(--unship-bottom,max(14px,env(safe-area-inset-bottom)));transform:translateX(-50%);z-index:2147483647;box-sizing:border-box;width:min(328px,var(--unship-max-width,calc(100vw - 20px)));max-width:calc(100vw - 20px);display:block;padding:var(--gap);border-radius:24px;background:#000;color:#fff;font:500 var(--fs)/1.2 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:-.02em}
      .dock.top{top:var(--unship-top,max(14px,env(safe-area-inset-top)));bottom:auto}
      button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
      button:focus-visible{outline:0;background:rgba(255,255,255,.12)}
      .option-count{display:inline-flex;align-items:baseline}
      .option-count-current{display:inline-block;min-width:1ch;text-align:right}
      .menu{display:block;margin-bottom:var(--gap);transition:margin-bottom var(--dur) var(--ease)}
      .dock.open>.menu{margin-bottom:0}
      .menu-list{display:block;position:relative;height:0;margin-top:0;overflow-y:auto;overscroll-behavior:contain;opacity:0;visibility:hidden;scrollbar-width:none;transition:height var(--dur) var(--ease),margin-top var(--dur) var(--ease),opacity .12s ease,visibility 0s linear var(--dur)}
      .open .menu-list{height:var(--menu-list-height,0px);margin-top:var(--gap);opacity:1;visibility:visible;transition:height var(--dur) var(--ease),margin-top var(--dur) var(--ease),opacity .16s ease .04s,visibility 0s}
      .menu-list::-webkit-scrollbar{display:none}
      .menuitem{display:flex;align-items:center;gap:.8em;width:100%;min-height:var(--h);max-height:var(--h);margin-top:var(--gap);padding:0 .85em 0 .95em;border-radius:var(--r);text-align:left;overflow:hidden;transition:background var(--dur) var(--ease),color var(--dur) var(--ease)}
      .menuitem:first-child{margin-top:0}
      .menuitem:hover{background:rgba(255,255,255,.12)}
      .dock:not(.open) .menuitem.current{margin-top:0;background:rgba(255,255,255,.12)}
      .dock:not(.open) .menuitem.current:hover{background:rgba(255,255,255,.17)}
      .open .menuitem.current{background:#f5f5f5;color:#000}
      .menu-header{display:flex;gap:4px;align-items:center}
      .menu-header .menuitem.current{flex:1;min-width:0;padding:0 12px;font-size:11px;font-weight:450}
      .menu-header.has-canvas .menuitem.current{border-radius:20px 9px 9px 20px}
      .menu-header .canvas-enter{display:flex;gap:10px;width:90px;min-width:90px;margin:0;padding:0 12px;font-size:11px;font-weight:450;justify-content:space-between;border-radius:9px 20px 20px 9px}
      .menu-header.full-canvas .canvas-enter{width:100%;min-width:0;flex:1;border-radius:999px}
      .menu-header .menu-name{font-size:inherit;font-weight:inherit}
      .menu-name{font-size:11.5px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .menu-caret{opacity:.5;width:18px;height:18px;min-width:18px;margin-left:auto;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round}
      .menu-caret path{transform-origin:12px 12px;transition:transform var(--dur) var(--ease),opacity .18s ease}
      .menu-caret path:first-child{transform:translateY(-5px)}
      .menu-caret path:last-child{transform:translateY(5px)}
      .open .menu-caret path:first-child{transform:rotate(45deg)}
      .open .menu-caret path:nth-child(2){transform:scaleX(.2);opacity:0}
      .open .menu-caret path:last-child{transform:rotate(-45deg)}
      .menu-option{margin-left:auto;opacity:.7;font-size:.9em;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
      .row{display:flex;align-items:center;gap:.3em}
      .dock:not(.canvas-dock)>.row{height:var(--h);overflow:hidden;transition:height var(--dur) var(--ease),opacity .12s ease}
      .dock.open>.row{height:0;opacity:0;visibility:hidden;pointer-events:none}
      .nav{position:relative;width:var(--nav);height:var(--nav);min-width:var(--nav);min-height:var(--nav);display:grid;place-items:center;font-size:var(--navfs);line-height:1;border-radius:999px;transition:transform .12s ease}
      .prev::before,.next::before{content:"";width:6px;height:6px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor}
      .prev::before{transform:rotate(225deg) translate(-1px,-1px)}
      .next::before{transform:rotate(45deg) translate(-1px,1px)}
      .nav:hover{background:rgba(255,255,255,.12)}
      .nav:active{transform:scale(.9)}
      .label{position:relative;flex:1;min-width:0;text-align:center;padding:0 .65em;min-height:var(--h);display:flex;align-items:center;justify-content:center;gap:.55em;white-space:nowrap;overflow:hidden;border-radius:var(--r);transition:background .12s ease;touch-action:none}
      .label.holding::after{content:"";position:absolute;inset:0;background:rgba(255,255,255,.16);transform-origin:left;transform:scaleX(0);animation:holdFill ${HOLD_FILL_MS}ms linear ${HOLD_FILL_DELAY_MS}ms forwards}
      @keyframes holdFill{to{transform:none}}
      .boxing .menu,.boxing .row{opacity:0;transition:opacity .12s ease}
      .boxing.unboxing .menu,.boxing.unboxing .row{opacity:1;transition:opacity .15s ease .14s}
      .preboxed .menu,.preboxed .row{opacity:0;transition:none}
      .dock.boxing{overflow:hidden;pointer-events:none;transition:width .3s var(--ease),height .3s var(--ease),border-radius .3s var(--ease),padding .3s var(--ease),left .3s var(--ease)}
      .dock.preboxed{overflow:hidden;transition:none}
      .minimized{position:fixed;left:var(--unship-left,50%);bottom:var(--unship-bottom,max(14px,env(safe-area-inset-bottom)));transform:translateX(-50%);z-index:2147483647;width:${MINI_SIZE_PX}px;height:${MINI_SIZE_PX}px;padding:0;border-radius:50%;background:#000;cursor:pointer;display:grid;place-items:center;transition:transform .2s cubic-bezier(.32,.72,0,1),opacity .14s ease;animation:miniIn .14s cubic-bezier(0,0,.2,1)}
      @keyframes miniIn{from{transform:translateX(-50%) scale(1.06)}to{transform:translateX(-50%)}}
      .minimized::before{content:"";width:6px;height:6px;border:1.5px solid #fff;transform:rotate(45deg)}
      .minimized.top{top:var(--unship-top,max(14px,env(safe-area-inset-top)));bottom:auto}
      .minimized:hover{transform:translateX(-50%) scale(1.12)}
      .minimized.fading{opacity:0;transition:none;pointer-events:none}
      .dock.dragging{transition:none;cursor:grabbing}
      .dock.dragging .label{cursor:grabbing}
      .ghost{position:fixed;z-index:2147483646;pointer-events:none;box-sizing:border-box;border:1.5px dashed rgba(128,128,128,.65);background:rgba(128,128,128,.08);border-radius:24px;transition:left .15s ease,top .15s ease;animation:ghostIn .15s ease}
      @keyframes ghostIn{from{opacity:0}}
      .dock.snapping{transition:left .22s var(--ease),bottom .22s var(--ease),top .22s var(--ease)}
      .label:hover,.label:focus{background:transparent;box-shadow:none;outline:0}
      .label:focus-visible{background:transparent;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.55)}
      .choice-unit{display:inline-flex;align-items:center;justify-content:center;gap:.55em;min-width:0;max-width:100%}
      .label-main{font-size:11.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .label-main.copy-status{display:grid;gap:1px;line-height:1.2;white-space:normal}
      .copy-next{font-size:10px;opacity:.7}
      .option-count{font-size:11.5px;flex:none;opacity:.7;font-variant-numeric:tabular-nums}
      .canvas-enter,.canvas-fit{height:var(--h);padding:0 10px;border-radius:999px;white-space:nowrap;font-size:11px}
      .canvas-enter{display:grid;place-items:center;box-sizing:border-box;width:var(--nav);min-width:var(--nav);padding:0;margin-left:5px;background:rgba(255,255,255,.12)}
      .canvas-enter.preparing{pointer-events:none}
      .canvas-entry-icon{opacity:.5;display:grid;place-items:center;width:18px;height:18px;flex:none}
      .canvas-spinner{width:9px;height:9px;border:1.5px solid #ffffff59;border-top-color:#fff;border-radius:50%;animation:spin .45s linear infinite}
      @keyframes spin{to{transform:rotate(1turn)}}
      .canvas-enter:hover,.canvas-fit:hover,.canvas-state-toggle:hover{background:rgba(255,255,255,.17)}
      .canvas-shell{--canvas-dot:rgba(17,17,17,.12);--canvas-grid-size:24px;--canvas-grid-x:0px;--canvas-grid-y:0px;position:fixed;inset:0;z-index:2147483645;background-color:#fff;background-image:radial-gradient(circle,var(--canvas-dot) 1px,transparent 1.15px);background-size:var(--canvas-grid-size) var(--canvas-grid-size);background-position:var(--canvas-grid-x) var(--canvas-grid-y);color:#171717;font:500 13px/1.3 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:-.01em;opacity:0;pointer-events:none;transition:opacity .1s linear,background-color .14s ease,color .14s ease}
      .canvas-shell.visible{opacity:1;pointer-events:auto}
      .canvas-shell.leaving{pointer-events:none}
      .canvas-shell[data-theme="dark"]{--canvas-dot:rgba(255,255,255,.14);background-color:#101010;color:#f0f0ee}
      .canvas-viewport{position:absolute;inset:0;overflow:hidden;box-sizing:border-box;cursor:grab;overscroll-behavior:contain;touch-action:none;user-select:none}
      .canvas-viewport.panning{cursor:grabbing;user-select:none}
      .canvas-world{display:flex;flex-direction:column;align-items:flex-start;gap:64px;width:max-content;min-width:calc(100vw - 128px);padding:64px 64px 152px;box-sizing:border-box;opacity:0;will-change:transform;transition:opacity .11s cubic-bezier(.16,1,.3,1)}
      .canvas-shell.content-visible .canvas-world{opacity:1}
      .canvas-group{display:flex;flex-direction:column;gap:14px;width:max-content;max-width:none}
      .canvas-group-name{position:sticky;left:0;z-index:3;margin:0;font-size:13px;font-weight:500;line-height:1.2;letter-spacing:-.01em;color:#6f6f6b;transition:color .14s ease}
      .canvas-shell[data-theme="dark"] .canvas-group-name{color:#aaa9a4}
      .canvas-options{display:flex;flex-direction:column;align-items:flex-start;gap:28px}
      .canvas-option-row{display:flex;align-items:flex-start;gap:18px;width:max-content}
      .canvas-grid{width:min(1600px,calc(100vw - 88px))}
      .canvas-grid .canvas-options{display:flex;flex-direction:row;flex-wrap:wrap;width:100%;align-items:flex-start}
      .canvas-grid .canvas-option-row{display:flex}
      .canvas-frame{position:relative;flex:none;min-height:64px;background:transparent;overflow:visible}
      .canvas-frame:hover,.canvas-frame:focus-within{z-index:4}
      .canvas-frame:focus-visible{outline:2px solid #111;outline-offset:4px}
      .canvas-shell[data-theme="dark"] .canvas-frame:focus-visible{outline-color:#fff}
      .canvas-iframe{display:block;width:100%;height:180px;border:0;background:transparent;opacity:0;pointer-events:none;transition:opacity .16s ease}
      .canvas-frame.ready .canvas-iframe{opacity:1}
      .canvas-frame.viewport-hidden{display:none}
      .canvas-frame.failed{min-height:96px;background:rgba(127,127,127,.08)}
      .canvas-frame-toolbar{position:fixed;z-index:7;display:flex;align-items:center;gap:4px;min-height:40px;box-sizing:border-box;max-width:calc(100vw - 24px);padding:4px 6px 4px 4px;border-radius:999px;background:#050505;color:#fff;font-size:11px;box-shadow:0 5px 18px rgba(0,0,0,.25);opacity:0;pointer-events:none;transform:translate(-50%,6px) scale(.96);transition:opacity .14s ease,transform .16s cubic-bezier(.32,.72,0,1);white-space:nowrap}
      .canvas-frame-toolbar.visible{opacity:1;pointer-events:auto;transform:translate(-50%,0) scale(1)}
      .canvas-option-name{padding-left:9px;min-width:0;max-width:180px;overflow:hidden;text-overflow:ellipsis}
      .canvas-frame-width{flex:none;padding:0 7px;opacity:.6;font-variant-numeric:tabular-nums}
      .canvas-frame-toolbar button{flex:none;position:relative;min-height:26px;padding:0 9px;border-radius:999px;overflow:hidden}
      .canvas-frame-toolbar button:hover,.canvas-frame-toolbar button:focus-visible{background:rgba(255,255,255,.14)}
      .canvas-keep.holding::after{content:"";position:absolute;inset:0;background:rgba(255,255,255,.16);transform-origin:left;transform:scaleX(0);animation:holdFill ${HOLD_FILL_MS}ms linear ${HOLD_FILL_DELAY_MS}ms forwards}
      .dock.canvas-dock{top:auto!important;bottom:max(14px,env(safe-area-inset-bottom))!important;width:max-content;max-width:calc(100vw - 20px);left:50%!important}
      .canvas-row{gap:3px}
      .canvas-zoom::before,.canvas-zoom-in::after{content:"";position:absolute;left:50%;top:50%;width:10px;height:1.5px;background:currentColor;transform:translate(-50%,-50%)}
      .canvas-close svg{transform:translateX(-1px);width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      .canvas-close.nav{transition:background .16s ease,transform .16s ease}
      .canvas-close.nav:hover{background:rgba(255,255,255,.2);transform:scale(1.06)}
      .canvas-close.nav:active{transform:scale(.94)}
      .canvas-zoom-in::after{transform:translate(-50%,-50%) rotate(90deg)}
      .canvas-divider{width:1px;height:22px;flex:none;background:rgba(255,255,255,.14)}
      .canvas-state-toggle{position:relative;width:var(--h);height:var(--h);min-width:var(--h);padding:0;border-radius:50%;overflow:hidden;background:transparent;transition:background .16s ease,transform .12s ease}
      .canvas-state-toggle:active{transform:scale(.9)}
      .canvas-responsive-toggle[aria-pressed="true"]{background:#f5f5f3;color:#050505}
      .canvas-theme-toggle{background:transparent}
      .canvas-theme-toggle:hover,.canvas-theme-toggle:focus-visible{background:#ffffff16}
      .canvas-state-icon{position:absolute;inset:0;display:grid;place-items:center;transition:opacity .16s ease,transform .2s cubic-bezier(.32,.72,0,1)}
      .canvas-enter svg,.canvas-state-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      .canvas-responsive-toggle .canvas-state-secondary svg{width:20px;height:20px}
      .canvas-state-primary{opacity:1;transform:rotate(0) scale(1)}
      .canvas-state-secondary{opacity:0;transform:rotate(-28deg) scale(.6)}
      .canvas-state-toggle[aria-pressed="true"] .canvas-state-primary{opacity:0;transform:rotate(28deg) scale(.6)}
      .canvas-state-toggle[aria-pressed="true"] .canvas-state-secondary{opacity:1;transform:rotate(0) scale(1)}
      .canvas-zoom-value{font-size:11.5px;box-sizing:border-box;height:var(--h);width:40px;min-width:40px;flex:none;padding:0 4px;display:grid;place-items:center;font-variant-numeric:tabular-nums}
      .sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      @keyframes dockIn{from{opacity:0;transform:translateX(-50%) scale(.96)}to{opacity:1;transform:translateX(-50%)}}
      @keyframes swapIn{from{opacity:0;transform:translateX(var(--dx,0px))}to{transform:none}}
      .dock.enter{animation:dockIn .2s cubic-bezier(0,0,.2,1)}
      .dock[data-dir="next"] .row{--dx:6px}
      .dock[data-dir="prev"] .row{--dx:-6px}
      .choice-unit.swap{animation:swapIn .18s cubic-bezier(.2,.75,.25,1)}
      @media (pointer:coarse),(max-width:520px){.dock{--h:40px;--nav:40px;--navfs:20px;width:min(344px,var(--unship-max-width,calc(100vw - 20px)))}}
      @media (max-width:520px){.canvas-row{gap:2px}}
      @media (max-width:340px){.canvas-fit{display:none}}
      @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;
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
    root.addEventListener("wheel", handleMenuWheel, { passive: false });
    root.addEventListener("mousedown", handleToolbarMouseDown);
    root.addEventListener("keydown", handleToolbarKeydown);
    root.addEventListener("dblclick", handleLabelDblclick);
    root.addEventListener("pointerdown", handleLabelPointerDown);

    liveRegion = document.createElement("div");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.className = "sr";

    rescan();
    syncViewportBounds();
    observer = new MutationObserver(queueRescan);
    observeDocument();
    if (useGlobalShortcuts) document.addEventListener("keydown", handleGlobalKeydown);
  }

  window.__unshipPicker = api;
  init();
})();
