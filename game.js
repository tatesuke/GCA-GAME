const canvas = document.getElementById('radar');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const ui = {callsign:$('callsign'),range:$('range'),heading:$('heading'),score:$('score'),maxScore:$('maxScore'),goAroundCount:$('goAroundCount'),selected:$('selectedHeading'),pointer:$('dialPointer'),dial:$('dial'),message:$('message'),messageText:$('messageText'),note:$('commandNote'),overlay:$('overlay'),modalKicker:$('modalKicker'),modalTitle:$('modalTitle'),modalText:$('modalText'),modalInfo:$('modalInfo'),modalButton:$('modalButton'),radarState:$('radarState')};
const runway = {x:.5,y:.5,heading:90,halfWidth:.047};
const camera = {x:.5,y:.5,zoom:1.3};
const approachStartDistance=.98,finalCourseLength=.85,rangeScale=10;
const wind = {cross:0,base:0,target:0,max:0,knots:0,nextShift:0,lastDisplay:0};
const requiredLocSeconds=7;
const narrowPointsPerSecond=20,broadPointsPerSecond=6;
const goAroundPenalty=100,sharpTurnPenalty=40;
let selected = 90, plane, score = 0, landings = 0, misses = 0, goArounds = 0, playing = false, lastTime = 0, sweep = 0, messageUntil = 0, nextCallsign = 0, elapsed = 0;
const maxScoreKey='gca.bestCompletedRun';
let maxScore=0;
try{
  const saved=JSON.parse(localStorage.getItem(maxScoreKey));
  const previousScore=typeof saved==='object'&&saved!==null?saved.score:saved;
  if(Number.isSafeInteger(previousScore)&&previousScore>=0)maxScore=previousScore;
}catch{}
function renderScore(){
  const current=Math.floor(score);
  ui.score.textContent=String(current).padStart(4,'0');
  ui.maxScore.textContent=String(maxScore).padStart(4,'0');
  ui.goAroundCount.textContent=String(goArounds);
}
function saveMaxScore(){try{localStorage.setItem(maxScoreKey,String(maxScore))}catch{}}
let penaltyToastTimer;
function showPenalty(text){
  const toast=$('penaltyToast');
  toast.textContent=text;
  toast.classList.add('show');
  clearTimeout(penaltyToastTimer);
  penaltyToastTimer=setTimeout(()=>toast.classList.remove('show'),2200);
}
const voiceSupported='speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let voiceEnabled=voiceSupported;
let activeRadio=null,radioQueue=[];
const callsigns = ['SIM 204','SIM 731','SIM 118','SIM 562','SIM 426','SIM 083','SIM 319'];
const aircraftTypes = [
  {key:'helicopter',name:'Helicopter',speed:.014,turnRate:62,traits:'Slow / Quick turns'},
  {key:'light',name:'Light plane',speed:.019,turnRate:38,traits:'Medium speed / Normal turns'},
  {key:'heavy',name:'Heavy plane',speed:.024,turnRate:23,traits:'Fast / Slow turns'}
];
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const norm = a=>(a%360+360)%360;
const rad = a=>a*Math.PI/180;
const coursePoint=(along,side=0)=>({x:runway.x+along*Math.sin(rad(runway.heading))+side*Math.cos(rad(runway.heading)),y:runway.y-along*Math.cos(rad(runway.heading))+side*Math.sin(rad(runway.heading))});
const coursePosition=(x,y)=>({along:(x-runway.x)*Math.sin(rad(runway.heading))-(y-runway.y)*Math.cos(rad(runway.heading)),side:(x-runway.x)*Math.cos(rad(runway.heading))+(y-runway.y)*Math.sin(rad(runway.heading))});
const headingError=a=>Math.abs(((a-runway.heading+540)%360)-180);
const fmt = a=>String(Math.round(norm(a))).padStart(3,'0');
const radioDigits=['ZERO','WUN','TOO','TREE','FOWER','FIFE','SIX','SEVEN','AIT','NINER'];
const radioHeading = a=>fmt(a).split('').map(d=>radioDigits[Number(d)]).join(' ');
function approachHalfWidth(completed){
  if(completed<=4)return .047-completed*.004;
  return .032+.004*Math.sin(completed*1.7);
}
function setSelected(a){selected=norm(Math.round(a));ui.selected.textContent=fmt(selected);ui.pointer.style.transform=`rotate(${selected+180}deg)`;ui.dial.setAttribute('aria-valuenow',selected)}
function displayMessage(entry){
  ui.messageText.textContent=entry.text;
  ui.message.style.opacity='1';
  messageUntil=performance.now()+entry.seconds*1000;
  entry.onStart?.();
}
function finishRadio(entry){
  if(activeRadio!==entry)return;
  activeRadio=null;
  entry.onFinished?.();
  playNextRadio();
}
function playNextRadio(){
  if(activeRadio||!radioQueue.length||!voiceEnabled)return;
  const entry=radioQueue.shift();
  activeRadio=entry;
  displayMessage(entry);
  const utterance=new SpeechSynthesisUtterance(entry.spoken);
  utterance.lang='en-US';utterance.rate=.94;utterance.pitch=.88;
  utterance.onend=()=>finishRadio(entry);
  utterance.onerror=()=>finishRadio(entry);
  try{window.speechSynthesis.speak(utterance)}catch{finishRadio(entry);return}
  setTimeout(()=>{if(activeRadio===entry){window.speechSynthesis.cancel();finishRadio(entry)}},10000);
}
function clearRadio(complete=false){
  const entries=[activeRadio,...radioQueue].filter(Boolean);
  activeRadio=null;radioQueue=[];
  if(voiceSupported)window.speechSynthesis.cancel();
  if(complete)entries.forEach(entry=>entry.onFinished?.());
}
function showMessage(t,seconds=4,spoken=t,onFinished,onStart,kind='general'){
  const entry={text:t,seconds,spoken,onFinished,onStart,kind};
  if(!voiceEnabled){displayMessage(entry);return false}
  if(kind==='heading')radioQueue=radioQueue.filter(waiting=>waiting.kind!=='heading');
  radioQueue.push(entry);
  playNextRadio();
  return true;
}
function releaseHeading(command){
  if(!playing||plane!==command.plane||plane.pendingHeading!==command)return;
  const wait=command.sentAt+1200-performance.now();
  if(wait>0){setTimeout(()=>releaseHeading(command),wait);return}
  plane.target=command.heading;
  plane.pendingHeading=null;
  ui.note.textContent=`EXECUTING HEADING ${fmt(command.heading)}°`;
}
function courseAdvisory(){
  const offset=coursePosition(plane.x,plane.y).side,absolute=Math.abs(offset);
  let course;
  if(absolute<localizerWidth())course='ON COURSE';
  else{
    const side=offset<0?'LEFT':'RIGHT';
    const degree=absolute>runway.halfWidth*1.5?'':'SLIGHTLY ';
    const correcting=plane.lastCourseAbs!==null&&absolute<plane.lastCourseAbs-.006;
    const diverging=plane.lastCourseAbs!==null&&absolute>plane.lastCourseAbs+.006;
    course=diverging?`GOING ${side} OF COURSE`: `${degree}${side} OF COURSE${correcting?' AND CORRECTING':''}`;
  }
  plane.lastCourseAbs=absolute;
  const miles=Math.max(0,-coursePosition(plane.x,plane.y).along*rangeScale);
  const distanceCall=plane.nextDistanceCall>=2&&miles<=plane.nextDistanceCall;
  const phrase=distanceCall?`${plane.nextDistanceCall} MILES FROM TOUCHDOWN, ${course}.`:`${course}.`;
  if(distanceCall)plane.nextDistanceCall-=2;
  showMessage(phrase,5,phrase,undefined,undefined,'course');
}
function localizerWidth(){return Math.max(.018,runway.halfWidth*.65)}
function broadLocalizerWidth(){return Math.max(.018,runway.halfWidth*.7)*1.8}
function landingBonuses(position){
  const center=Math.round(200*clamp(1-Math.abs(position.side)/runway.halfWidth,0,1));
  const steady=plane.steadySeconds>=3?Math.round(160*clamp(1-plane.steadyPenalty/plane.steadySeconds,0,1)):0;
  const stunt=plane.preFinalTurn>=100&&plane.maxPreFinalError>=60?40:0;
  return {center,steady,stunt};
}
function updateWindDisplay(){
  wind.knots=Math.round(Math.abs(wind.cross)/.00045);
  $('wind').textContent=wind.knots>=2?`DRIFT ${wind.cross<0?'LEFT':'RIGHT'} ${String(wind.knots).padStart(2,'0')} KT`:'DRIFT VARIABLE';
  $('wind').classList.toggle('gust',wind.knots>=12);
}
function updateWind(dt,t){
  if(t>=wind.nextShift){
    const direction=(Math.random()<.75?-1:1)*Math.sign(wind.target||1);
    wind.target=direction*wind.max*(.4+Math.random()*.6);
    wind.nextShift=t+3000+Math.random()*2500;
  }
  const change=wind.max*.75*dt;
  wind.base+=clamp(wind.target-wind.base,-change,change);
  wind.cross=clamp(wind.base+wind.max*.28*Math.sin(t*.003),-wind.max,wind.max);
  if(t-wind.lastDisplay>250){updateWindDisplay();wind.lastDisplay=t}
}
function updateLocalizer(dt){
  const position=coursePosition(plane.x,plane.y);
  const inFinal=position.along>=-finalCourseLength&&position.along<-.02;
  const offset=Math.abs(position.side);
  const onNarrow=inFinal&&offset<localizerWidth();
  const onBroad=inFinal&&offset<broadLocalizerWidth();
  plane.locSeconds=onNarrow?plane.locSeconds+dt:0;
  const doubled=plane.locSeconds>=requiredLocSeconds;
  const speedFactor=plane.speed/aircraftTypes[2].speed;
  const narrowRate=narrowPointsPerSecond*speedFactor;
  const broadRate=broadPointsPerSecond*speedFactor;
  if(onNarrow)score+=narrowRate*(doubled?2:1)*dt;
  else if(onBroad)score+=broadRate*dt;
  const state=!inFinal?'ACQUIRE':onNarrow?(doubled?`NARROW x2 +${(narrowRate*2).toFixed(1)}/s`:`NARROW +${narrowRate.toFixed(1)}/s`):onBroad?`WIDE +${broadRate.toFixed(1)}/s`:'OFF PATH';
  $('locStatus').textContent=`LOC · ${state} ${Math.min(requiredLocSeconds,plane.locSeconds).toFixed(1)} / ${requiredLocSeconds}s`;
  $('locStatus').classList.toggle('established',doubled);
}
function modal(kicker,title,text,info,button,action){ui.modalKicker.textContent=kicker;ui.modalTitle.textContent=title;ui.modalText.textContent=text;ui.modalInfo.innerHTML=info;ui.modalButton.textContent=button;ui.modalButton.onclick=action;ui.overlay.hidden=false}
function newPlane(retry=false){
  const previous=retry?plane:null;
  clearRadio();
  if(!retry)runway.heading=Math.floor(Math.random()*72)*5;
  resetRadar();
  document.querySelector('.radar-top span:last-child').textContent=`RWY ${String(Math.round(runway.heading/10)%36).padStart(2,'0')} ◆`;
  runway.halfWidth=approachHalfWidth(landings);
  $('gateWidth').textContent=`GATE ${Math.round(runway.halfWidth/.047*100)}%`;
  wind.max=Math.min(.003+landings*.001,.011);
  wind.cross=(Math.random()<.5?-1:1)*wind.max*(.45+Math.random()*.35);
  wind.base=wind.cross;
  wind.target=wind.cross;
  wind.nextShift=performance.now()+3000+Math.random()*2000;
  wind.lastDisplay=0;
  updateWindDisplay();
  const variant=retry?previous.variant:nextCallsign++%4;
  const side=variant%2===0?-.16:.16;
  const startPoint=coursePoint(-approachStartDistance,side);
  const s={...startPoint,h:norm(runway.heading+(side<0?25:-25))};
  const type=retry?previous.type:aircraftTypes[Math.floor(Math.random()*aircraftTypes.length)];
  plane={x:s.x,y:s.y,h:s.h,target:s.h,call:retry?previous.call:callsigns[(nextCallsign-1)%callsigns.length],type,variant,trail:[],speed:type.speed+Math.min(landings,6)*.0008,lastTrail:0,lastCourseCall:performance.now(),lastCommandAt:0,lastCourseAbs:null,nextDistanceCall:8,locSeconds:0,pendingHeading:null,steadySamples:[],steadySeconds:0,steadyPenalty:0,lastSide:side,preFinalTurn:0,maxPreFinalError:0,sharpTurnSeconds:0,sharpTurnCharged:false};
  $('locStatus').textContent=`LOC · ACQUIRE 0.0 / ${requiredLocSeconds}s`;
  $('locStatus').classList.remove('established');
  $('aircraftType').textContent=type.name;
  setSelected(Math.round(s.h/5)*5);
  ui.note.textContent=`${type.name}: ${type.traits}. Wind changes during flight.`;
  const contact=`RADAR CONTACT. DRIFT ${wind.cross<0?'LEFT':'RIGHT'}, ${wind.knots} KNOTS.`;
  const spokenCall=plane.call.replace(/\d{3}/,digits=>digits.split('').map(d=>radioDigits[Number(d)]).join(' '));
  if(retry)showMessage(`GO AROUND ${goArounds}. -${goAroundPenalty} POINTS. RETURN FOR ANOTHER APPROACH.`,5);
  else showMessage(`${plane.call}, ${contact}`,5,`${spokenCall}, ${contact}`);
}
function goAround(){
  if(!playing||!ui.overlay.hidden)return;
  plane.pendingHeading=null;
  goArounds++;
  score=Math.max(0,score-goAroundPenalty);
  renderScore();
  showPenalty(`GO AROUND  -${goAroundPenalty}`);
  newPlane(true);
  lastTime=performance.now();
}
function start(){score=0;goArounds=0;renderScore();landings=0;misses=0;nextCallsign=0;elapsed=0;$('clock').textContent='00:00';ui.overlay.hidden=true;playing=true;newPlane();lastTime=performance.now();requestAnimationFrame(frame)}
function end(success,reason='MISSED APPROACH.'){
  playing=false;
  const bonus=success?landingBonuses(coursePosition(plane.x,plane.y)):null;
  if(bonus)score+=bonus.center+bonus.steady+bonus.stunt;
  if(!success&&Math.floor(score)>maxScore){maxScore=Math.floor(score);saveMaxScore()}
  renderScore();
  plane.pendingHeading=null;
  clearRadio();
  if(success){landings++;showMessage('GUIDANCE LIMIT. TAKE OVER VISUALLY.',10);setTimeout(()=>{if(!playing)modal('TOUCHDOWN','Safe Landing',`You guided ${plane.call} to the runway.`,`Center: <strong>+${bonus.center}</strong> | Straight: <strong>+${bonus.steady}</strong> | Stunt: <strong>+${bonus.stunt}</strong><br>Score: <strong>${String(Math.floor(score)).padStart(4,'0')}</strong> | Landings: <strong>${landings}</strong> | Go-arounds: <strong>${goArounds}</strong>`,'Next Plane →',()=>{ui.overlay.hidden=true;playing=true;newPlane();lastTime=performance.now();requestAnimationFrame(frame)})},650)}
  else{misses++;showMessage(reason,10);setTimeout(()=>{if(!playing)modal('MISSED APPROACH','Approach Missed',`${plane.call} left the control area. Try guiding the plane again.`,`Final score: <strong>${String(Math.floor(score)).padStart(4,'0')}</strong> | Best run: <strong>${String(maxScore).padStart(4,'0')}</strong><br>Landings: <strong>${landings}</strong> | Go-arounds: <strong>${goArounds}</strong>`,'Try Again →',start)},650)}
}
function update(dt,t){
  if(!plane||!playing||!ui.overlay.hidden)return;
  elapsed+=dt;$('clock').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;
  updateWind(dt,t);
  const diff=((plane.target-plane.h+540)%360)-180;
  const turn=clamp(diff,-plane.type.turnRate*dt,plane.type.turnRate*dt);
  plane.h=norm(plane.h+turn);
  plane.x+=Math.sin(rad(plane.h))*plane.speed*dt;
  plane.y-=Math.cos(rad(plane.h))*plane.speed*dt;
  plane.x+=Math.cos(rad(runway.heading))*wind.cross*dt;
  plane.y+=Math.sin(rad(runway.heading))*wind.cross*dt;
  updateLocalizer(dt);
  if(t-plane.lastTrail>180){plane.trail.push({x:plane.x,y:plane.y});if(plane.trail.length>90)plane.trail.shift();plane.lastTrail=t}
  const dx=runway.x-plane.x,dy=runway.y-plane.y;
  const dist=Math.hypot(dx,dy);
  const position=coursePosition(plane.x,plane.y);
  const sharpTurn=dt>0&&position.along>=-finalCourseLength&&position.along<-.02&&Math.abs(turn)/dt>30;
  if(sharpTurn){
    plane.sharpTurnSeconds+=dt;
    if(plane.sharpTurnSeconds>=.75&&!plane.sharpTurnCharged){
      score=Math.max(0,score-sharpTurnPenalty);
      plane.sharpTurnCharged=true;
      showPenalty(`SHARP TURN  -${sharpTurnPenalty}`);
    }
  }else{
    plane.sharpTurnSeconds=0;
    plane.sharpTurnCharged=false;
  }
  if(position.along<-.3){
    plane.preFinalTurn+=Math.abs(turn);
    plane.maxPreFinalError=Math.max(plane.maxPreFinalError,headingError(plane.h));
  }
  if(dt>0&&position.along>=-.18&&position.along<-.02){
    const turnPenalty=clamp(Math.abs(turn)/dt/18,0,1);
    const driftPenalty=clamp(Math.abs(position.side-plane.lastSide)/dt/.025,0,1);
    const penalty=dt*(turnPenalty*.6+driftPenalty*.4);
    plane.steadySamples.push({dt,penalty});
    plane.steadyPenalty+=penalty;
    plane.steadySeconds+=dt;
    while(plane.steadySeconds>6&&plane.steadySamples.length>1){
      const old=plane.steadySamples.shift();
      plane.steadySeconds-=old.dt;
      plane.steadyPenalty-=old.penalty;
    }
  }
  plane.lastSide=position.side;
  if(position.along>=-.02){
    const onRunway=position.along<.016&&Math.abs(position.side)<runway.halfWidth&&headingError(plane.h)<27;
    end(onRunway,'MISSED APPROACH.');return;
  }
  if(position.along<-approachStartDistance-.2||Math.abs(position.side)>.65){end(false);return}
  if(!plane.pendingHeading&&activeRadio?.kind!=='course'&&!radioQueue.some(entry=>entry.kind==='course')&&position.along>-approachStartDistance+.03&&t-plane.lastCourseCall>=4000&&t-plane.lastCommandAt>=2500){courseAdvisory();plane.lastCourseCall=t}
  ui.range.textContent=(dist*rangeScale).toFixed(1);ui.heading.textContent=fmt(plane.h);ui.callsign.textContent=plane.call;renderScore();
}
function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);ctx.setTransform(d,0,0,d,0,0)}
function resetRadar(){const center=coursePoint(-approachStartDistance/2);camera.x=center.x;camera.y=center.y;camera.zoom=.72}
function changeRadarZoom(factor){camera.zoom=clamp(camera.zoom*factor,.55,2.4);draw(performance.now())}
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
  ctx.save();ctx.translate(w/2,h/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x*w,-camera.y*h);
  const cx=runway.x*w,cy=runway.y*h,R=Math.min(w,h)*.43;
  ctx.save();ctx.strokeStyle='#315d3a';ctx.lineWidth=1;for(let i=1;i<=4;i++){ctx.beginPath();ctx.arc(cx,cy,R*i/4,0,Math.PI*2);ctx.stroke()}
  ctx.strokeStyle='#244a31';ctx.beginPath();ctx.moveTo(cx-R-25,cy);ctx.lineTo(cx+R+25,cy);ctx.moveTo(cx,cy-R-25);ctx.lineTo(cx,cy+R+25);ctx.stroke();
  const pixel=(along,side=0)=>{const p=coursePoint(along,side);return {x:p.x*w,y:p.y*h}};
  const path=(points,close=false)=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(close)ctx.closePath()};
  const broad=broadLocalizerWidth(),outerA=pixel(-finalCourseLength,-broad),outerB=pixel(0,-broad),outerC=pixel(0,broad),outerD=pixel(-finalCourseLength,broad);
  ctx.fillStyle='#d9a36f10';path([outerA,outerB,outerC,outerD],true);ctx.fill();
  ctx.setLineDash([2,7]);ctx.strokeStyle='#a7835b';path([outerA,outerB]);ctx.stroke();path([outerC,outerD]);ctx.stroke();ctx.setLineDash([]);
  const half=localizerWidth(),a=pixel(-finalCourseLength,-half),b=pixel(0,-half),c=pixel(0,half),d=pixel(-finalCourseLength,half);
  ctx.fillStyle='#84d58a12';path([a,b,c,d],true);ctx.fill();
  ctx.setLineDash([3,6]);ctx.strokeStyle='#527f59';path([a,b]);ctx.stroke();path([c,d]);ctx.stroke();
  ctx.setLineDash([4,6]);ctx.strokeStyle='#73af79';path([pixel(-finalCourseLength),pixel(0)]);ctx.stroke();ctx.setLineDash([]);
  const label=pixel(-finalCourseLength+.01,-half-.025);ctx.fillStyle='#8cb593';ctx.font='10px DM Mono, monospace';ctx.fillText(`FINAL COURSE ${fmt(runway.heading)}°`,label.x,label.y);
  const gateA=pixel(0,-runway.halfWidth),gateB=pixel(0,runway.halfWidth);ctx.strokeStyle='#d3f7bb';ctx.lineWidth=5;path([gateA,gateB]);ctx.stroke();ctx.lineWidth=1;
  const runwayLabel=pixel(.02,-runway.halfWidth);ctx.fillStyle='#a2d89a';ctx.fillText(`RWY ${String(Math.round(runway.heading/10)%36).padStart(2,'0')}`,runwayLabel.x,runwayLabel.y);
  sweep=(t*.00035)%(Math.PI*2);const grad=ctx.createConicGradient(sweep,cx,cy);grad.addColorStop(0,'#9df6a900');grad.addColorStop(.94,'#9df6a900');grad.addColorStop(1,'#9df6a924');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#92e69b44';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(sweep)*R,cy+Math.sin(sweep)*R);ctx.stroke();ctx.restore();
  if(plane){
    ctx.save();
    plane.trail.forEach((p,i)=>{ctx.fillStyle=`rgba(174,236,158,${i/plane.trail.length*.45})`;ctx.fillRect(p.x*w-1,p.y*h-1,2,2)});
    const x=plane.x*w,y=plane.y*h;
    ctx.translate(x,y);ctx.rotate(rad(plane.h));ctx.shadowBlur=16;ctx.shadowColor='#c4ffb7';ctx.fillStyle='#d1ffbf';drawAircraftSymbol(plane.type.key);ctx.shadowBlur=0;ctx.restore();
    const arrowX=x-18,arrowY=y;
    const driftX=Math.cos(rad(runway.heading))*wind.cross*w*12,driftY=Math.sin(rad(runway.heading))*wind.cross*h*12;
    const tipX=arrowX+driftX,tipY=arrowY+driftY,angle=Math.atan2(driftY,driftX);
    ctx.strokeStyle='#f1ab6b';ctx.fillStyle='#f1ab6b';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(arrowX,arrowY);ctx.lineTo(tipX,tipY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(tipX,tipY);ctx.lineTo(tipX-7*Math.cos(angle-.5),tipY-7*Math.sin(angle-.5));ctx.lineTo(tipX-7*Math.cos(angle+.5),tipY-7*Math.sin(angle+.5));ctx.closePath();ctx.fill();
    ctx.strokeStyle='#a6dba2';ctx.beginPath();ctx.moveTo(x+8,y-8);ctx.lineTo(x+21,y-21);ctx.lineTo(x+69,y-21);ctx.stroke();ctx.fillStyle='#d5f4cb';ctx.font='11px DM Mono, monospace';ctx.fillText(plane.call,x+24,y-26);
  }
  ctx.restore();
  ui.radarState.textContent=`SCAN ${String(Math.floor(t/3600)%99).padStart(2,'0')}`;
}
function frame(t){const dt=Math.min((t-lastTime)/1000,.06);lastTime=t;update(dt,t);draw(t);if(t>messageUntil)ui.message.style.opacity='.35';if(playing)requestAnimationFrame(frame)}
function dialFromPointer(e){const r=ui.dial.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;setSelected(Math.atan2(x,-y)*180/Math.PI)}
ui.dial.addEventListener('pointerdown',e=>{ui.dial.setPointerCapture(e.pointerId);dialFromPointer(e)});ui.dial.addEventListener('pointermove',e=>{if(ui.dial.hasPointerCapture(e.pointerId))dialFromPointer(e)});
ui.dial.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key)){e.preventDefault();setSelected(selected+(e.key==='ArrowLeft'||e.key==='ArrowDown'?-5:5))}});
$('minus').onclick=()=>setSelected(selected-5);$('plus').onclick=()=>setSelected(selected+5);
$('radarZoomOut').onclick=()=>changeRadarZoom(1/1.2);
$('radarZoomIn').onclick=()=>changeRadarZoom(1.2);
$('radarReset').onclick=()=>{resetRadar();draw(performance.now())};
$('goAround').onclick=goAround;
let radarDrag=null;
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);radarDrag={id:e.pointerId,x:e.clientX,y:e.clientY}});
canvas.addEventListener('pointermove',e=>{if(!radarDrag||radarDrag.id!==e.pointerId)return;camera.x-=(e.clientX-radarDrag.x)/(canvas.clientWidth*camera.zoom);camera.y-=(e.clientY-radarDrag.y)/(canvas.clientHeight*camera.zoom);radarDrag.x=e.clientX;radarDrag.y=e.clientY;draw(performance.now())});
canvas.addEventListener('pointerup',e=>{if(radarDrag?.id===e.pointerId)radarDrag=null});
canvas.addEventListener('pointercancel',e=>{if(radarDrag?.id===e.pointerId)radarDrag=null});
canvas.addEventListener('wheel',e=>{e.preventDefault();changeRadarZoom(e.deltaY<0?1.1:1/1.1)},{passive:false});
$('issue').onclick=()=>{
  if(!playing||!ui.overlay.hidden)return;
  const command={plane,heading:selected,sentAt:performance.now()};
  plane.pendingHeading=command;plane.lastCommandAt=command.sentAt;
  const turn=((selected-plane.h+540)%360)-180;
  const direction=turn<0?'LEFT':'RIGHT';
  const instruction=Math.abs(turn)<2?`MAINTAIN HEADING ${fmt(selected)}`:`TURN ${direction} HEADING ${fmt(selected)}`;
  const spoken=Math.abs(turn)<2?`MAINTAIN HEADING ${radioHeading(selected)}.`:`TURN ${direction} HEADING ${radioHeading(selected)}.`;
  ui.note.textContent=`QUEUED: ${radioHeading(selected)}`;
  const voiced=showMessage(`${instruction}.`,3,spoken,()=>releaseHeading(command),()=>{if(plane===command.plane&&plane.pendingHeading===command)ui.note.textContent=`TRANSMITTING: ${radioHeading(command.heading)}`},'heading');
  if(!voiced)setTimeout(()=>releaseHeading(command),1800);
};
$('voiceButton').onclick=()=>{voiceEnabled=!voiceEnabled;$('voiceButton').textContent=voiceEnabled?'VOICE ON':'VOICE OFF';$('voiceButton').setAttribute('aria-pressed',String(voiceEnabled));if(!voiceEnabled)clearRadio(true)};
if(!voiceSupported){$('voiceButton').hidden=true;$('voiceButton').setAttribute('aria-pressed','false')}
window.addEventListener('resize',()=>{resize();draw(performance.now())});
// Keep the instructions tied to the current approach direction.
$('helpButton').onclick=()=>modal('HOW TO PLAY','How to Play','Guide the aircraft to the runway.','1. Turn the dial to choose a heading, then send it.<br>2. Stay in the narrow green path for more points, or the wider amber path for fewer points. Rates scale with aircraft speed: initially about 12/s for a helicopter, 16/s for a light plane, and 20/s for a heavy plane in the narrow path.<br>3. Stay in the narrow path for 7 continuous seconds to double its rate. Leaving the narrow path resets the streak.<br><br>Landing bonuses: up to 200 for touching down near the center, up to 160 for a steady final approach, and 40 for recovering from a large turn before final approach.<br><br>GO AROUND retries the same plane for a 100-point penalty. A sustained sharp turn on final approach costs 40 points. Score stops at zero. GO AROUNDS counts retries in this run; BEST is the highest final score when a run ends in a missed approach.','Back to Game →',()=>{ui.overlay.hidden=true;lastTime=performance.now()});
setSelected(90);renderScore();resize();draw(0);
modal('BRIEFING','Start Control','You are the controller for the final approach. Give the aircraft a heading and guide it to the runway.','Score points while flying in the approach path. The narrow green path pays more than the wider amber path, with rates adjusted for aircraft speed. Stay in the narrow path for <strong>7 continuous seconds</strong> to earn double points there.<br>Turn the dial and tap Send Heading.','Start Control →',start);
