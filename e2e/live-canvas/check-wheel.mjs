import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
await page.goto(process.env.UNSHIP_LIVE_URL || 'http://127.0.0.1:4173/live-canvas');
await page.waitForFunction(()=>window.iframeLoads===2 && window.__unshipPicker?.getState().groups.length===1);
const first=page.locator('[data-unship-option="Quiet start"]');
const camera=()=>page.locator('.canvas-world').evaluate(n=>{const m=new DOMMatrix(getComputedStyle(n).transform);return{x:m.e,y:m.f,scale:m.a};});
async function open(){await page.getByRole('button',{name:'Open Canvas',exact:true}).click();await page.waitForFunction(()=>{const r=document.querySelector('[data-unship-toolbar]').shadowRoot;return r.querySelector('.canvas-shell')?.classList.contains('content-visible') && getComputedStyle(r.querySelector('.canvas-shell')).opacity==='1';});await page.waitForTimeout(80);}
async function wheelOver(locator){const r=await locator.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);const before=await camera();await page.mouse.wheel(12,24);await page.waitForTimeout(120);const after=await camera();assert.ok(Math.abs(after.x-before.x+12)<1,JSON.stringify({before,after}));assert.ok(Math.abs(after.y-before.y+24)<1,JSON.stringify({before,after}));return{dx:after.x-before.x,dy:after.y-before.y};}
await open();
const card=await wheelOver(first.locator('.increment'));
const shadow=await wheelOver(first.locator('live-badge'));
const iframe=await wheelOver(first.locator('iframe'));
await first.locator('.increment').click();assert.match(await first.locator('.increment').innerText(),/1/);
await first.evaluate(n=>{const scroll=document.createElement('div');scroll.id='wheel-scroll';scroll.style.cssText='height:80px;width:200px;overflow:auto';scroll.innerHTML='<div style="height:400px">Scrollable content</div>';n.prepend(scroll);});
await page.waitForTimeout(100);
const scroll=page.locator('#wheel-scroll');await scroll.hover();const before=await camera();await page.mouse.wheel(0,40);await page.waitForTimeout(150);assert.ok(await scroll.evaluate(n=>n.scrollTop)>0);assert.deepEqual(await camera(),before);
await scroll.evaluate(n=>n.scrollTop=n.scrollHeight);const edge=await wheelOver(scroll);
await scroll.evaluate(n=>n.style.overscrollBehavior='contain');await scroll.hover();const contained=await camera();await page.mouse.wheel(0,40);await page.waitForTimeout(100);assert.deepEqual(await camera(),contained);
const pinch=await first.evaluate(n=>{const e=new WheelEvent('wheel',{ctrlKey:true,deltaY:20,bubbles:true,cancelable:true,clientX:500,clientY:300});n.dispatchEvent(e);return e.defaultPrevented;});assert.equal(pinch,true);
const modifiedZoom = [];
for (const modifier of ['ctrlKey', 'metaKey']) {
  for (const [name, target] of [['inner scroll', scroll], ['iframe', first.locator('iframe').contentFrame().locator('button')]]) {
    const before = await camera();
    const prevented = await target.evaluate((node, modifier) => {
      const event = new node.ownerDocument.defaultView.WheelEvent('wheel', { [modifier]: true, deltaY: -20, clientX: 20, clientY: 20, bubbles: true, composed: true, cancelable: true });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    }, modifier);
    assert.equal(prevented, true, `${modifier} over ${name} must suppress native zoom`);
    await page.waitForFunction(scale => __unshipPicker.getState().canvas.zoom > scale, before.scale);
    modifiedZoom.push({modifier, target: name, nativeZoomPrevented: true});
  }
}
await page.getByRole('button',{name:'Back to page',exact:true}).click();await page.getByRole('button',{name:'Open Canvas',exact:true}).waitFor();
await scroll.evaluate(n=>n.remove());await open();const reopened=await wheelOver(first.locator('iframe'));
await page.getByRole('button',{name:'Back to page',exact:true}).click();
assert.deepEqual(errors,[]);
const result={card,shadow,iframe,innerScrollPreserved:true,edge,overscrollContainRespected:true,pinchCaptured:pinch,modifiedZoom,reopened,errors};
await writeFile('.unship/live-canvas/wheel-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
