(() => {
  if (window.__unshipPicker) return;

  const OPTION_ATTR = "data-unship-option";
  const GROUP_SELECTOR = "[data-unship-pick]";
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
  let placement = "bottom";
  let rescanQueued = false;
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
  let gesturePointerId = null;
  let gestureCleanup = null;
  let ghost = null;

  const api = {
    version: "0.1.3",
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
    gestureCleanup?.();
    observer?.disconnect();
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
    scrollToGroup(groups[activeGroupIndex]);
  }

  function pickGroup(index) {
    if (!Number.isInteger(index) || !groups[index]) return;

    activeGroupIndex = index;
    const group = groups[activeGroupIndex];
    const dock = root?.querySelector(".dock");

    const items = dock ? Array.from(dock.querySelectorAll(".menu .menuitem")) : [];
    const oldItem = dock?.querySelector(".menuitem.current");
    const newItem = items.find((item) => Number(item.dataset.index) === index);

    if (menuOpen && dock && oldItem && newItem && oldItem !== newItem) {
      // Swap the two rows' roles in place, then contract. The collapse pushes
      // the newly current row up into the header position — the reverse of the
      // open morph. The DOM is updated to exactly match the next render.
      const option = group.options[clamp(group.activeOptionIndex, group.options.length)];
      const oldIndex = items.indexOf(oldItem);
      const oldGroup = groups[oldIndex];
      const oldOption = oldGroup.options[clamp(oldGroup.activeOptionIndex, oldGroup.options.length)];

      oldItem.classList.remove("current");
      oldItem.removeAttribute("aria-current");
      oldItem.removeAttribute("aria-haspopup");
      oldItem.removeAttribute("aria-expanded");
      oldItem.dataset.action = "pick-group";
      oldItem.dataset.index = String(oldIndex);
      oldItem.setAttribute("aria-label", `${oldGroup.displayLabel}, ${oldOption.label}`);
      oldItem.innerHTML = `<span class="menu-name">${escapeHtml(oldGroup.displayLabel)}</span><span class="menu-option">${escapeHtml(oldOption.label)}</span>`;

      newItem.classList.add("current");
      newItem.setAttribute("aria-current", "true");
      newItem.setAttribute("aria-haspopup", "menu");
      newItem.dataset.action = "toggle-menu";
      delete newItem.dataset.index;
      newItem.setAttribute("aria-label", `Active group ${group.displayLabel}`);
      newItem.innerHTML = `<span class="menu-name">${escapeHtml(group.displayLabel)}</span>${counterMarkup("group-count", group)}`;

      const labelMain = dock.querySelector(".label-main");
      if (labelMain) labelMain.textContent = option.label;
      dock
        .querySelector(".label")
        ?.setAttribute(
          "aria-label",
          `${group.displayLabel}, ${option.label}, option ${group.activeOptionIndex + 1} of ${group.options.length}. Hold to keep this option, double-click to minimize, drag to move`
        );
      closeMenu();
    } else {
      menuOpen = false;
      render();
    }
    announce(group);
    scrollToGroup(group);
  }

  function openMenu() {
    if (menuOpen) return;
    menuOpen = true;

    const dock = root?.querySelector(".dock");
    if (!dock) {
      render();
      return;
    }

    // Class toggle instead of a re-render so the rows transition into place
    // and the active row is pushed down into its list position by layout.
    dock.classList.add("open");
    dock.querySelector(".menuitem.current")?.setAttribute("aria-expanded", "true");
    renderedSignature = renderSignature(groups.length === 1 ? "single" : "multi");
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;

    const dock = root?.querySelector(".dock");
    if (!dock) {
      render();
      return;
    }

    dock.classList.remove("open");
    dock.querySelector(".menuitem.current")?.setAttribute("aria-expanded", "false");
    renderedSignature = renderSignature(groups.length === 1 ? "single" : "multi");
  }

  function render() {
    if (!root) return;

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
    const mode = groups.length === 1 ? "single" : "multi";
    const nextSignature = renderSignature(mode);
    if (nextSignature === renderedSignature) return;
    const entering = renderedSignature === "" || renderedSignature === "none";
    renderedSignature = nextSignature;

    // Minimized form: a small circular button holding the diamond mark.
    if (minimized) {
      setToolbarHtml(`<button class="minimized ${placement}" type="button" data-action="restore" aria-label="Restore Unship toolbar — ${escapeHtml(option.label)}, option ${group.activeOptionIndex + 1} of ${group.options.length}"></button>`);
      return;
    }

    const swapClass = switchDir ? " swap" : "";
    setToolbarHtml(`<div class="dock ${mode} ${placement} ${menuOpen ? "open" : ""}${entering ? " enter" : ""}"${switchDir ? ` data-dir="${switchDir}"` : ""} role="group" aria-label="Unship variant picker">
      ${groups.length > 1 ? menu(swapClass) : ""}
      <div class="row">
        <button class="prev nav" type="button" data-action="previous" aria-label="Previous option"></button>
        <button class="label" type="button" aria-label="${escapeHtml(group.displayLabel)}, ${escapeHtml(option.label)}, option ${group.activeOptionIndex + 1} of ${group.options.length}. Hold to keep this option, double-click to minimize, drag to move. Press Enter to keep, Shift plus Enter to minimize">
          <span class="label-main${swapClass}">${copied === "ok" ? "✓ Copied" : copied === "fail" ? "Couldn't copy. Try again" : escapeHtml(groups.length === 1 ? `${group.displayLabel}: ${option.label}` : option.label)}</span>
          ${groups.length === 1 && !copied ? counterMarkup("option-count", group, swapClass) : ""}
        </button>
        <button class="next nav" type="button" data-action="next" aria-label="Next option"></button>
      </div>
    </div>`);
  }

  function setToolbarHtml(html) {
    root.innerHTML = "";
    if (!styleNode) {
      styleNode = document.createElement("style");
      styleNode.textContent = css();
    }
    root.append(styleNode);
    if (html) {
      const template = document.createElement("template");
      template.innerHTML = html;
      root.append(template.content);
    }
    root.append(liveRegion);
  }

  function renderSignature(mode) {
    return JSON.stringify({
      activeGroupIndex,
      menuOpen,
      mode,
      placement,
      minimized,
      copied,
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

  function counterMarkup(className, group, swapClass = "") {
    return `<span class="${className}"><span class="${className}-current${swapClass}">${group.activeOptionIndex + 1}</span><span class="${className}-slash">/</span><span class="${className}-total">${group.options.length}</span></span>`;
  }

  // One list, two roles: the active row doubles as the closed-state header.
  // Closed, only the active row is visible; opening expands the other rows in
  // document order around it, so the header visually morphs into its place in
  // the list (and back on close) purely through layout.
  function menu(swapClass = "") {
    const items = groups
      .map((group, index) => {
        const current = index === activeGroupIndex;
        if (current) {
          return `<button class="menuitem current" type="button" role="menuitem" aria-current="true" data-action="toggle-menu" aria-haspopup="menu" aria-expanded="${menuOpen}" aria-label="Active group ${escapeHtml(group.displayLabel)}"><span class="menu-name">${escapeHtml(group.displayLabel)}</span>${counterMarkup("group-count", group, swapClass)}</button>`;
        }
        const option = group.options[clamp(group.activeOptionIndex, group.options.length)];
        return `<button class="menuitem" type="button" role="menuitem" data-action="pick-group" data-index="${index}" aria-label="${escapeHtml(group.displayLabel)}, ${escapeHtml(option.label)}"><span class="menu-name">${escapeHtml(group.displayLabel)}</span><span class="menu-option">${escapeHtml(option.label)}</span></button>`;
      })
      .join("");

    return `<div class="menu" role="menu">${items}</div>`;
  }

  function handleToolbarClick(event) {
    const button = event.target.closest?.("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    if (action === "previous") switchOption(-1);
    else if (action === "next") switchOption(1);
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
    if ((event.key === "Enter" || event.key === " ") && event.target.closest?.(".label")) {
      // Keyboard parity for the pointer-only label gestures: Enter/Space keeps
      // the current option, Shift+Enter minimizes.
      event.preventDefault();
      if (event.shiftKey) handleLabelDblclick(event);
      else keepCurrent();
    } else if (event.key === "ArrowLeft") {
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
    if (event.defaultPrevented || event.composedPath?.().includes(host) || root?.activeElement || isTypingTarget(event.target)) return;

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
    liveRegion.textContent = `${group.displayLabel}, ${option.label}, option ${group.activeOptionIndex + 1} of ${group.options.length}`;
  }

  // Copy a ready-to-paste keep instruction for the agent. Only claims success
  // when a copy path actually succeeded; otherwise shows a failure state.
  async function keepCurrent() {
    const group = groups[activeGroupIndex];
    if (!group) return;
    const option = group.options[group.activeOptionIndex];
    const ok = await copyText(`Keep "${option.label}" for "${group.displayLabel}" and remove the other unship options in that group.`);
    copied = ok ? "ok" : "fail";
    render();
    liveRegion.textContent = ok ? "Copied. Paste the keep instruction to your agent" : "Copy failed";
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copied = false;
      render();
    }, 1800);
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
      .group-count{margin-left:auto;opacity:.7;font-variant-numeric:tabular-nums}
      .group-count,.option-count{display:inline-flex;align-items:baseline}
      .group-count-current,.option-count-current{display:inline-block;min-width:1ch;text-align:right}
      .menu{display:block;margin-bottom:var(--gap)}
      .open .menu{max-height:min(264px,calc(100vh - 168px));overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.28) transparent}
      .menuitem{display:flex;align-items:center;gap:.8em;width:100%;min-height:var(--h);max-height:var(--h);margin-top:var(--gap);padding:0 .85em 0 .95em;border-radius:var(--r);text-align:left;overflow:hidden;transition:max-height var(--dur) var(--ease),min-height var(--dur) var(--ease),margin var(--dur) var(--ease),opacity .2s ease .07s,background .15s ease,color .15s ease}
      .menuitem:first-child{margin-top:0}
      .menuitem:hover{background:rgba(255,255,255,.12)}
      .dock:not(.open) .menuitem:not(.current){max-height:0;min-height:0;margin-top:0;opacity:0;visibility:hidden;transition:max-height var(--dur) var(--ease),min-height var(--dur) var(--ease),margin var(--dur) var(--ease),opacity .15s ease,visibility 0s linear var(--dur),background .15s ease,color .15s ease}
      .dock:not(.open) .menuitem.current{margin-top:0;background:rgba(255,255,255,.12)}
      .dock:not(.open) .menuitem.current:hover{background:rgba(255,255,255,.17)}
      .open .menuitem.current{background:#f5f5f5;color:#000}
      .open .menuitem.current .group-count{opacity:.55}
      .menu-name{font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .menu-option{margin-left:auto;opacity:.7;font-size:.9em;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
      .row{display:flex;align-items:center;gap:.3em;transition:margin-top var(--dur) var(--ease)}
      .open .row{margin-top:var(--gap)}
      .nav{width:var(--nav);height:var(--nav);min-width:var(--nav);min-height:var(--nav);display:grid;place-items:center;font-size:var(--navfs);line-height:1;border-radius:999px;transition:transform .12s ease}
      .nav::before{content:"";width:6px;height:6px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor}
      .prev::before{transform:rotate(225deg) translate(-1px,-1px)}
      .next::before{transform:rotate(45deg) translate(-1px,1px)}
      .nav:hover{background:rgba(255,255,255,.12)}
      .nav:active{transform:scale(.9)}
      .label{position:relative;flex:1;min-width:0;text-align:center;padding:0 .65em;min-height:var(--h);display:flex;align-items:center;justify-content:center;gap:.55em;white-space:nowrap;overflow:hidden;border-radius:var(--r);transition:background .12s ease;touch-action:none}
      .label.holding::after{content:"";position:absolute;inset:0;background:rgba(255,255,255,.16);transform-origin:left;transform:scaleX(0);animation:holdFill ${HOLD_FILL_MS}ms linear ${HOLD_FILL_DELAY_MS}ms forwards}
      @keyframes holdFill{to{transform:none}}
      .dock.boxing{overflow:hidden;pointer-events:none;transition:width .3s var(--ease),height .3s var(--ease),border-radius .3s var(--ease),padding .3s var(--ease),left .3s var(--ease)}
      .boxing .menu,.boxing .row{opacity:0;transition:opacity .12s ease}
      .boxing.unboxing .menu,.boxing.unboxing .row{opacity:1;transition:opacity .15s ease .14s}
      .dock.preboxed{overflow:hidden;transition:none}
      .preboxed .menu,.preboxed .row{opacity:0;transition:none}
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
      .label-main{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .option-count{flex:none;opacity:.7;font-variant-numeric:tabular-nums}
      .sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      @keyframes dockIn{from{opacity:0;transform:translateX(-50%) scale(.96)}to{opacity:1;transform:translateX(-50%)}}
      @keyframes dockInTop{from{opacity:0;transform:translateX(-50%) scale(.96)}to{opacity:1;transform:translateX(-50%)}}
      @keyframes swapIn{from{opacity:0;transform:translate(var(--dx,0px),var(--dy,0px))}to{transform:none}}
      .dock.enter{animation:dockIn .2s cubic-bezier(0,0,.2,1)}
      .dock.top.enter{animation-name:dockInTop}
      .dock[data-dir="next"] .row{--dx:8px}
      .dock[data-dir="prev"] .row{--dx:-8px}
      .dock[data-dir="next"] .group-count-current,.dock[data-dir="next"] .option-count-current{--dx:0px;--dy:8px}
      .dock[data-dir="prev"] .group-count-current,.dock[data-dir="prev"] .option-count-current{--dx:0px;--dy:-8px}
      .label-main.swap{animation:swapIn .11s cubic-bezier(0,0,.2,1)}
      .group-count-current.swap,.option-count-current.swap{animation:swapIn .13s cubic-bezier(0,0,.2,1)}
      @media (pointer:coarse),(max-width:520px){.dock{--h:40px;--nav:40px;--navfs:20px;width:min(344px,var(--unship-max-width,calc(100vw - 20px)))}}
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
    root.addEventListener("mousedown", handleToolbarMouseDown);
    root.addEventListener("keydown", handleToolbarKeydown);
    root.addEventListener("dblclick", handleLabelDblclick);
    root.addEventListener("pointerdown", handleLabelPointerDown);

    liveRegion = document.createElement("div");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.className = "sr";

    rescan();
    observer = new MutationObserver(queueRescan);
    observeDocument();
    if (useGlobalShortcuts) document.addEventListener("keydown", handleGlobalKeydown);
  }

  window.__unshipPicker = api;
  init();
})();
