const canvas = document.getElementById('radar');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const ui = {callsign:$('callsign'),range:$('range'),heading:$('heading'),score:$('score'),selected:$('selectedHeading'),pointer:$('dialPointer'),dial:$('dial'),message:$('message'),messageText:$('messageText'),note:$('commandNote'),overlay:$('overlay'),modalKicker:$('modalKicker'),modalTitle:$('modalTitle'),modalText:$('modalText'),modalInfo:$('modalInfo'),modalButton:$('modalButton'),radarState:$('radarState')};
const runway = {x:0.78,y:0.52};
let selected = 90, plane, score = 0, landings = 0, misses = 0, playing = false, lastTime = 0, sweep = 0, messageUntil = 0, nextCallsign = 0, elapsed = 0;
const callsigns = ['SIM 204','SIM 731','SIM 118','SIM 562','SIM 426','SIM 083','SIM 319'];
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const norm = a=>(a%360+360)%360;
const rad = a=>a*Math.PI/180;
const fmt = a=>String(Math.round(norm(a))).padStart(3,'0');
function setSelected(a){selected=norm(Math.round(a));ui.selected.textContent=fmt(selected);ui.pointer.style.transform=`rotate(${selected+180}deg)`;ui.dial.setAttribute('aria-valuenow',selected)}
function showMessage(t,seconds=4){ui.messageText.textContent=t;ui.message.style.opacity='1';messageUntil=performance.now()+seconds*1000}
function modal(kicker,title,text,info,button,action){ui.modalKicker.textContent=kicker;ui.modalTitle.textContent=title;ui.modalText.textContent=text;ui.modalInfo.innerHTML=info;ui.modalButton.textContent=button;ui.modalButton.onclick=action;ui.overlay.hidden=false}
function newPlane(){
  const variant=nextCallsign++%4;
  const starts=[{x:.12,y:.19,h:115},{x:.14,y:.76,h:55},{x:.4,y:.11,h:145},{x:.35,y:.89,h:45}];
  const s=starts[variant];
  plane={x:s.x,y:s.y,h:s.h,target:s.h,call:callsigns[(nextCallsign-1)%callsigns.length],trail:[],speed:.037+Math.min(landings,6)*.002,lastTrail:0};
  setSelected(Math.round(s.h/5)*5);showMessage(`${plane.call}、レーダー捕捉。針路を指示してください。`,5);
}
function start(){score=0;landings=0;misses=0;nextCallsign=0;elapsed=0;$('clock').textContent='00:00';ui.overlay.hidden=true;playing=true;newPlane();lastTime=performance.now();requestAnimationFrame(frame)}
function end(success){
  playing=false;
  if(success){landings++;const points=Math.max(100,500-Math.round(plane.trail.length*.7));score+=points;showMessage(`${plane.call}、着陸成功。+${points}点`,10);setTimeout(()=>{if(!playing)modal('TOUCHDOWN','着陸成功',`${plane.call} を滑走路へ安全に誘導しました。` ,`獲得スコア <strong>${String(score).padStart(4,'0')}</strong>　着陸機数 <strong>${landings}</strong>`,`次の機体 →`,()=>{ui.overlay.hidden=true;playing=true;newPlane();lastTime=performance.now();requestAnimationFrame(frame)})},650)}
  else{misses++;showMessage(`${plane.call}、進入失敗。`,10);setTimeout(()=>{if(!playing)modal('MISSED APPROACH','進入失敗',`${plane.call} が管制空域を離れました。もう一度誘導に挑戦してください。`,`累計スコア <strong>${String(score).padStart(4,'0')}</strong>　着陸機数 <strong>${landings}</strong>`,`やり直す →`,start)},650)}
}
function update(dt,t){
  if(!plane||!playing||!ui.overlay.hidden)return;
  elapsed+=dt;$('clock').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;
  const diff=((plane.target-plane.h+540)%360)-180;
  plane.h=norm(plane.h+clamp(diff,-36*dt,36*dt));
  plane.x+=Math.sin(rad(plane.h))*plane.speed*dt;
  plane.y-=Math.cos(rad(plane.h))*plane.speed*dt;
  if(t-plane.lastTrail>180){plane.trail.push({x:plane.x,y:plane.y});if(plane.trail.length>90)plane.trail.shift();plane.lastTrail=t}
  const dx=runway.x-plane.x,dy=runway.y-plane.y;
  const dist=Math.hypot(dx,dy);
  // The runway is approached from the west, on an eastbound heading.
  if(dist<.047){end(plane.x<runway.x+.016&&Math.abs(plane.y-runway.y)<.047&&Math.abs(((plane.h-90+540)%360)-180)<27);return}
  if(plane.x<-.07||plane.x>1.08||plane.y<-.1||plane.y>1.1){end(false);return}
  ui.range.textContent=(dist*22).toFixed(1);ui.heading.textContent=fmt(plane.h);ui.callsign.textContent=plane.call;ui.score.textContent=String(score).padStart(4,'0');
}
function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);ctx.setTransform(d,0,0,d,0,0)}
function draw(t){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;ctx.clearRect(0,0,w,h);ctx.fillStyle='#07170e';ctx.fillRect(0,0,w,h);
  const cx=w*.5,cy=h*.52,R=Math.min(w,h)*.43;
  ctx.save();ctx.strokeStyle='#315d3a';ctx.lineWidth=1;for(let i=1;i<=4;i++){ctx.beginPath();ctx.arc(cx,cy,R*i/4,0,Math.PI*2);ctx.stroke()}
  ctx.strokeStyle='#244a31';ctx.beginPath();ctx.moveTo(cx-R-25,cy);ctx.lineTo(cx+R+25,cy);ctx.moveTo(cx,cy-R-25);ctx.lineTo(cx,cy+R+25);ctx.stroke();
  ctx.setLineDash([4,6]);ctx.strokeStyle='#3b6844';ctx.beginPath();ctx.moveTo(w*.12,runway.y*h);ctx.lineTo(runway.x*w,runway.y*h);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#8cb593';ctx.font='10px DM Mono, monospace';ctx.fillText('FINAL COURSE 090°',w*.12,runway.y*h-11);ctx.fillText('5 NM',cx+R*.25,cy-4);ctx.fillText('10 NM',cx+R*.73,cy-4);
  ctx.fillStyle='#d3f7bb';ctx.fillRect(runway.x*w-2,runway.y*h-16,5,32);ctx.fillStyle='#a2d89a';ctx.fillText('RWY 09',runway.x*w-16,runway.y*h-23);
  sweep=(t*.00035)%(Math.PI*2);const grad=ctx.createConicGradient(sweep,cx,cy);grad.addColorStop(0,'#9df6a900');grad.addColorStop(.94,'#9df6a900');grad.addColorStop(1,'#9df6a924');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#92e69b44';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(sweep)*R,cy+Math.sin(sweep)*R);ctx.stroke();ctx.restore();
  if(plane){ctx.save();plane.trail.forEach((p,i)=>{ctx.fillStyle=`rgba(174,236,158,${i/plane.trail.length*.45})`;ctx.fillRect(p.x*w-1,p.y*h-1,2,2)});const x=plane.x*w,y=plane.y*h;ctx.translate(x,y);ctx.rotate(rad(plane.h));ctx.shadowBlur=16;ctx.shadowColor='#c4ffb7';ctx.fillStyle='#d1ffbf';ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(5,6);ctx.lineTo(0,3);ctx.lineTo(-5,6);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.restore();ctx.strokeStyle='#a6dba2';ctx.beginPath();ctx.moveTo(x+8,y-8);ctx.lineTo(x+21,y-21);ctx.lineTo(x+69,y-21);ctx.stroke();ctx.fillStyle='#d5f4cb';ctx.font='11px DM Mono, monospace';ctx.fillText(plane.call,x+24,y-26)}
  ui.radarState.textContent=`SCAN ${String(Math.floor(t/3600)%99).padStart(2,'0')}`;
}
function frame(t){const dt=Math.min((t-lastTime)/1000,.06);lastTime=t;update(dt,t);draw(t);if(t>messageUntil)ui.message.style.opacity='.35';if(playing)requestAnimationFrame(frame)}
function dialFromPointer(e){const r=ui.dial.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;setSelected(Math.atan2(x,-y)*180/Math.PI)}
ui.dial.addEventListener('pointerdown',e=>{ui.dial.setPointerCapture(e.pointerId);dialFromPointer(e)});ui.dial.addEventListener('pointermove',e=>{if(ui.dial.hasPointerCapture(e.pointerId))dialFromPointer(e)});
ui.dial.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key)){e.preventDefault();setSelected(selected+(e.key==='ArrowLeft'||e.key==='ArrowDown'?-5:5))}});
$('minus').onclick=()=>setSelected(selected-5);$('plus').onclick=()=>setSelected(selected+5);
$('issue').onclick=()=>{if(!playing)return;plane.target=selected;ui.note.textContent=`${plane.call}：了解、ヘディング ${fmt(selected)}°`;showMessage(`${plane.call}、ヘディング ${fmt(selected)}°。`,3)};
$('helpButton').onclick=()=>modal('HOW TO PLAY','遊び方','レーダーの機体を滑走路 RWY 09 へ誘導する、シンプルな管制ゲームです。','① ダイヤルでヘディングを選択<br>②「指示を送信」を押す<br>③ 滑走路へ西側から、東向き（090°）に進入させる<br><br>機体はゆっくり旋回します。早めの指示が成功の鍵です。','ゲームに戻る →',()=>{ui.overlay.hidden=true;lastTime=performance.now()});
window.addEventListener('resize',()=>{resize();draw(performance.now())});
setSelected(90);resize();draw(0);
modal('BRIEFING','管制を開始','あなたは最終進入を担当する管制官。レーダー上の航空機に針路を指示し、滑走路へ導いてください。','目標：西側から滑走路へ、ヘディング <strong>090°</strong> で進入。<br>ダイヤルを回し「指示を送信」をタップします。','管制を開始 →',start);
