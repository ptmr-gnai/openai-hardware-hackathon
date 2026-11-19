import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(()=>{Math.random=()=>.1;});await page.clock.install();await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');await page.getByRole('button',{name:'Let’s play'}).click();await page.clock.runFor(500);
 assert.equal(await page.locator('#overlay').isVisible(),false);
 // Sweep the full reachable target region, without peeking into game internals.
 const box=await page.locator('#game').boundingBox();
 for(let y=.28;y<.72;y+=.07){for(let x=.16;x<.85;x+=.07){await page.mouse.move(box.x+x*box.width,box.y+y*box.height);await page.clock.runFor(20);}}
 assert.ok(Number(await page.locator('#score').innerText())>0,'mouse collects a seed');
 await page.getByRole('button',{name:'Pause',exact:false}).click();const time=await page.locator('#timer').innerText();await page.clock.runFor(3000);assert.equal(await page.locator('#timer').innerText(),time);
 await page.getByRole('button',{name:'Resume'}).click();await page.locator('#demo-hr').check();await page.clock.runFor(1100);assert.match(await page.locator('#hr-source').innerText(),/SIMULATED/);assert.ok(Number(await page.locator('#bpm').innerText())>0);
 await page.locator('#demo-hr').uncheck();assert.equal(await page.locator('#bpm').innerText(),'—');
 await page.locator('h1').click();await page.keyboard.down('Space');await page.clock.runFor(100);assert.match(await page.locator('#input-status').innerText(),/DUCKING/);await page.keyboard.up('Space');
 await page.clock.runFor(61000);assert.equal(await page.locator('#overlay').isVisible(),true);assert.match(await page.locator('#overlay h2').innerText(),/points/);
 await page.mouse.move(1,1);await page.getByRole('button',{name:'Play again'}).click();assert.equal(await page.locator('#score').innerText(),'000');
 await page.getByRole('button',{name:'Pause',exact:false}).click();await page.screenshot({path:'screenshot-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.clock.runFor(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'screenshot-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: collection, pause, simulated HR, duck, round completion, restart, responsive layout, no runtime errors');
} finally {await browser.close();}
