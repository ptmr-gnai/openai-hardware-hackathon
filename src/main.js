import './style.css';
import {Round,clamp,parseHeartRate,parseWand} from './engine.js';
import {CameraInput} from './camera.js';
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d'),round=new Round();
let w=800,h=490,paused=false,last=0,mouse=null,keyDuck=false,mode='mouse',sound=false,audio;
let feedback='',feedbackUntil=0,particles=[],camera=null,wand=null,wandLast=0,port=null,reader=null;
let device=null,characteristic=null,bpm=null,hrLast=0,hrDemo=false,hrHistory=[];
function notice(message) { $('notice').textContent=message; $('notice').style.display='block'; clearTimeout(notice.timeout); notice.timeout=setTimeout(()=>$('notice').style.display='none',6500); }
function resize() { const r=canvas.getBoundingClientRect(); w=r.width;h=r.height; canvas.width=w*devicePixelRatio;canvas.height=h*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); }
new ResizeObserver(resize).observe(canvas);
function setMode(next) { mode=next; $('mode-label').textContent=next==='camera'?'WEBCAM · BODY TRACKING':next==='wand'?'STICKS3 · USB WAND':'MOUSE + KEYBOARD'; }
function tone(freq=600) { if(!sound)return; try { audio??=new AudioContext(); const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=freq;g.gain.setValueAtTime(.06,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.15);o.start();o.stop(audio.currentTime+.15); }catch{} }
function begin() { round.start();$('score').textContent='000';$('timer').innerHTML='60<span>s</span>';$('streak').textContent='×0'; paused=false;particles=[];hrHistory=[];feedback='';$('overlay').hidden=true;$('pause').disabled=false;$('pause').textContent='Ⅱ Pause';last=performance.now(); }
$('start').onclick=begin;
function pause(value=!paused) { if(!round.active)return; paused=value;$('pause').textContent=paused?'▶ Resume':'Ⅱ Pause';$('cue').textContent=paused?'Take your time. Resume when you’re ready.':'Back to your flow.'; }
$('pause').onclick=()=>pause();
$('sound').onclick=()=> { sound=!sound; $('sound').textContent=sound?'♫ Sound on':'♫ Sound off';$('sound').setAttribute('aria-pressed',sound);if(sound)tone(); };
canvas.addEventListener('pointermove',e=> {const r=canvas.getBoundingClientRect();mouse={x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)};});
canvas.addEventListener('pointerleave',()=>mouse=null);
window.addEventListener('keydown',e=> {if(['INPUT','BUTTON','SUMMARY'].includes(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();keyDuck=true;}if(e.code==='Escape')pause();});
window.addEventListener('keyup',e=>{if(e.code==='Space')keyDuck=false;});
window.addEventListener('blur',()=>{keyDuck=false;if(round.active)pause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&round.active)pause(true);});
$('camera').onclick=async()=> {
  if(camera?.running)return;
  $('camera').disabled=true;
  try {
    camera=new CameraInput($('preview'),s=>$('camera-status').textContent=s);
    await camera.start();setMode('camera');$('preview-wrap').hidden=false;$('camera-dot').classList.add('on');$('camera').textContent='Webcam enabled';notice('Stand upright with your head and hands visible for calibration.');
  }catch(e){$('camera-status').textContent='Camera unavailable · mouse still works';notice(`Could not start camera: ${e.message}`);$('camera').disabled=false;}
};
$('calibrate').onclick=()=>camera?.calibrate();
$('camera-off').onclick=()=> {camera?.stop();camera=null;setMode('mouse');$('preview-wrap').hidden=true;$('camera-dot').classList.remove('on');$('camera').disabled=false;$('camera').innerHTML='Enable webcam <span>+</span>';$('camera-status').textContent='Mouse + keyboard active';};
function clearHr() { bpm=null;hrLast=0;$('bpm').textContent='—';$('hr-dot').classList.remove('on'); }
function receiveHr(value) {bpm=value;hrLast=performance.now();$('bpm').textContent=value;$('hr-dot').classList.add('on');if(round.active&&!paused)hrHistory.push(value);}
function disconnected() {characteristic=null;device=null;clearHr();$('polar').disabled=false;$('polar').innerHTML='Connect Polar H10 <span>+</span>';$('hr-status').textContent='Disconnected · reconnect to resume';}
$('polar').onclick=async()=> {
  if(device?.gatt?.connected) {device.gatt.disconnect();return;}
  if(!navigator.bluetooth){notice('Web Bluetooth needs supported Chrome / Edge on your local computer. Simulated heart rate works here.');return;}
  $('polar').disabled=true;
  try {
    device=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'Polar H10'}],optionalServices:['heart_rate']});
    device.addEventListener('gattserverdisconnected',disconnected,{once:true});
    const server=await device.gatt.connect();const service=await server.getPrimaryService('heart_rate');characteristic=await service.getCharacteristic('heart_rate_measurement');
    characteristic.addEventListener('characteristicvaluechanged',e=>{try{receiveHr(parseHeartRate(e.target.value));}catch{notice('Incomplete heart-rate packet ignored.');}});
    hrDemo=false;hrHistory=[];$('demo-hr').checked=false;clearHr();
    await characteristic.startNotifications();$('hr-status').textContent='Connected · waiting for heartbeat';$('hr-source').textContent='LIVE · POLAR H10';$('polar').textContent='Disconnect Polar H10';
  }catch(e){device?.gatt?.disconnect();device=null;$('hr-status').textContent='Not connected';notice(e.name==='NotFoundError'?'No sensor selected. Wear the H10 with dampened strap electrodes, then try again.':`Polar connection: ${e.message}`);}finally{$('polar').disabled=false;}
};
$('demo-hr').onchange=e=> {hrDemo=e.target.checked;hrHistory=[];if(hrDemo){device?.gatt?.disconnect();$('hr-source').textContent='SIMULATED · DEMO';$('hr-status').textContent='Simulated signal · not your heart rate';}else{clearHr();$('hr-source').textContent='LIVE HEART RATE';$('hr-status').textContent='Not connected';}};
$('wand').onclick=async()=> {
  if(!navigator.serial){notice('USB serial needs supported desktop Chrome / Edge on your laptop.');return;}
  if(port){notice('Wand already connected. Unplug it to disconnect.');return;}
  try {
    port=await navigator.serial.requestPort();await port.open({baudRate:115200});
    reader=port.readable.getReader();const decoder=new TextDecoder();let buffer='';$('wand-status').textContent='Connected · waiting for motion';
    while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();if(buffer.length>4096)buffer='';for(const line of lines){try{wand=parseWand(line);wandLast=performance.now();setMode('wand');$('wand-status').textContent='Streaming · tilt to aim';}catch{/* Ignore boot log lines. */}}}
  } catch(e){notice(`USB wand: ${e.message}`);}finally{reader?.releaseLock();reader=null;try{await port?.close();}catch{}port=null;wand=null;setMode(camera?.running?'camera':'mouse');$('wand-status').textContent='Disconnected';}
};
function finish() {
  $('pause').disabled=true;$('overlay').hidden=false;
  const avg=hrHistory.length?Math.round(hrHistory.reduce((a,b)=>a+b,0)/hrHistory.length):null;
  $('overlay').querySelector('.hero-symbol').textContent='✳';$('overlay').querySelector('.eyebrow').textContent='ONE GOOD MINUTE, WELL SPENT';$('overlay').querySelector('h2').innerHTML=`${round.score} points.<br>Nice moves.`;
  $('overlay').querySelector('p').textContent=`${round.hits} seeds · ${round.dodges} waves ducked · best streak ${round.best}${avg?` · ${hrDemo?'simulated ':''}avg ${avg} BPM`:''}`;
  $('start').innerHTML='Play again <span>↗</span>';$('start-hint').textContent='Take a breather. Come back when you’re ready.';
}
function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function draw(now,dt,hands,duck) {
  ctx.clearRect(0,0,w,h);
  const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#e4efdc');g.addColorStop(1,'#cddfc5');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#bed0b2';ctx.lineWidth=1;
  for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(w*.5,h*.98,w*(.36+i*.18),h*(.18+i*.13),0,Math.PI,Math.PI*2);ctx.stroke();}
  for(let i=0;i<22;i++){const x=((i*173.7)%w),y=(i*67.3+Math.sin(now/2200+i)*9)%h;circle(x,y,1.4,'#afc49b66');}
  if(round.active) {
    if(round.wave){const p=round.wave.age/2.5;ctx.fillStyle=`rgba(190,124,65,${.08+p*.15})`;ctx.fillRect(0,h*.25,w,h*.37);ctx.strokeStyle='#b98955';ctx.setLineDash([8,7]);ctx.strokeRect(0,h*.25,w,h*.37);ctx.setLineDash([]);ctx.fillStyle='#8f613c';ctx.textAlign='center';ctx.font='500 24px "Space Grotesk",sans-serif';ctx.fillText(duck?'Nice and low. Hold it…':'Wave incoming — duck!',w/2,h*.43);ctx.fillRect(w*.3,h*.49,w*.4*p,3);}
    else if(round.target){const t=round.target,x=t.x*w,y=t.y*h;circle(x,y,36+Math.sin(now/230)*3,'#f7f8cc55');circle(x,y,25,'#fbf8b8');circle(x,y,15,'#e4bb5a');ctx.strokeStyle='#b28e3f';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,30,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-t.age/4));ctx.stroke();ctx.fillStyle='#fffcde';ctx.font='24px sans-serif';ctx.textAlign='center';ctx.fillText('✦',x,y+8);}
    for(const hand of hands){circle(hand.x*w,hand.y*h,19,'#375b3e22');circle(hand.x*w,hand.y*h,9,'#436449');ctx.strokeStyle='#f9fff0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(hand.x*w,hand.y*h,13,0,Math.PI*2);ctx.stroke();}
    const ax=w/2,ay=h-60;circle(ax,duck?ay+9:ay-12,8,'#728e63');ctx.strokeStyle='#728e63';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(ax,duck?ay+19:ay);ctx.lineTo(ax,ay+26);ctx.moveTo(ax-14,ay+40);ctx.lineTo(ax,ay+26);ctx.lineTo(ax+14,ay+40);ctx.moveTo(ax-20,duck?ay+23:ay+2);ctx.lineTo(ax,duck?ay+21:ay+8);ctx.lineTo(ax+20,duck?ay+23:ay+2);ctx.stroke();
    if(paused){ctx.fillStyle='#e3eedbdd';ctx.fillRect(0,85,w,h-125);ctx.fillStyle='#38583b';ctx.font='32px "Space Grotesk",sans-serif';ctx.textAlign='center';ctx.fillText('A moment to breathe.',w/2,h/2);}
    if(feedbackUntil>now&&!paused){ctx.fillStyle='#42643b';ctx.font='bold 21px "Space Grotesk",sans-serif';ctx.textAlign='center';ctx.fillText(feedback,w/2,135);}
  }
  if(!paused)particles=particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=80*dt;circle(p.x,p.y,3,`rgba(142,166,81,${clamp(p.life)})`);return p.life>0;});
}
let lastHrTick=0;
function frame(now){const dt=last?Math.min((now-last)/1000,.1):0;last=now;
  if(now-lastHrTick>1000){lastHrTick=now;if(hrDemo)receiveHr(Math.round(83+Math.sin(now/5000)*7+(round.active&&!paused?8:0)));else if(bpm&&now-hrLast>10000){clearHr();$('hr-status').textContent='Signal stale · check strap';}else if(bpm)$('hr-status').textContent='Connected · receiving heartbeat';}
  const cam=mode==='camera',usb=mode==='wand';let hands=cam?(camera?.fresh?camera.hands:[]):usb?(now-wandLast<600?[wand]:[]):mouse?[mouse]:[];
  const duck=cam?(camera?.fresh&&camera.duck):usb?(now-wandLast<600&&wand?.duck):keyDuck;
  if(round.active&&!paused){const prev=round.target?{...round.target}:null;for(const e of round.tick(dt,hands,duck)){
    if(e==='end')finish();
    if(e==='hit'){feedback=`+${10+Math.min(round.streak-1,5)*2} · lovely reach`;feedbackUntil=now+700;tone(600+round.streak*35);for(let i=0;i<12;i++)particles.push({x:prev.x*w,y:prev.y*h,vx:(Math.random()-.5)*160,vy:-Math.random()*120,life:1});}
    if(e==='dodge'){feedback='+25 · smooth duck';feedbackUntil=now+1200;tone(450);}
    if(e==='bump'){feedback='Wave passed. Keep flowing.';feedbackUntil=now+1500;}
  }}
  $('score').textContent=String(round.score).padStart(3,'0');$('timer').innerHTML=`${Math.ceil(60-round.elapsed)}<span>s</span>`;$('streak').textContent=`×${round.streak}`;
  if(round.active&&!paused)$('cue').textContent=round.wave?'Duck before the wave reaches you.':cam&&!camera?.fresh?'Stand in view and finish calibration.':'Reach either hand into the glow.';
  $('input-status').textContent=round.active?(paused?'Ⅱ PAUSED':duck?'↓ DUCKING':cam&&!camera?.fresh?'◎ FINDING YOU':'◎ IN THE FLOW'):'◎ READY TO MOVE';
  draw(now,dt,hands,duck);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
