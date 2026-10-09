const canvas = document.getElementById('radar');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const languageSelect=$('languageSelect');
let language=/^ja(?:-|$)/i.test(navigator.language||navigator.languages?.[0]||'')?'ja':'en';
languageSelect.value=language;
document.documentElement.lang=language;
let activeDialog=null;
const dialogCopy={
  briefing:{
    en:['BRIEFING','Start Control','You are the controller for the final approach. Give the aircraft a heading and guide it to the runway.','Score points while flying in the approach path. The centerline pays the most, and its multiplier builds while you track it steadily. Keep the aircraft aligned with the runway for the full reward.<br>Turn the dial and tap Send Heading.','Start Control →'],
    ja:['ブリーフィング','管制開始','あなたは最終進入の管制官です。航空機に方位を指示し、滑走路まで誘導してください。','進入経路内を飛ぶと得点が入ります。中心線は最も高得点で、安定してなぞるほど倍率が上がります。滑走路の方位に機体を合わせると最大の報酬を得られます。<br>ダイヤルを回して「Send Heading」を押してください。','管制開始 →']
  },
  help:{
    en:['HOW TO PLAY','How to Play','Guide the aircraft to the runway.','1. Turn the dial to choose a heading, then send it. Use the 5-degree buttons for small changes; RESET restores the instructed heading.<br>2. The amber path earns a small reward, the narrow green path earns more, and tracking the centerline earns the most. Rates scale with aircraft speed.<br>3. Hold the centerline to build the CENTER multiplier from x1 to x2. Runway alignment increases the centerline reward. A brief deviation is forgiven; a larger deviation drains or resets the streak.<br><br>Landing bonuses: up to 200 for touching down near the center, up to 160 for a steady final approach, and 40 for recovering from a large turn before final approach.<br><br>GO AROUND retries the same plane for a 100-point penalty. A sustained sharp turn on final approach costs 40 points. Score stops at zero. LANDINGS counts successful approaches in this run; BEST is the highest final score when a run ends in a missed approach.','Back to Game →'],
    ja:['遊び方','遊び方','航空機を滑走路まで誘導してください。','1. ダイヤルで方位を選び、Send Headingで指示します。5度ボタンで微調整できます。RESETで現在指示している方位に戻せます。<br>2. 琥珀色の経路では少量、狭い緑の経路ではより多く、中心線をなぞると最も多く得点できます。得点率は機体の速度に応じて変わります。<br>3. 中心線を維持するとCENTER倍率が1倍から2倍まで上がります。滑走路との方位差が小さいほど中心線の報酬が高くなります。短い逸脱は許容されますが、大きく外れると連続時間が減少またはリセットされます。<br><br>着陸ボーナス：中心付近への着陸で最大200点、安定した最終進入で最大160点、最終進入前の大きな旋回から立て直すと40点。<br><br>GO AROUNDは100点を消費して同じ機体でやり直します。最終進入中に急旋回を続けると40点減点されます。得点は0点未満になりません。LANDINGSは今回成功した着陸数、BESTはミストアプローチで終了した時点の最高得点です。','ゲームに戻る →']
  },
  landing:{
    en:['TOUCHDOWN','Safe Landing',call=>`You guided ${call} to the runway.`,b=>`Center: <strong>+${b.center}</strong> | Straight: <strong>+${b.steady}</strong> | Stunt: <strong>+${b.stunt}</strong><br>Score: <strong>${String(Math.floor(score)).padStart(4,'0')}</strong> | Landings: <strong>${landings}</strong> | Go-arounds: <strong>${goArounds}</strong>`,'Next Plane →'],
    ja:['TOUCHDOWN','Safe Landing',call=>`${call}を滑走路まで誘導しました。`,b=>`中心: <strong>+${b.center}</strong> | 安定進入: <strong>+${b.steady}</strong> | 立て直し: <strong>+${b.stunt}</strong><br>得点: <strong>${String(Math.floor(score)).padStart(4,'0')}</strong> | 着陸: <strong>${landings}</strong> | ゴーアラウンド: <strong>${goArounds}</strong>`,'次の機体 →']
  },
  missed:{
    en:['MISSED APPROACH','Approach Missed',call=>`${call} left the control area. Try guiding the plane again.`,()=>`Final score: <strong>${String(Math.floor(score)).padStart(4,'0')}</strong> | Best score: <strong>${String(maxScore).padStart(4,'0')}</strong><br>Landings: <strong>${landings}</strong> | Best landings: <strong>${maxLandings}</strong> | Go-arounds: <strong>${goArounds}</strong>`,'Try Again →'],
    ja:['MISSED APPROACH','Approach Missed',call=>`${call}が管制区域を離れました。もう一度誘導してください。`,()=>`最終得点: <strong>${String(Math.floor(score)).padStart(4,'0')}</strong> | 最高得点: <strong>${String(maxScore).padStart(4,'0')}</strong><br>着陸: <strong>${landings}</strong> | 最多着陸: <strong>${maxLandings}</strong> | ゴーアラウンド: <strong>${goArounds}</strong>`,'もう一度 →']
  }
};
function showDialog(kind,action,call,bonus){
  activeDialog={kind,action,call,bonus};
  const [kicker,title,description,details,button]=dialogCopy[kind][language];
  modal(kicker,title,typeof description==='function'?description(call):description,typeof details==='function'?details(bonus):details,button,action);
  ui.overlay.querySelector('.modal').classList.toggle('missed',kind==='missed');
  $('modalSound').hidden=kind!=='briefing'||!voiceSupported;
  $('shareScore').hidden=kind!=='missed'&&kind!=='landing';
}
languageSelect.onchange=()=>{language=languageSelect.value;document.documentElement.lang=language;if(activeDialog&&!ui.overlay.hidden)showDialog(activeDialog.kind,activeDialog.action,activeDialog.call,activeDialog.bonus)};
const ui = {callsign:$('callsign'),range:$('range'),heading:$('heading'),score:$('score'),maxScore:$('maxScore'),landingCount:$('landingCount'),maxLandings:$('maxLandings'),selected:$('selectedHeading'),pointer:$('dialPointer'),currentPointer:$('dialCurrentPointer'),runwayGuide:$('dialRunwayGuide'),dial:$('dial'),message:$('message'),messageText:$('messageText'),note:$('commandNote'),overlay:$('overlay'),modalKicker:$('modalKicker'),modalTitle:$('modalTitle'),modalText:$('modalText'),modalInfo:$('modalInfo'),modalButton:$('modalButton')};
const runway = {x:.5,y:.5,heading:90,halfWidth:.047};
const camera = {x:.5,y:.5,zoom:1.3};
const approachStartDistance=.98,finalCourseLength=.85,rangeScale=10;
const wind = {direction:0,targetDirection:0,speed:0,targetSpeed:0,shownDirection:0,shownSpeed:0,minKnots:0,maxKnots:0,knots:0,x:0,y:0,nextShift:0,lastDisplay:0,initialized:false};
const requiredCenterSeconds=5;
const centerPointsPerSecond=28,narrowPointsPerSecond=18,broadPointsPerSecond=6;
const scoringReferenceSpeed=.024;
const reduceRadarMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
const goAroundPenalty=100,sharpTurnPenalty=40;
let selected = 90, plane, score = 0, landings = 0, misses = 0, goArounds = 0, playing = false, lastTime = 0, sweep = 0, messageUntil = 0, nextCallsign = 0, elapsed = 0;
const maxScoreKey='gca.bestCompletedRun';
const maxLandingsKey='gca.bestLandings';
let maxScore=0,maxLandings=0;
try{
  const saved=JSON.parse(localStorage.getItem(maxScoreKey));
  const previousScore=typeof saved==='object'&&saved!==null?saved.score:saved;
  if(Number.isSafeInteger(previousScore)&&previousScore>=0)maxScore=previousScore;
}catch{}
try{
  const saved=Number(localStorage.getItem(maxLandingsKey));
  if(Number.isSafeInteger(saved)&&saved>=0)maxLandings=saved;
}catch{}
function renderScore(){
  const current=Math.floor(score);
  ui.score.textContent=String(current).padStart(4,'0');
  ui.maxScore.textContent=String(maxScore).padStart(4,'0');
  ui.landingCount.textContent=String(landings);
  ui.maxLandings.textContent=String(maxLandings);
}
function saveMaxScore(){try{localStorage.setItem(maxScoreKey,String(maxScore))}catch{}}
function saveMaxLandings(){try{localStorage.setItem(maxLandingsKey,String(maxLandings))}catch{}}
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
  {key:'helicopter',name:'Helicopter',speed:.0145,turnRate:64,traits:'Slow / Quick turns'},
  {key:'light',name:'Light plane',speed:.0185,turnRate:40,traits:'Moderate speed / Responsive turns'},
  {key:'heavy',name:'Heavy plane',speed:.023,turnRate:25,traits:'Fast / Wide turns'},
  {key:'business',name:'Business jet',speed:.026,turnRate:34,traits:'Very fast / Moderate turns'},
  {key:'fighter',name:'Fighter jet',speed:.0295,turnRate:72,traits:'Fastest / Agile turns'}
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
  utterance.lang='en-US';utterance.rate=1.00;utterance.pitch=.88;
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
  if(kind==='distance'){
    radioQueue=radioQueue.filter(waiting=>waiting.kind!=='course'&&waiting.kind!=='distance');
    radioQueue.unshift(entry);
  }else radioQueue.push(entry);
  playNextRadio();
  return true;
}
function releaseHeading(command){
  if(!playing||plane!==command.plane||(!command.started&&plane.pendingHeading!==command))return;
  const wait=command.sentAt+1200-performance.now();
  if(wait>0){setTimeout(()=>releaseHeading(command),wait);return}
  plane.target=command.heading;
  if(plane.pendingHeading===command){
    plane.pendingHeading=null;
    $('issue').classList.remove('transmitting');
    ui.note.textContent=`EXECUTING HEADING ${fmt(command.heading)}°`;
  }
}
function courseAdvisory(){
  const position=coursePosition(plane.x,plane.y),offset=position.side,absolute=Math.abs(offset);
  const onCourse=absolute<localizerWidth(position.along);
  let course;
  if(onCourse)course='ON COURSE';
  else{
    const side=offset<0?'LEFT':'RIGHT';
    const degree=absolute>runway.halfWidth*1.5?'WELL ':absolute<runway.halfWidth?'SLIGHTLY ':'';
    const correction=plane.lastCourseAbs===null?0:plane.lastCourseAbs-absolute;
    const correcting=correction>.006;
    const diverging=plane.lastCourseAbs!==null&&absolute>plane.lastCourseAbs+.006;
    const correctionRate=correction/Math.max((performance.now()-plane.lastCourseCall)/1000,1);
    course=`${degree}${side} OF COURSE${diverging?`, GOING ${side}`:correcting?correctionRate<.003?', CORRECTING SLOWLY':', CORRECTING':''}`;
  }
  plane.lastCourseAbs=absolute;
  const miles=Math.max(0,-position.along*rangeScale);
  const distanceCall=plane.nextDistanceCall>=2&&miles<=plane.nextDistanceCall;
  const phrase=distanceCall?`${plane.nextDistanceCall} MILES FROM RUNWAY, ${course}.`:`${course}.`;
  if(distanceCall)plane.nextDistanceCall-=2;
  showMessage(phrase,5,phrase,undefined,undefined,distanceCall?'distance':'course');
}
function localizerWidth(along=0){return Math.max(.007,runway.halfWidth*.2)+Math.abs(Math.min(0,along))*Math.tan(rad(1.35))}
function broadLocalizerWidth(along=0){return Math.max(.014,runway.halfWidth*.35)+Math.abs(Math.min(0,along))*Math.tan(rad(4.5))}
function landingBonuses(position){
  const center=Math.round(200*clamp(1-Math.abs(position.side)/runway.halfWidth,0,1));
  const steady=plane.steadySeconds>=3?Math.round(160*clamp(1-plane.steadyPenalty/plane.steadySeconds,0,1)):0;
  const stunt=plane.preFinalTurn>=100&&plane.maxPreFinalError>=60?40:0;
  return {center,steady,stunt};
}
function updateWindDisplay(){
  wind.knots=Math.round(wind.shownSpeed);
}
function updateWind(dt,t){
  const directionRate=Math.min(3+landings*3,30);
  if(t>=wind.nextShift){
    const directionRange=Math.min(8+landings*10+landings*landings*2,180);
    const directionChange=Math.random()*directionRange*2-directionRange;
    wind.targetDirection+=directionChange;
    const speedChange=Math.min(1.5+landings*.5,5);
    wind.targetSpeed=clamp(wind.targetSpeed+(Math.random()*2-1)*speedChange,wind.minKnots,wind.maxKnots);
    wind.nextShift=t+2000+Math.abs(directionChange)/directionRate*1000+Math.random()*1500;
  }
  wind.direction+=clamp(wind.targetDirection-wind.direction,-directionRate*dt,directionRate*dt);
  wind.speed+=clamp(wind.targetSpeed-wind.speed,-1*dt,1*dt);
  const direction=wind.direction+Math.sin(t*.00055)*2;
  const speed=Math.max(0,wind.speed+Math.sin(t*.0008+1.3)*.5);
  wind.shownDirection=direction;
  wind.shownSpeed=speed;
  wind.x=Math.sin(rad(direction))*speed*.00045;
  wind.y=-Math.cos(rad(direction))*speed*.00045;
  if(t-wind.lastDisplay>250){updateWindDisplay();wind.lastDisplay=t}
}
function updateLocalizer(dt){
  const position=coursePosition(plane.x,plane.y);
  const inFinal=position.along>=-finalCourseLength&&position.along<-.02;
  const offset=Math.abs(position.side);
  const narrowWidth=localizerWidth(position.along),broadWidth=broadLocalizerWidth(position.along);
  const onCenter=inFinal&&offset<narrowWidth*.35;
  const onNarrow=inFinal&&offset<narrowWidth;
  const onBroad=inFinal&&offset<broadWidth;
  if(onCenter){plane.centerSeconds+=dt;plane.centerMissSeconds=0}
  else if(onNarrow){plane.centerMissSeconds+=dt;if(plane.centerMissSeconds>.5)plane.centerSeconds=Math.max(0,plane.centerSeconds-dt*2)}
  else{plane.centerSeconds=0;plane.centerMissSeconds=0}
  const speedFactor=plane.speed/scoringReferenceSpeed;
  const narrowRate=narrowPointsPerSecond*speedFactor;
  const broadRate=broadPointsPerSecond*speedFactor;
  const alignment=clamp(1-headingError(plane.h)/45,0,1);
  const centerBaseRate=(narrowPointsPerSecond+(centerPointsPerSecond-narrowPointsPerSecond)*alignment)*speedFactor;
  const centerMultiplier=1+clamp(plane.centerSeconds/requiredCenterSeconds,0,1);
  const centerRate=centerBaseRate*centerMultiplier;
  if(onCenter)score+=centerRate*dt;
  else if(onNarrow)score+=narrowRate*dt;
  else if(onBroad)score+=broadRate*dt;
  plane.scoringZone=onCenter?'CENTER':onNarrow?'NARROW':onBroad?'WIDE':'OFF PATH';
  plane.currentPointRate=onCenter?centerRate:onNarrow?narrowRate:onBroad?broadRate:0;
  plane.currentMultiplier=onCenter?centerMultiplier:1;
  const state=!inFinal?'ACQUIRE':onCenter?`CENTER ×${centerMultiplier.toFixed(1)} +${Math.round(centerRate)}/s`:onNarrow?`NARROW +${Math.round(narrowRate)}/s`:onBroad?`WIDE +${Math.round(broadRate)}/s`:'OFF PATH';
  $('locStatus').textContent=`LOC · ${state}`;
  $('locStatus').classList.toggle('established',onCenter&&plane.centerSeconds>=requiredCenterSeconds);
}
function modal(kicker,title,text,info,button,action){ui.modalKicker.textContent=kicker;ui.modalTitle.textContent=title;ui.modalText.textContent=text;ui.modalInfo.innerHTML=info;ui.modalButton.textContent=button;ui.modalButton.onclick=action;ui.overlay.querySelector('.modal').classList.toggle('missed',kicker==='MISSED APPROACH');$('modalSound').hidden=kicker!=='BRIEFING'||!voiceSupported;$('shareScore').hidden=kicker!=='MISSED APPROACH'&&kicker!=='TOUCHDOWN';$('shareScore').textContent='Share Result ↗';ui.overlay.hidden=false}
$('shareScore').onclick=async()=>{
  const text=`TinyGCA: ${landings} landings, ${Math.floor(score)} points.\nhttps://tatesuke.github.io/TinyGCA/`;
  if(navigator.share){try{await navigator.share({text});return}catch(error){if(error.name==='AbortError')return}}
  try{await navigator.clipboard.writeText(text);$('shareScore').textContent='Copied ✓'}
  catch{window.prompt('Copy this text to share your score',text)}
};
function newPlane(retry=false){
  const previous=retry?plane:null;
  clearRadio();
  $('issue').classList.remove('transmitting');
  if(!retry)runway.heading=Math.floor(Math.random()*72)*5;
  resetRadar();
  document.querySelector('.radar-top span:last-child').textContent=`RWY ${String(Math.round(runway.heading/10)%36).padStart(2,'0')} ◆`;
  runway.halfWidth=approachHalfWidth(landings);
  $('gateWidth').textContent=`GATE ${Math.round(runway.halfWidth/.047*100)}%`;
  wind.minKnots=Math.min(1.5+landings*.35,5);
  wind.maxKnots=Math.min(4+landings*1.2+landings*landings*.25,24);
  if(!wind.initialized){
    wind.direction=Math.random()*360;
    wind.targetDirection=wind.direction;
    wind.speed=wind.targetSpeed=wind.minKnots+Math.random()*(wind.maxKnots-wind.minKnots);
    wind.shownDirection=wind.direction;
    wind.shownSpeed=wind.speed;
    wind.initialized=true;
  }else{
    wind.targetSpeed=clamp(wind.targetSpeed,wind.minKnots,wind.maxKnots);
  }
  wind.nextShift=performance.now()+2500+Math.random()*1500;
  wind.lastDisplay=0;
  updateWindDisplay();
  const variant=retry?previous.variant:nextCallsign++%4;
  const side=variant%2===0?-.16:.16;
  const startPoint=coursePoint(-approachStartDistance,side);
  const s={...startPoint,h:norm(runway.heading+(side<0?25:-25))};
  const type=retry?previous.type:aircraftTypes[Math.floor(Math.random()*aircraftTypes.length)];
  plane={x:s.x,y:s.y,h:s.h,target:s.h,call:retry?previous.call:callsigns[(nextCallsign-1)%callsigns.length],type,variant,trail:[],speed:type.speed+Math.min(landings,6)*.0008,lastTrail:0,lastCourseCall:performance.now(),lastCommandAt:0,lastCourseAbs:null,nextDistanceCall:8,centerSeconds:0,centerMissSeconds:0,scoringZone:'OFF PATH',currentPointRate:0,currentMultiplier:1,pendingHeading:null,steadySamples:[],steadySeconds:0,steadyPenalty:0,lastSide:side,preFinalTurn:0,maxPreFinalError:0,sharpTurnSeconds:0,sharpTurnCharged:false};
  $('locStatus').textContent='LOC · ACQUIRE';
  $('locStatus').classList.remove('established');
  $('aircraftType').textContent=type.name;
  setSelected(Math.round(s.h/5)*5);
  ui.note.textContent=`${type.name}: ${type.traits}. Wind changes during flight.`;
  const contact=`RADAR CONTACT. WIND FROM ${fmt(wind.direction+180)}, ${wind.knots} KNOTS.`;
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
function start(){score=0;goArounds=0;landings=0;renderScore();misses=0;nextCallsign=0;elapsed=0;wind.initialized=false;$('clock').textContent='00:00';ui.overlay.hidden=true;playing=true;newPlane();lastTime=performance.now();requestAnimationFrame(frame)}
function end(success,reason='MISSED APPROACH.'){
  playing=false;
  $('issue').classList.remove('transmitting');
  const bonus=success?landingBonuses(coursePosition(plane.x,plane.y)):null;
  if(bonus)score+=bonus.center+bonus.steady+bonus.stunt;
  if(!success&&Math.floor(score)>maxScore){maxScore=Math.floor(score);saveMaxScore()}
  renderScore();
  plane.pendingHeading=null;
  clearRadio();
  if(success){landings++;if(landings>maxLandings){maxLandings=landings;saveMaxLandings()}renderScore();showMessage('GUIDANCE LIMIT. TAKE OVER VISUALLY.',10);setTimeout(()=>{if(!playing)showDialog('landing',()=>{ui.overlay.hidden=true;playing=true;newPlane();lastTime=performance.now();requestAnimationFrame(frame)},plane.call,bonus)},650)}
  else{misses++;showMessage(reason,10);setTimeout(()=>{if(!playing)showDialog('missed',start,plane.call)},650)}
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
  plane.x+=wind.x*dt;
  plane.y+=wind.y*dt;
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
  const approachMiles=Math.max(0,-position.along*rangeScale);
  const distanceDue=plane.nextDistanceCall>=2&&approachMiles<=plane.nextDistanceCall;
  const distanceSoon=plane.nextDistanceCall>=2&&approachMiles<=plane.nextDistanceCall+.6;
  const advisoryBusy=['course','distance'].includes(activeRadio?.kind)||radioQueue.some(entry=>entry.kind==='course'||entry.kind==='distance');
  const regularAdvisoryDue=!distanceSoon&&t-plane.lastCourseCall>=4000&&t-plane.lastCommandAt>=2500;
  if(!plane.pendingHeading&&!advisoryBusy&&position.along>-approachStartDistance+.03&&(distanceDue||regularAdvisoryDue)){courseAdvisory();plane.lastCourseCall=t}
  const runwayBearing=norm(Math.atan2(runway.x-plane.x,plane.y-runway.y)*180/Math.PI);
  ui.range.textContent=(dist*rangeScale).toFixed(1);ui.heading.textContent=fmt(plane.h);ui.currentPointer.style.transform=`rotate(${plane.h+180}deg)`;ui.currentPointer.hidden=false;ui.runwayGuide.style.transform=`rotate(${runwayBearing}deg)`;ui.runwayGuide.hidden=false;ui.dial.setAttribute('aria-valuetext',`Selected ${fmt(selected)} degrees, current ${fmt(plane.h)} degrees, runway ${fmt(runwayBearing)} degrees`);ui.callsign.textContent=plane.call;renderScore();
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
  }else if(type==='business'){
    ctx.moveTo(0,-10);ctx.lineTo(2,-2);ctx.lineTo(8,4);ctx.lineTo(8,6);ctx.lineTo(2,4);ctx.lineTo(2,9);ctx.lineTo(-2,9);ctx.lineTo(-2,4);ctx.lineTo(-8,6);ctx.lineTo(-8,4);ctx.lineTo(-2,-2);ctx.closePath();
  }else if(type==='fighter'){
    ctx.moveTo(0,-11);ctx.lineTo(2,-4);ctx.lineTo(9,5);ctx.lineTo(9,8);ctx.lineTo(2,5);ctx.lineTo(2,9);ctx.lineTo(-2,9);ctx.lineTo(-2,5);ctx.lineTo(-9,8);ctx.lineTo(-9,5);ctx.lineTo(-2,-4);ctx.closePath();
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
  const broadFar=broadLocalizerWidth(-finalCourseLength),broadNear=broadLocalizerWidth(0),outerA=pixel(-finalCourseLength,-broadFar),outerB=pixel(0,-broadNear),outerC=pixel(0,broadNear),outerD=pixel(-finalCourseLength,broadFar);
  ctx.fillStyle='#d9a36f10';path([outerA,outerB,outerC,outerD],true);ctx.fill();
  ctx.setLineDash([2,7]);ctx.strokeStyle='#a7835b';ctx.lineWidth=1;path([outerA,outerB]);ctx.stroke();path([outerC,outerD]);ctx.stroke();ctx.setLineDash([]);
  const halfFar=localizerWidth(-finalCourseLength),halfNear=localizerWidth(0),a=pixel(-finalCourseLength,-halfFar),b=pixel(0,-halfNear),c=pixel(0,halfNear),d=pixel(-finalCourseLength,halfFar);
  ctx.fillStyle='#84d58a12';path([a,b,c,d],true);ctx.fill();
  ctx.setLineDash([3,6]);ctx.strokeStyle='#527f59';path([a,b]);ctx.stroke();path([c,d]);ctx.stroke();
  ctx.setLineDash([4,6]);ctx.strokeStyle='#73af79';path([pixel(-finalCourseLength),pixel(0)]);ctx.stroke();ctx.setLineDash([]);
  const label=pixel(-finalCourseLength+.01,-halfFar-.025);ctx.fillStyle='#8cb593';ctx.font='10px DM Mono, monospace';ctx.fillText(`FINAL COURSE ${fmt(runway.heading)}°`,label.x,label.y);
  const gateA=pixel(0,-runway.halfWidth),gateB=pixel(0,runway.halfWidth);ctx.strokeStyle='#d3f7bb';ctx.lineWidth=5;path([gateA,gateB]);ctx.stroke();ctx.lineWidth=1;
  const runwayLabel=pixel(.02,-runway.halfWidth);ctx.fillStyle='#a2d89a';ctx.fillText(`RWY ${String(Math.round(runway.heading/10)%36).padStart(2,'0')}`,runwayLabel.x,runwayLabel.y);
  sweep=(t*.00035)%(Math.PI*2);const grad=ctx.createConicGradient(sweep,cx,cy);grad.addColorStop(0,'#9df6a900');grad.addColorStop(.94,'#9df6a900');grad.addColorStop(1,'#9df6a924');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#92e69b44';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(sweep)*R,cy+Math.sin(sweep)*R);ctx.stroke();ctx.restore();
  if(plane){
    ctx.save();
    const x=plane.x*w,y=plane.y*h;
    plane.trail.forEach((p,i)=>{ctx.fillStyle=`rgba(174,236,158,${i/plane.trail.length*.45})`;ctx.fillRect(p.x*w-1,p.y*h-1,2,2)});
    ctx.translate(x,y);ctx.rotate(rad(plane.h));ctx.shadowBlur=16;ctx.shadowColor='#c4ffb7';ctx.fillStyle='#d1ffbf';drawAircraftSymbol(plane.type.key);ctx.shadowBlur=0;ctx.restore();
    const arrowX=x-18,arrowY=y;
    const arrowLength=12+Math.min(wind.shownSpeed,25)*2;
    const windX=Math.sin(rad(wind.shownDirection))*arrowLength;
    const windY=-Math.cos(rad(wind.shownDirection))*arrowLength;
    const tipX=arrowX+windX,tipY=arrowY+windY,angle=Math.atan2(windY,windX);
    ctx.strokeStyle='#f1ab6b';ctx.fillStyle='#f1ab6b';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(arrowX,arrowY);ctx.lineTo(tipX,tipY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(tipX,tipY);ctx.lineTo(tipX-7*Math.cos(angle-.5),tipY-7*Math.sin(angle-.5));ctx.lineTo(tipX-7*Math.cos(angle+.5),tipY-7*Math.sin(angle+.5));ctx.closePath();ctx.fill();
    const labelSide=x>w-145?-1:1,labelX=x+24*labelSide;ctx.textAlign=labelSide<0?'right':'left';
    ctx.strokeStyle='#a6dba2';ctx.beginPath();ctx.moveTo(x+8*labelSide,y-8);ctx.lineTo(x+21*labelSide,y-21);ctx.lineTo(x+88*labelSide,y-21);ctx.stroke();ctx.fillStyle='#d5f4cb';ctx.font='11px DM Mono, monospace';ctx.fillText(plane.call,labelX,y-26);
    const scoring=plane.scoringZone!=='OFF PATH',centerScoring=plane.scoringZone==='CENTER';
    const scoringPulse=centerScoring&&!reduceRadarMotion ? .9+.1*(.5+.5*Math.sin(t*.014)) : 1;
    ctx.save();ctx.globalAlpha=scoring?scoringPulse:.55;ctx.fillStyle=centerScoring?'#caffb9':plane.scoringZone==='NARROW'?'#91dfa0':plane.scoringZone==='WIDE'?'#f2bd78':'#789b88';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=centerScoring?10:scoring?5:0;ctx.font=`700 ${centerScoring?12:10}px DM Mono, monospace`;
    const multiplier=`×${plane.currentMultiplier.toFixed(1)}`;ctx.fillText(`+${Math.round(plane.currentPointRate)} PT/s  ${multiplier}`,labelX,y-10);
    if(centerScoring){const progress=clamp(plane.centerSeconds/requiredCenterSeconds,0,1),barWidth=76,barX=labelSide<0?labelX-barWidth:labelX,barY=y-4;ctx.shadowBlur=0;ctx.globalAlpha=.8;ctx.fillStyle='#173c2a';ctx.fillRect(barX,barY,barWidth,4);ctx.fillStyle='#baffaa';ctx.fillRect(barX,barY,barWidth*progress,4);ctx.strokeStyle='#8acb8799';ctx.lineWidth=1;ctx.strokeRect(barX-.5,barY-.5,barWidth+1,5)}ctx.restore();ctx.textAlign='left';
  }
  ctx.restore();
}
function frame(t){const dt=Math.min((t-lastTime)/1000,.06);lastTime=t;update(dt,t);draw(t);if(t>messageUntil)ui.message.style.opacity='.35';if(playing)requestAnimationFrame(frame)}
function dialFromPointer(e){const r=ui.dial.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;setSelected(Math.atan2(x,-y)*180/Math.PI)}
ui.dial.addEventListener('pointerdown',e=>{ui.dial.setPointerCapture(e.pointerId);dialFromPointer(e)});
ui.dial.addEventListener('pointermove',e=>{if(ui.dial.hasPointerCapture(e.pointerId))dialFromPointer(e)});
$('resetHeading').onclick=()=>{if(plane)setSelected(plane.pendingHeading?.heading??plane.target)};
ui.dial.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key)){e.preventDefault();setSelected(selected+(e.key==='ArrowLeft'||e.key==='ArrowDown'?-5:5))}});
$('minus').onclick=()=>setSelected(selected-5);$('plus').onclick=()=>setSelected(selected+5);
$('swapControls').onclick=()=>{
  const swapped=$('controlContent').classList.toggle('swapped');
  $('swapControls').setAttribute('aria-pressed',String(swapped));
};
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
  const command={plane,heading:selected,sentAt:performance.now(),started:false};
  plane.pendingHeading=command;plane.lastCommandAt=command.sentAt;
  $('issue').classList.remove('transmitting');
  void $('issue').offsetWidth;
  $('issue').classList.add('transmitting');
  const turn=((selected-plane.h+540)%360)-180;
  const direction=turn<0?'LEFT':'RIGHT';
  const instruction=Math.abs(turn)<2?`MAINTAIN HEADING ${fmt(selected)}`:`TURN ${direction} HEADING ${fmt(selected)}`;
  const spoken=Math.abs(turn)<2?`MAINTAIN HEADING ${radioHeading(selected)}.`:`TURN ${direction} HEADING ${radioHeading(selected)}.`;
  ui.note.textContent=`QUEUED: ${radioHeading(selected)}`;
  const voiced=showMessage(`${instruction}.`,3,spoken,()=>releaseHeading(command),()=>{command.started=true;if(plane===command.plane&&plane.pendingHeading===command)ui.note.textContent=`TRANSMITTING: ${radioHeading(command.heading)}`},'heading');
  if(!voiced)setTimeout(()=>releaseHeading(command),1800);
};
$('voiceButton').onclick=$('modalVoiceButton').onclick=()=>{voiceEnabled=!voiceEnabled;$('voiceButton').textContent=voiceEnabled?'VOICE ON':'VOICE OFF';$('voiceButton').setAttribute('aria-pressed',String(voiceEnabled));$('modalVoiceButton').textContent=voiceEnabled?'ON':'OFF';$('modalVoiceButton').setAttribute('aria-pressed',String(voiceEnabled));if(!voiceEnabled)clearRadio(true)};
if(!voiceSupported){$('voiceButton').hidden=true;$('voiceButton').setAttribute('aria-pressed','false')}
window.addEventListener('resize',()=>{resize();draw(performance.now())});
// Keep the instructions tied to the current approach direction.
$('helpButton').onclick=()=>showDialog('help',()=>{ui.overlay.hidden=true;lastTime=performance.now()});
setSelected(90);renderScore();resize();draw(0);
showDialog('briefing',start);
