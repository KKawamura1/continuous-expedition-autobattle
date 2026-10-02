import './style.css';
import { draw } from './canvas';
import { MAX_HEALTH, MUTATIONS, SEGMENT } from './content';
import { createState, depart, mutate, start, step, unlock } from './simulation';
import { decode, encode, SAVE_KEY } from './save';
import { bodyUI } from './mutation-ui';
import type { MutationId, Part, State } from './types';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main id="game" aria-label="巨大生物の連続遠征"><canvas id="field" aria-label="古代龍蛇と少女が荒野を進む戦場"></canvas><div id="hud" hidden><div class="growth-hud" aria-label="成長資源"><span>◇</span> <b id="growth-value">12</b></div><div id="speed-value" class="speed-hud"></div><div class="route-hud"><span id="camp-value" class="camp-marker"></span><div id="route" role="progressbar" aria-label="次の拠点への進捗" aria-valuemin="0" aria-valuemax="100"><div class="route-track"><i id="route-fill"></i><b id="route-marker">◆</b></div></div><small id="origin-value"></small></div><div class="health-hud"><span>HP <b id="health-value"></b></span><div id="health" role="progressbar" aria-label="巨大生物HP" aria-valuemin="0" aria-valuemax="180"><i id="health-fill"></i></div></div></div><div id="ui"></div><button id="handle" aria-label="身体を引き上げて変異する"><span></span><small>身体を引き上げる</small></button><div id="notice" role="status"></div></main>`;
const game = document.querySelector<HTMLElement>('#game')!;
const canvas = document.querySelector<HTMLCanvasElement>('#field')!;
const ctx = canvas.getContext('2d')!;
const ui = document.querySelector<HTMLDivElement>('#ui')!;
const handle = document.querySelector<HTMLButtonElement>('#handle')!;
const notice = document.querySelector<HTMLDivElement>('#notice')!;
let saved: State | null = null;
try { saved = decode(localStorage.getItem(SAVE_KEY)); } catch { /* Storage can be unavailable in private browsing. */ }
let s = saved ?? createState();
let intro = true, selected: Part | null = null, inspecting: MutationId | null = null, reveal = 0, height = 844, idle = 0, last = 0, accumulator = 0, saveClock = 0, noticeTimer = 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let lastSignature = '';
function notify(message: string): void { notice.textContent=message;notice.classList.add('show');noticeTimer=4; }
function persist(): void { try { localStorage.setItem(SAVE_KEY,encode(s)); } catch { notify('この端末では進行を保存できません'); } }
function resize(): void {
  const box=game.getBoundingClientRect();height=box.height/box.width*390;
  const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);
  ctx.setTransform(canvas.width/390,0,0,canvas.height/height,0,0);
}
new ResizeObserver(resize).observe(game);
function toggleBody(): void {
  if(intro)return;
  if(s.mode==='running'){s.mode='body';selected=null;inspecting=null;persist();}
  else if(s.mode==='body'){s.mode='running';selected=null;accumulator=0;persist();}
  renderUI(true);
}
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const growthValue = document.querySelector<HTMLElement>('#growth-value')!;
const speedValue = document.querySelector<HTMLElement>('#speed-value')!;
const healthValue = document.querySelector<HTMLElement>('#health-value')!;
const healthFill = document.querySelector<HTMLElement>('#health-fill')!;
const healthGauge = document.querySelector<HTMLElement>('#health')!;
const routeFill = document.querySelector<HTMLElement>('#route-fill')!;
const routeMarker = document.querySelector<HTMLElement>('#route-marker')!;
const routeGauge = document.querySelector<HTMLElement>('#route')!;
let hudClock = 0;
function updateHUD(dt: number): void {
  hud.hidden = intro || s.mode !== 'running';
  hudClock += dt; if (hud.hidden || hudClock < .1) return; hudClock = 0;
  const progress = Math.max(0, Math.min(1, (s.distance-s.checkpoint)/SEGMENT)), hp = Math.max(0,s.health/MAX_HEALTH);
  const feedbackNames: Record<string,string> = {pull:'引き寄せ',bite:'噛みつき',sweep:'角の押し出し',collision:'敵同士の衝突',rebound:'鱗の反発',scrape:'鱗の切創',hook:'鱗の拘束'};
  const active = [...new Set(s.effects.filter(e=>e.type!=='dust').map(e=>`${e.source ? MUTATIONS.find(m=>m.id===e.source)?.name+'・' : ''}${feedbackNames[e.type]}`))];
  canvas.setAttribute('aria-label', `戦場：敵${s.enemies.length}体${active.length?'。'+active.join('、'):''}`);
  growthValue.textContent = String(s.growth);
  speedValue.textContent = `${s.speed >= 0 ? '+' : ''}${s.speed.toFixed(1)} m/s`;
  speedValue.dataset.retreat = String(s.speed < -.1);
  healthValue.textContent = `${Math.ceil(s.health)} / ${MAX_HEALTH}`;
  healthFill.style.width = `${hp*100}%`; healthGauge.setAttribute('aria-valuenow', String(Math.ceil(s.health)));
  healthGauge.dataset.danger = String(hp < .4);
  routeFill.style.height = `${progress*100}%`; routeMarker.style.bottom = `${progress*100}%`;
  routeGauge.setAttribute('aria-valuenow', String(Math.round(progress*100)));
  routeGauge.setAttribute('aria-valuetext', `${Math.floor(s.distance-s.checkpoint)} / ${SEGMENT}m · あと${Math.ceil(SEGMENT-(s.distance-s.checkpoint))}m`);
  document.querySelector('#camp-value')!.textContent = `⌂ ${s.checkpoint+SEGMENT}m`;
  document.querySelector('#origin-value')!.textContent = `${s.checkpoint}m`;
}
function renderUI(force=false): void {
  const signature=[intro,s.mode,selected,inspecting,height,s.growth,s.fossils,s.checkpoint,s.mutations.join(),s.unlocked.join()].join('|');
  if(!force&&lastSignature===signature)return;lastSignature=signature;
  const scroll=ui.querySelector('.choices-scroll')?.scrollTop ?? 0;
  const focus=(document.activeElement as HTMLElement)?.dataset;
  game.dataset.mode=intro?'title':s.mode;
  handle.hidden=intro||!['running','body'].includes(s.mode);
  handle.setAttribute('aria-label',s.mode==='body'?'身体を戻して遠征を再開する':'身体を引き上げて変異する');
  handle.querySelector('small')!.textContent=s.mode==='body'?'再開 ↑':'変異 / PAUSE';
  if(s.mode==='body')canvas.setAttribute('aria-label','古代龍蛇の身体全体。部位を選んで変異を比較');
  if(intro){
    ui.innerHTML=`<section class="title"><p class="eyebrow">CONTINUOUS EXPEDITION</p><h1>まだ、<br>先へ。</h1><button class="primary" data-action="start">${saved?'CONTINUE':'START'}<span>↗</span></button>${saved?'<button class="text-button" data-action="reset">NEW EXPEDITION</button>':''}</section>`;
  }else if(s.mode==='body'){
    ui.innerHTML=bodyUI(s,selected,inspecting,height);
  }else if(s.mode==='camp'){
    const available=MUTATIONS.filter(m=>!s.unlocked.includes(m.id));
    ui.innerHTML=`<section class="rest"><p class="eyebrow">${s.checkpoint} m · 拠点</p><h2>ひと息ついて、<br>また先へ。</h2><p class="rest-copy">身体を休めて、次の区間へ。<br>次は${s.checkpoint/SEGMENT%3===1?'重い獣の足跡が多い':s.checkpoint/SEGMENT%3===2?'速い獣の足跡が続く':'小さな虫の群れが見える'}。</p>${available.length?`<div class="unlock-heading">遺骨の記憶 <b>✧ ${s.fossils}</b><small>新しい身体のかたちを覚える</small></div><div class="unlocks">${available.map(m=>`<button data-unlock="${m.id}" ${s.fossils<1?'disabled':''}><span>${m.name}</span><small>${m.description}</small><b>解禁 · ✧ 1</b></button>`).join('')}</div>`:'<p class="rest-copy">すべての変異を覚えた。<br>次は、どの組み合わせにしよう。</p>'}<button class="primary" data-action="depart">身体を組み直す <span>↑</span></button><p class="tiny">区間変異と成長資源をリセット · 解禁は残る</p></section>`;
  }else if(s.mode==='fallen'){
    ui.innerHTML=`<section class="rest fallen"><p class="eyebrow">前進が止まった</p><h2>少し、戻ろう。</h2><p class="rest-copy">押し寄せる群れに、身体が沈んだ。<br>${s.checkpoint} m の拠点で組み直せる。</p><button class="primary" data-action="depart">拠点で身体を組み直す <span>↺</span></button><p class="tiny">覚えた変異は、そのまま残る</p></section>`;
  }else ui.innerHTML='';
  const scroller=ui.querySelector('.choices-scroll');if(scroller)scroller.scrollTop=scroll;
  if(focus?.inspect)ui.querySelector<HTMLButtonElement>(`[data-inspect="${focus.inspect}"]`)?.focus({preventScroll:true});
  updateHUD(.1);
}
ui.addEventListener('click',event=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
  if(button.dataset.part){selected=button.dataset.part as Part;inspecting=null;}
  else if(button.dataset.inspect){inspecting=button.dataset.inspect as MutationId;}
  else if(button.dataset.related){inspecting=button.dataset.related as MutationId;selected=MUTATIONS.find(m=>m.id===inspecting)!.part;}
  else if(button.dataset.mutate){if(mutate(s,button.dataset.mutate as MutationId))persist();}
  else if(button.dataset.unlock){if(unlock(s,button.dataset.unlock as MutationId))persist();}
  else switch(button.dataset.action){
    case 'start':intro=false;if(s.mode==='title')start(s);else if(s.mode==='body')s.mode='running';persist();break;
    case 'close':selected=null;inspecting=null;break;
    case 'depart':depart(s);selected=null;persist();break;
    case 'reset':{
      const dialog=document.createElement('dialog');dialog.className='reset-dialog';dialog.innerHTML='<h2>はじめから進む？</h2><p>この端末の進行と解禁を消して、新しい遠征を始めます。</p><form method="dialog"><button value="cancel">戻る</button><button value="reset">はじめから</button></form>';
      game.append(dialog);dialog.addEventListener('close',()=>{if(dialog.returnValue==='reset'){s=createState();saved=null;persist();renderUI(true);}dialog.remove();});dialog.showModal();break;
    }
  }
  renderUI(true);
  if(button.dataset.inspect||button.dataset.related)ui.querySelector('.mutation-detail')?.scrollIntoView({block:'nearest'});
  else if(button.dataset.part){const scroller=ui.querySelector('.choices-scroll');if(scroller)scroller.scrollTop=0;}
});
handle.addEventListener('click',()=>{if(!suppressClick)toggleBody();});
let pointer: {x:number;y:number;active:boolean;id:number}|null=null,suppressClick=false;
game.addEventListener('pointerdown',event=>{
  const target=event.target as Element;
  if(target.closest('#ui,dialog'))return;
  const rect=game.getBoundingClientRect(), y=(event.clientY-rect.top)/rect.height;
  pointer={x:event.clientX,y:event.clientY,active:!intro&&(s.mode==='body'||s.mode==='running'&&y>.73),id:event.pointerId};
  suppressClick=false;
});
game.addEventListener('pointerup',event=>{
  if(!pointer||pointer.id!==event.pointerId)return;
  const dy=event.clientY-pointer.y,dx=event.clientX-pointer.x;
  if(pointer.active&&Math.abs(dy)>40&&Math.abs(dy)>Math.abs(dx)){
    if(s.mode==='running'&&dy<0||s.mode==='body'&&dy>0){suppressClick=true;toggleBody();setTimeout(()=>{suppressClick=false;},150);}
  }else if(pointer.active&&Math.abs(dy)<10&&event.target===canvas&&s.mode==='running')toggleBody();
  pointer=null;
});
game.addEventListener('pointercancel',()=>{pointer=null;});
document.addEventListener('keydown',event=>{if((event.code==='Space'||event.code==='Escape')&&!(event.target instanceof HTMLButtonElement)&&!document.querySelector('dialog[open]')){event.preventDefault();if(selected&&event.code==='Escape'){selected=null;renderUI(true);}else toggleBody();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(s.mode==='running'){s.mode='body';selected=null;}accumulator=0;persist();renderUI(true);}});
window.addEventListener('pagehide',persist);
function frame(now: number): void {
  const dt=last?Math.min(.1,(now-last)/1000):0;last=now;idle+=dt;
  if(!intro&&s.mode==='running'&&!document.hidden&&reveal<.03){accumulator+=dt;while(accumulator>=1/60){step(s,1/60);accumulator-=1/60;if(s.mode!=='running'){accumulator=0;persist();break;}}}else accumulator=0;
  const target=!intro&&s.mode==='body'?1:0;reveal+=(target-reveal)*Math.min(1,dt*9);
  // Resume only after the body has settled back into the battlefield.
  if(reveal>.02&&target===0&&s.mode==='running')accumulator=0;
  draw(ctx,s,{height,reveal,idle,reducedMotion:reducedMotion.matches});renderUI();updateHUD(dt);
  saveClock+=dt;if(saveClock>=3&&!intro){persist();saveClock=0;}
  if(noticeTimer>0){noticeTimer-=dt;if(noticeTimer<=0)notice.classList.remove('show');}
  requestAnimationFrame(frame);
}
resize();renderUI(true);requestAnimationFrame(frame);
