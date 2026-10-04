const canvas = document.getElementById('radar');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const ui = {callsign:$('callsign'),range:$('range'),heading:$('heading'),score:$('score'),selected:$('selectedHeading'),pointer:$('dialPointer'),dial:$('dial'),message:$('message'),messageText:$('messageText'),note:$('commandNote'),overlay:$('overlay'),modalKicker:$('modalKicker'),modalTitle:$('modalTitle'),modalText:$('modalText'),modalInfo:$('modalInfo'),modalButton:$('modalButton'),radarState:$('radarState')};
const runway = {x:0.78,y:0.52,halfWidth:.047};
const runwayPositions = [{x:.78,y:.52},{x:.75,y:.36},{x:.82,y:.65},{x:.72,y:.46},{x:.8,y:.58},{x:.76,y:.31},{x:.79,y:.69}];
const wind = {y:0,base:0,target:0,max:0,knots:0,nextShift:0,lastDisplay:0};
const requiredLocSeconds=7;
let selected = 90, plane, score = 0, landings = 0, misses = 0, playing = false, lastTime = 0, sweep = 0, messageUntil = 0, nextCallsign = 0, elapsed = 0;
const voiceSupported='speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let voiceEnabled=voiceSupported;
const callsigns = ['SIM 204','SIM 731','SIM 118','SIM 562','SIM 426','SIM 083','SIM 319'];
const aircraftTypes = [
  {key:'helicopter',name:'ヘリコプター',speed:.014,turnRate:62,traits:'低速 / 旋回速い'},
  {key:'light',name:'小型機',speed:.019,turnRate:38,traits:'中速 / 旋回標準'},
  {key:'heavy',name:'大型機',speed:.024,turnRate:23,traits:'高速 / 旋回遅い'}
];
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const norm = a=>(a%360+360)%360;
const rad = a=>a*Math.PI/180;
const fmt = a=>String(Math.round(norm(a))).padStart(3,'0');
const radioDigits=['ZERO','WUN','TOO','TREE','FOWER','FIFE','SIX','SEVEN','AIT','NINER'];
const radioHeading = a=>fmt(a).split('').map(d=>radioDigits[Number(d)]).join(' ');
function approachHalfWidth(completed){
  if(completed<=4)return .047-completed*.004;
  return .032+.004*Math.sin(completed*1.7);
}
function setSelected(a){selected=norm(Math.round(a));ui.selected.textContent=fmt(selected);ui.pointer.style.transform=`rotate(${selected+180}deg)`;ui.dial.setAttribute('aria-valuenow',selected)}
function speak(t){
  if(!voiceEnabled)return;
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(t);
  utterance.lang='en-US';utterance.rate=.94;utterance.pitch=.88;
  window.speechSynthesis.speak(utterance);
}
function showMessage(t,seconds=4,spoken=t){ui.messageText.textContent=t;ui.message.style.opacity='1';messageUntil=performance.now()+seconds*1000;speak(spoken)}
function courseAdvisory(){
  const offset=plane.y-runway.y,absolute=Math.abs(offset);
  let phrase;
  if(absolute<localizerWidth())phrase='ON COURSE.';
  else{
    const side=offset<0?'LEFT':'RIGHT';
    const degree=absolute>runway.halfWidth*1.5?'WELL':'SLIGHTLY';
    const correcting=plane.lastCourseAbs!==null&&absolute<plane.lastCourseAbs-.006;
    phrase=`${degree} ${side} OF COURSE${correcting?' AND CORRECTING':''}.`;
  }
  plane.lastCourseAbs=absolute;
  showMessage(phrase,5);
}
function localizerWidth(){return Math.max(.018,runway.halfWidth*.7)}
function updateWindDisplay(){
  wind.knots=Math.round(Math.abs(wind.y)/.00045);
  $('wind').textContent=wind.knots>=2?`DRIFT ${wind.y<0?'↑':'↓'} ${String(wind.knots).padStart(2,'0')} KT`:'DRIFT VARIABLE';
  $('wind').classList.toggle('gust',wind.knots>=12);
}
function updateWind(dt,t){
  if(t>=wind.nextShift){
    const direction=(Math.random()<.75?-1:1)*Math.sign(wind.target||1);
    wind.target=direction*wind.max*(.4+Math.random()*.6);
    wind.nextShift=t+4000+Math.random()*3000;
  }
  const change=wind.max*.75*dt;
  wind.base+=clamp(wind.target-wind.base,-change,change);
  wind.y=clamp(wind.base+wind.max*.14*Math.sin(t*.002),-wind.max,wind.max);
  if(t-wind.lastDisplay>250){updateWindDisplay();wind.lastDisplay=t}
}
function updateLocalizer(dt){
  const inFinal=plane.x>=runway.x-.44&&plane.x<runway.x-.02;
  const onCenter=Math.abs(plane.y-runway.y)<localizerWidth();
  const aligned=Math.abs(((plane.h-90+540)%360)-180)<35;
  if(inFinal&&onCenter&&aligned)plane.locSeconds+=dt;
  const state=plane.locSeconds>=requiredLocSeconds?'ESTABLISHED':!inFinal?'ACQUIRE':onCenter&&!aligned?'ALIGN HEADING':onCenter?'ON COURSE':'CORRECT COURSE';
  $('locStatus').textContent=`LOC · ${state} ${Math.min(requiredLocSeconds,plane.locSeconds).toFixed(1)} / ${requiredLocSeconds}s`;
  $('locStatus').classList.toggle('established',plane.locSeconds>=requiredLocSeconds);
}
function modal(kicker,title,text,info,button,action){ui.modalKicker.textContent=kicker;ui.modalTitle.textContent=title;ui.modalText.textContent=text;ui.modalInfo.innerHTML=info;ui.modalButton.textContent=button;ui.modalButton.onclick=action;ui.overlay.hidden=false}
function newPlane(){
  const position=runwayPositions[landings%runwayPositions.length];
  runway.x=position.x;runway.y=position.y;
  runway.halfWidth=approachHalfWidth(landings);
  $('gateWidth').textContent=`GATE ${Math.round(runway.halfWidth/.047*100)}%`;
  wind.max=Math.min(.0045+landings*.00055,.0078);
  wind.y=(Math.random()<.5?-1:1)*wind.max*(.45+Math.random()*.35);
  wind.base=wind.y;
  wind.target=wind.y;
  wind.nextShift=performance.now()+3000+Math.random()*2000;
  wind.lastDisplay=0;
  updateWindDisplay();
  const variant=nextCallsign++%4;
  const starts=[{x:.08,y:clamp(runway.y-.26,.08,.92),h:115},{x:.12,y:clamp(runway.y+.25,.08,.92),h:65},{x:.16,y:clamp(runway.y-.34,.08,.92),h:130},{x:.15,y:clamp(runway.y+.33,.08,.92),h:50}];
  const s=starts[variant];
  const type=aircraftTypes[Math.floor(Math.random()*aircraftTypes.length)];
  plane={x:s.x,y:s.y,h:s.h,target:s.h,call:callsigns[(nextCallsign-1)%callsigns.length],type,trail:[],speed:type.speed+Math.min(landings,6)*.0008,lastTrail:0,lastCourseCall:performance.now(),lastCommandAt:0,lastCourseAbs:null,locSeconds:0};
  $('locStatus').textContent=`LOC · ACQUIRE 0.0 / ${requiredLocSeconds}s`;
  $('locStatus').classList.remove('established');
  $('aircraftType').textContent=type.name;
  setSelected(Math.round(s.h/5)*5);
  ui.note.textContent=`${type.name}：${type.traits}。風向と強さは変動します`;
  const contact=`RADAR CONTACT. DRIFT ${wind.y<0?'NORTH':'SOUTH'}, ${wind.knots} KNOTS.`;
  const spokenCall=plane.call.replace(/\d{3}/,digits=>digits.split('').map(d=>radioDigits[Number(d)]).join(' '));
  showMessage(`${plane.call}, ${contact}`,5,`${spokenCall}, ${contact}`);
}
function start(){score=0;landings=0;misses=0;nextCallsign=0;elapsed=0;$('clock').textContent='00:00';ui.overlay.hidden=true;playing=true;newPlane();lastTime=performance.now();requestAnimationFrame(frame)}
function end(success,reason='MISSED APPROACH.'){
  playing=false;
  if(success){landings++;const locBonus=Math.round(Math.min(plane.locSeconds,25)*10),points=Math.max(100,500-Math.round(plane.trail.length*.7))+locBonus;score+=points;showMessage('OVER LANDING THRESHOLD. TOUCHDOWN.',10);setTimeout(()=>{if(!playing)modal('TOUCHDOWN','着陸成功',`${plane.call} を滑走路へ安全に誘導しました。` ,`コース維持 <strong>${plane.locSeconds.toFixed(1)}秒</strong>　ボーナス <strong>+${locBonus}</strong><br>獲得スコア <strong>${String(score).padStart(4,'0')}</strong>　着陸機数 <strong>${landings}</strong>`,`次の機体 →`,()=>{ui.overlay.hidden=true;playing=true;newPlane();lastTime=performance.now();requestAnimationFrame(frame)})},650)}
  else{misses++;showMessage(reason,10);setTimeout(()=>{if(!playing)modal('MISSED APPROACH','進入失敗',reason==='LOCALIZER NOT ESTABLISHED.'?'進入コースを十分に維持できませんでした。センターライン上を7秒間飛行してください。':`${plane.call} が管制空域を離れました。もう一度誘導に挑戦してください。`,`累計スコア <strong>${String(score).padStart(4,'0')}</strong>　着陸機数 <strong>${landings}</strong>`,`やり直す →`,start)},650)}
}
function update(dt,t){
  if(!plane||!playing||!ui.overlay.hidden)return;
  elapsed+=dt;$('clock').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;
  updateWind(dt,t);
  const diff=((plane.target-plane.h+540)%360)-180;
  plane.h=norm(plane.h+clamp(diff,-plane.type.turnRate*dt,plane.type.turnRate*dt));
  plane.x+=Math.sin(rad(plane.h))*plane.speed*dt;
  plane.y-=Math.cos(rad(plane.h))*plane.speed*dt;
  plane.y+=wind.y*dt;
  updateLocalizer(dt);
  if(t-plane.lastTrail>180){plane.trail.push({x:plane.x,y:plane.y});if(plane.trail.length>90)plane.trail.shift();plane.lastTrail=t}
  const dx=runway.x-plane.x,dy=runway.y-plane.y;
  const dist=Math.hypot(dx,dy);
  // The runway is approached from the west, on an eastbound heading.
  if(plane.x>=runway.x-.02){
    const onRunway=plane.x<runway.x+.016&&Math.abs(dy)<runway.halfWidth&&Math.abs(((plane.h-90+540)%360)-180)<27;
    end(onRunway&&plane.locSeconds>=requiredLocSeconds,onRunway?'LOCALIZER NOT ESTABLISHED.':'MISSED APPROACH.');return;
  }
  if(plane.x<-.07||plane.x>1.08||plane.y<-.1||plane.y>1.1){end(false);return}
  if(plane.x>runway.x-.5&&t-plane.lastCourseCall>=4000&&t-plane.lastCommandAt>=2500){courseAdvisory();plane.lastCourseCall=t}
  ui.range.textContent=(dist*22).toFixed(1);ui.heading.textContent=fmt(plane.h);ui.callsign.textContent=plane.call;ui.score.textContent=String(score).padStart(4,'0');
}
function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);ctx.setTransform(d,0,0,d,0,0)}
function drawAircraftSymbol(type){
  ctx.beginPath();
  if(type==='helicopter'){
    ctx.ellipse(0,0,3,6,0,0,Math.PI*2);
    ctx.moveTo(-9,-2);ctx.lineTo(9,-2);
    ctx.moveTo(0,6);ctx.lineTo(0,10);
  }else if(type==='heavy'){
    ctx.moveTo(0,-11);ctx.lineTo(2,-2);ctx.lineTo(10,4);ctx.lineTo(10,7);ctx.lineTo(2,5);ctx.lineTo(2,10);ctx.lineTo(-2,10);ctx.lineTo(-2,5);ctx.lineTo(-10,7);ctx.lineTo(-10,4);ctx.lineTo(-2,-2);ctx.closePath();
  }else{
    ctx.moveTo(0,-9);ctx.lineTo(5,6);ctx.lineTo(0,3);ctx.lineTo(-5,6);ctx.closePath();
  }
  if(type==='helicopter'){ctx.strokeStyle='#d1ffbf';ctx.lineWidth=2;ctx.stroke()}else ctx.fill();
}
function draw(t){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;ctx.clearRect(0,0,w,h);ctx.fillStyle='#07170e';ctx.fillRect(0,0,w,h);
  const cx=w*.5,cy=h*.52,R=Math.min(w,h)*.43;
  ctx.save();ctx.strokeStyle='#315d3a';ctx.lineWidth=1;for(let i=1;i<=4;i++){ctx.beginPath();ctx.arc(cx,cy,R*i/4,0,Math.PI*2);ctx.stroke()}
  ctx.strokeStyle='#244a31';ctx.beginPath();ctx.moveTo(cx-R-25,cy);ctx.lineTo(cx+R+25,cy);ctx.moveTo(cx,cy-R-25);ctx.lineTo(cx,cy+R+25);ctx.stroke();
  const locStart=(runway.x-.44)*w,locEnd=runway.x*w,locHalf=localizerWidth()*h;
  ctx.fillStyle='#84d58a12';ctx.fillRect(locStart,runway.y*h-locHalf,locEnd-locStart,locHalf*2);
  ctx.setLineDash([3,6]);ctx.strokeStyle='#527f59';ctx.beginPath();ctx.moveTo(locStart,runway.y*h-locHalf);ctx.lineTo(locEnd,runway.y*h-locHalf);ctx.moveTo(locStart,runway.y*h+locHalf);ctx.lineTo(locEnd,runway.y*h+locHalf);ctx.stroke();
  ctx.setLineDash([4,6]);ctx.strokeStyle='#73af79';ctx.beginPath();ctx.moveTo(w*.12,runway.y*h);ctx.lineTo(runway.x*w,runway.y*h);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#8cb593';ctx.font='10px DM Mono, monospace';ctx.fillText('FINAL COURSE 090°',w*.12,runway.y*h-11);ctx.fillText('5 NM',cx+R*.25,cy-4);ctx.fillText('10 NM',cx+R*.73,cy-4);
  const halfGate=runway.halfWidth*h;
  ctx.fillStyle='#d3f7bb';ctx.fillRect(runway.x*w-2,runway.y*h-halfGate,5,halfGate*2);ctx.fillStyle='#a2d89a';ctx.fillText('RWY 09',runway.x*w-16,runway.y*h-halfGate-8);
  sweep=(t*.00035)%(Math.PI*2);const grad=ctx.createConicGradient(sweep,cx,cy);grad.addColorStop(0,'#9df6a900');grad.addColorStop(.94,'#9df6a900');grad.addColorStop(1,'#9df6a924');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#92e69b44';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(sweep)*R,cy+Math.sin(sweep)*R);ctx.stroke();ctx.restore();
  if(plane){ctx.save();plane.trail.forEach((p,i)=>{ctx.fillStyle=`rgba(174,236,158,${i/plane.trail.length*.45})`;ctx.fillRect(p.x*w-1,p.y*h-1,2,2)});const x=plane.x*w,y=plane.y*h;ctx.translate(x,y);ctx.rotate(rad(plane.h));ctx.shadowBlur=16;ctx.shadowColor='#c4ffb7';ctx.fillStyle='#d1ffbf';drawAircraftSymbol(plane.type.key);ctx.shadowBlur=0;ctx.restore();const drift=wind.y*h*12,arrowX=x-18,arrowY=y+drift;ctx.strokeStyle='#f1ab6b';ctx.fillStyle='#f1ab6b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(arrowX,y);ctx.lineTo(arrowX,arrowY);ctx.stroke();ctx.beginPath();ctx.moveTo(arrowX,arrowY);ctx.lineTo(arrowX-4,arrowY-(drift<0?-6:6));ctx.lineTo(arrowX+4,arrowY-(drift<0?-6:6));ctx.closePath();ctx.fill();ctx.strokeStyle='#a6dba2';ctx.beginPath();ctx.moveTo(x+8,y-8);ctx.lineTo(x+21,y-21);ctx.lineTo(x+69,y-21);ctx.stroke();ctx.fillStyle='#d5f4cb';ctx.font='11px DM Mono, monospace';ctx.fillText(plane.call,x+24,y-26)}
  ui.radarState.textContent=`SCAN ${String(Math.floor(t/3600)%99).padStart(2,'0')}`;
}
function frame(t){const dt=Math.min((t-lastTime)/1000,.06);lastTime=t;update(dt,t);draw(t);if(t>messageUntil)ui.message.style.opacity='.35';if(playing)requestAnimationFrame(frame)}
function dialFromPointer(e){const r=ui.dial.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;setSelected(Math.atan2(x,-y)*180/Math.PI)}
ui.dial.addEventListener('pointerdown',e=>{ui.dial.setPointerCapture(e.pointerId);dialFromPointer(e)});ui.dial.addEventListener('pointermove',e=>{if(ui.dial.hasPointerCapture(e.pointerId))dialFromPointer(e)});
ui.dial.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key)){e.preventDefault();setSelected(selected+(e.key==='ArrowLeft'||e.key==='ArrowDown'?-5:5))}});
$('minus').onclick=()=>setSelected(selected-5);$('plus').onclick=()=>setSelected(selected+5);
$('issue').onclick=()=>{if(!playing||!ui.overlay.hidden)return;plane.target=selected;plane.lastCommandAt=performance.now();const spoken=`HEADING ${radioHeading(selected)}.`;ui.note.textContent=`PRONUNCIATION: ${radioHeading(selected)}`;showMessage(`HEADING ${fmt(selected)}.`,3,spoken)};
$('voiceButton').onclick=()=>{voiceEnabled=!voiceEnabled;$('voiceButton').textContent=voiceEnabled?'VOICE ON':'VOICE OFF';$('voiceButton').setAttribute('aria-pressed',String(voiceEnabled));if(!voiceEnabled&&voiceSupported)window.speechSynthesis.cancel()};
if(!voiceSupported){$('voiceButton').hidden=true;$('voiceButton').setAttribute('aria-pressed','false')}
$('helpButton').onclick=()=>modal('HOW TO PLAY','遊び方','レーダーの機体を滑走路 RWY 09 へ誘導する、シンプルな管制ゲームです。','① ダイヤルでヘディングを選択し、指示を送信<br>② 点線に挟まれた進入コースで機体を東向きに整える<br>③ コース内を合計7秒飛び、滑走路へ進入<br><br>GCA は ON COURSE や LEFT OF COURSE などを約4秒ごとに通知します。LOC はコース維持時間です。風は飛行中も変わります。オレンジの矢印は風によって流される方向と強さを示します。','ゲームに戻る →',()=>{ui.overlay.hidden=true;lastTime=performance.now()});
window.addEventListener('resize',()=>{resize();draw(performance.now())});
setSelected(90);resize();draw(0);
modal('BRIEFING','管制を開始','あなたは最終進入を担当する管制官。レーダー上の航空機に針路を指示し、滑走路へ導いてください。','目標：点線で囲まれた進入コースを合計 <strong>7秒</strong> 飛行させ、西側から滑走路へ進入。<br>ダイヤルを回し「指示を送信」をタップします。','管制を開始 →',start);
