import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   class Sensor extends EventTarget {constructor(){super();this.name='Polar H10 TEST';this.gatt={connected:false,connect:async()=>{this.gatt.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async()=>window.hrCharacteristic})}},disconnect:()=>{this.gatt.connected=false;this.dispatchEvent(new Event('gattserverdisconnected'))}};}}
   window.hrCharacteristic=new EventTarget();window.hrCharacteristic.startNotifications=async()=>window.hrCharacteristic;
   Object.defineProperty(navigator,'bluetooth',{value:{requestDevice:async()=>new Sensor()},configurable:true});
   window.sendHr=bpm=>{const c=window.hrCharacteristic;c.value=new DataView(Uint8Array.of(0,bpm).buffer);c.dispatchEvent(new Event('characteristicvaluechanged'));};
 });
 await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');await page.locator('#polar').click();await page.waitForFunction(()=>document.querySelector('#polar').textContent.includes('Disconnect'));
 await page.evaluate(()=>window.sendHr(91));assert.equal(await page.locator('#bpm').innerText(),'91');assert.match(await page.locator('#hr-source').innerText(),/LIVE/);
 await page.locator('#polar').click();assert.equal(await page.locator('#bpm').innerText(),'—');
 await page.locator('#camera').click();await page.waitForFunction(()=>document.querySelector('#camera').textContent==='Webcam enabled',{},{timeout:30000});await page.waitForTimeout(1500);assert.equal(await page.locator('#preview-wrap').isVisible(),true);assert.match(await page.locator('#mode-label').innerText(),/WEBCAM/);
 await page.locator('#camera-off').click();assert.equal(await page.locator('#preview-wrap').isVisible(),false);assert.match(await page.locator('#mode-label').innerText(),/MOUSE/);assert.deepEqual(errors,[]);
 console.log('PASS: mocked BLE connect/notification/disconnect; bundled pose model initializes and processes fake webcam, camera stops. Real sensor and human motion still unverified.');
}finally{await browser.close();}
