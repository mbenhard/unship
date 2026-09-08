  // Experimental same-document Canvas for the local test build.
  let liveRecords = [];
  let liveFrameRequest = 0;
  let liveResizeObserver;
  let liveWheelCleanups = [];

  function liveSet(record, property, value) {
    if (!record.styles.has(property)) record.styles.set(property, [record.originalStyle.getPropertyValue(property), record.originalStyle.getPropertyPriority(property)]);
    record.element.style.setProperty(property, value, 'important');
  }

  function buildCanvasFrame(group, option, width) {
    const frame = document.createElement('article');
    frame.className = 'canvas-frame ready';
    frame.dataset.group = String(group.index);
    frame.dataset.option = String(option.index);
    frame.dataset.width = String(width);
    frame.style.width = `${width}px`;
    frame.tabIndex = 0;
    frame.setAttribute('aria-label', `${group.displayLabel}: ${option.label}`);
    const originalStyle = document.createElement('span').style;
    originalStyle.cssText=option.element.style.cssText;
    liveRecords.push({element:option.element, frame, width, originalStyle, styles:new Map(), hidden:option.element.hidden, popover:option.element.getAttribute('popover')});
    return frame;
  }

  function startLiveCanvas() {
    canvasShell.popover = 'manual';
    canvasShell.showPopover();
    liveResizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const record = liveRecords.find(record => record.element === entry.target);
        if (record) record.frame.style.height = `${Math.max(48, record.element.offsetHeight)}px`;
      }
    });
    pauseObserver(() => {
      for (const record of liveRecords) {
        const element = record.element;
        element.hidden = false;
        // Reveal options whose author CSS needed an explicit hidden override.
        liveSet(record, 'display', originalDisplayByOption.get(element) || getComputedStyle(element).display.replace(/^none$/, 'block'));
        const style = getComputedStyle(element);
        for (const property of ['padding-top','padding-right','padding-bottom','padding-left','border-top','border-right','border-bottom','border-left','background-color','color','overflow']) liveSet(record, property, style.getPropertyValue(property));
        for (const [property,value] of Object.entries({position:'fixed',inset:'auto',left:'0px',top:'0px',margin:'0px',width:`${record.width}px`,'max-width':'none','max-height':'none','box-sizing':'border-box','transform-origin':'0 0',transition:'none'})) liveSet(record,property,value);
        element.setAttribute('data-live-option','');
        element.popover = 'manual';
        element.showPopover();
        record.frame.style.height = `${Math.max(48,element.offsetHeight)}px`;
        record.onEnter = () => {
          showCanvasFrameToolbar(record.frame);
          const toolbar = canvasShell.querySelector('.canvas-frame-toolbar');
          toolbar.popover = 'manual';
          if (!toolbar.matches(':popover-open')) toolbar.showPopover();
        };
        record.onLeave = scheduleCanvasFrameToolbarHide;
        element.addEventListener('pointerenter',record.onEnter);
        element.addEventListener('pointerleave',record.onLeave);
        liveResizeObserver.observe(element);
        bridgeLiveFrames(element);
      }
    });
    document.addEventListener('keydown', liveTab, true);
    followLiveFrames();
  }

  function followLiveFrames() {
    if (!canvasShell || (!canvasOpen && !canvasPreparing)) return;
    for (const record of liveRecords) {
      const rect = record.frame.getBoundingClientRect();
      liveSet(record,'transform',`translate(${rect.left}px,${rect.top}px) scale(${rect.width / record.width})`);
      liveSet(record,'visibility',canvasShell.classList.contains('content-visible') ? 'visible' : 'hidden');
    }
    const dock = root.querySelector('.canvas-dock');
    if (dock && !dock.matches(':popover-open')) { dock.popover='manual'; dock.showPopover(); }
    liveFrameRequest=requestAnimationFrame(followLiveFrames);
  }

  function liveTab(event) {
    if (!canvasOpen || event.key!=='Tab') return;
    const controls=[...liveRecords.flatMap(record=>[...record.element.querySelectorAll('button,input,textarea,select,a[href],[tabindex="0"]')]),...root.querySelectorAll('.canvas-dock button')].filter(node=>!node.disabled && node.getClientRects().length);
    const active=document.activeElement===host ? root.activeElement : document.activeElement;
    event.preventDefault();event.stopImmediatePropagation();
    controls[wrap(controls.indexOf(active)+(event.shiftKey?-1:1),controls.length)]?.focus({preventScroll:true});
  }

  function stopLiveCanvas() {
    cancelAnimationFrame(liveFrameRequest);
    liveResizeObserver?.disconnect();
    liveWheelCleanups.forEach(cleanup => cleanup());
    liveWheelCleanups = [];
    document.removeEventListener('keydown',liveTab,true);
    pauseObserver(() => {
      for (const record of liveRecords) {
        const element=record.element;
        if(element.matches(':popover-open'))element.hidePopover();
        if(record.popover===null)element.removeAttribute('popover');else element.setAttribute('popover',record.popover);
        element.removeAttribute('data-live-option');
        for (const [property,[value,priority]] of record.styles) {
          if(value)element.style.setProperty(property,value,priority);else element.style.removeProperty(property);
        }
        if(!element.style.length)element.removeAttribute('style');
        element.hidden=record.hidden;
        element.removeEventListener('pointerenter',record.onEnter);
        element.removeEventListener('pointerleave',record.onLeave);
      }
      groups.forEach(applyGroupVisibility);
    });
    liveRecords=[];
    if(canvasShell?.matches(':popover-open'))canvasShell.hidePopover();
  }



  function liveScrollConsumes(event) {
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const delta = horizontal ? event.deltaX : event.deltaY;
    if (!delta) return false;
    for (const node of event.composedPath()) {
      if (node.nodeType !== 1) continue;
      const style = node.ownerDocument.defaultView.getComputedStyle(node);
      const overflow = horizontal ? style.overflowX : style.overflowY;
      const position = horizontal ? node.scrollLeft : node.scrollTop;
      const maximum = horizontal ? node.scrollWidth-node.clientWidth : node.scrollHeight-node.clientHeight;
      if (maximum > 1 && (/auto|scroll/.test(overflow) || node === node.ownerDocument.scrollingElement)) {
        if (delta < 0 ? position > 0 : position < maximum-1) return true;
        const overscroll = horizontal ? style.overscrollBehaviorX : style.overscrollBehaviorY;
        if (overscroll === 'contain' || overscroll === 'none') return true;
      }
      if (node.hasAttribute('data-live-option')) break;
    }
    return false;
  }

  // Wheel events do not cross iframe documents; bridge accessible local frames.
  function bridgeLiveFrames(container) {
    for (const frame of container.querySelectorAll('iframe')) {
      let attachedDocument;
      const attach = () => {
        let doc;
        try { doc = frame.contentDocument; } catch { return; }
        if (!doc || doc === attachedDocument) return;
        attachedDocument = doc;
        const relay = event => {
          if ((!canvasOpen && !canvasPreparing) || (!event.ctrlKey && liveScrollConsumes(event))) return;
          const rect = frame.getBoundingClientRect();
          const scaleX = rect.width / (frame.offsetWidth || rect.width);
          const scaleY = rect.height / (frame.offsetHeight || rect.height);
          const view = frame.ownerDocument.defaultView;
          const forwarded = new view.WheelEvent('wheel', {
            deltaX:event.deltaX, deltaY:event.deltaY, deltaMode:event.deltaMode,
            ctrlKey:event.ctrlKey, shiftKey:event.shiftKey,
            clientX:rect.left+(event.clientX+frame.clientLeft)*scaleX,
            clientY:rect.top+(event.clientY+frame.clientTop)*scaleY,
            bubbles:true, composed:true, cancelable:true
          });
          frame.dispatchEvent(forwarded);
          if (forwarded.defaultPrevented) { event.preventDefault(); event.stopImmediatePropagation(); }
        };
        doc.addEventListener('wheel',relay,{capture:true,passive:false});
        liveWheelCleanups.push(() => doc.removeEventListener('wheel',relay,true));
        bridgeLiveFrames(doc);
      };
      frame.addEventListener('load',attach);
      liveWheelCleanups.push(() => frame.removeEventListener('load',attach));
      attach();
    }
  }
