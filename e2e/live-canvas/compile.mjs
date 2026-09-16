import { readFile } from 'node:fs/promises';
export async function compileLivePicker({ probe = false } = {}) {
  const source = await readFile(new URL('../../src/picker/unship-picker.js', import.meta.url), 'utf8');
  if (!probe) return source;
  return source.replace('  window.__unshipPicker = api;', `
  window.__liveCanvasProbe = {setWidth(width) {for (const record of liveRecords){record.width=width;liveSet(record,"width",String(width)+"px");record.frame.style.width=String(width)+"px";}fitCanvas({animate:false});}};
  window.__unshipPicker = api;`);
}
