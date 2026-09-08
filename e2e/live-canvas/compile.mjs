import { readFile } from 'node:fs/promises';

export const candidateVersion = '0.2.0-live.2';

export async function compileLivePicker({ probe = false } = {}) {
  let source = await readFile(new URL('../../src/picker/unship-picker.js', import.meta.url), 'utf8');
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error(`Live Canvas patch needs review: ${before}`);
    source = source.replace(before, after);
  };
  const replaceFunction = (name, body) => {
    const start = source.indexOf(`  function ${name}(`);
    const end = source.indexOf('\n  function ', start + 1);
    if (start < 0 || end < 0) throw new Error(`Missing function: ${name}`);
    source = source.slice(0, start) + body + '\n' + source.slice(end);
  };
  replace('version: "0.2.0",', `version: "${candidateVersion}",`);
  replaceFunction('buildCanvasFrame', '');
  replaceFunction('snapshotDocument', '');
  replaceFunction('canReuseCanvas', '  function canReuseCanvas() { return false; }');
  replaceFunction('canvasResponsiveMarkup', '  function canvasResponsiveMarkup() { return ""; }');
  replace('    canvasSnapshot = snapshotDocument();', '    canvasSnapshot = "";');
  replace('    root.append(canvasShell);\n    setCanvasEntryPreparing', '    root.append(canvasShell);\n    startLiveCanvas();\n    setCanvasEntryPreparing');
  replace('    canvasPreparing = false;\n    setCanvasEntryPreparing(false);\n    clearTimeout(canvasRevealTimer);', '    canvasPreparing = false;\n    stopLiveCanvas();\n    setCanvasEntryPreparing(false);\n    clearTimeout(canvasRevealTimer);');
  replace('const widths = group.canvasLayout === "matrix" ? MATRIX_WIDTHS : [naturalWidth];', 'const widths = [naturalWidth];');
  replace('    if (!event.ctrlKey && !target.closest?.(".canvas-viewport")) return;', `    const overLiveOption = event.composedPath().some(node => node.hasAttribute?.('data-live-option'));
    if (!event.ctrlKey && !target.closest?.(".canvas-viewport") && !overLiveOption) return;
    if (!event.ctrlKey && overLiveOption && liveScrollConsumes(event)) return;`);
  replace('  function applyGroupVisibility(group) {', '  function applyGroupVisibility(group) {\n    if (canvasOpen || canvasPreparing) return;');
  replace('      .dock{--ease:', `      .canvas-shell[popover]{margin:0;padding:0;border:0;width:100vw;height:100vh;max-width:none;max-height:none;overflow:hidden}
      .canvas-dock[popover]{margin:0;inset:auto;left:var(--unship-left,50%);bottom:14px;border:0}
      .canvas-frame-toolbar[popover]{margin:0;inset:auto;border:0}
      .dock{--ease:`);
  let extension = await readFile(new URL('extension.js', import.meta.url), 'utf8');
  if (probe) extension += '\n  window.__liveCanvasProbe = {setWidth(width) {for (const record of liveRecords){record.width=width;liveSet(record,"width",`${width}px`);record.frame.style.width=`${width}px`;}fitCanvas({animate:false});}};\n';
  replace('  window.__unshipPicker = api;', `${extension}\n  window.__unshipPicker = api;`);
  return source;
}
