import './style.css';
import { draw } from './canvas';
import { MUTATIONS, PARTS, SEGMENT } from './content';
import { cost, createState, depart, mutate, start, step, unlock } from './simulation';
import { decode, encode, SAVE_KEY } from './save';
import type { MutationId, Part, State } from './types';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main id="game" aria-label="巨大生物の連続遠征"><canvas id="field" aria-label="古代龍蛇と少女が荒野を進む戦場"></canvas><div id="ui"></div><button id="handle" aria-label="身体を引き上げて変異する"><span></span><small>身体を引き上げる</small></button><div id="notice" role="status"></div></main>`;
const game = document.querySelector<HTMLElement>('#game')!;
const canvas = document.querySelector<HTMLCanvasElement>('#field')!;
const ctx = canvas.getContext('2d')!;
const ui = document.querySelector<HTMLDivElement>('#ui')!;
const handle = document.querySelector<HTMLButtonElement>('#handle')!;
const notice = document.querySelector<HTMLDivElement>('#notice')!;
let saved: State | null = null;
try { saved = decode(localStorage.getItem(SAVE_KEY)); } catch { /* Storage can be unavailable in private browsing. */ }
let s = saved ?? createState();
let intro = true, selected: Part | null = null, reveal = 0, height = 844, idle = 0, last = 0, accumulator = 0, saveClock = 0, noticeTimer = 0;
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
  if(s.mode==='running'){s.mode='body';selected=null;persist();}
  else if(s.mode==='body'){s.mode='running';selected=null;accumulator=0;persist();}
  renderUI(true);
}
function mutationButtons(part: Part): string {
  return MUTATIONS.filter(m=>m.part===part).map(m=>{
    const owned=s.mutations.includes(m.id),locked=!s.unlocked.includes(m.id),price=cost(s,m.id);
    return `<button class="mutation ${owned?'owned':''}" data-mutate="${m.id}" ${owned||locked||s.growth<price?'disabled':''}><span class="mutation-title">${m.name}<b>${owned?'変異済み':locked?'拠点で解禁':`◇ ${price}`}</b></span><span class="description">${m.description}</span></button>`;
  }).join('');
}
function renderUI(force=false): void {
  const signature=[intro,s.mode,selected,s.growth,s.fossils,s.checkpoint,s.mutations.join(),s.unlocked.join()].join('|');
  if(!force&&lastSignature===signature)return;lastSignature=signature;
  game.dataset.mode=intro?'title':s.mode;
  handle.hidden=intro||!['running','body'].includes(s.mode);
  handle.setAttribute('aria-label',s.mode==='body'?'身体を戻して遠征を再開する':'身体を引き上げて変異する');
  handle.querySelector('small')!.textContent=s.mode==='body'?'身体を戻して進む':(s.kills<4?'身体を引き上げる':'');
  if(intro){
    ui.innerHTML=`<section class="title"><p class="eyebrow">CONTINUOUS EXPEDITION</p><h1>まだ、先へ。</h1><p class="subtitle">古代龍蛇と、ひとりの少女</p><div class="title-mark">✧</div><button class="primary" data-action="start">${saved?'続きから':'START'}<span>↑</span></button>${saved?'<button class="text-button" data-action="reset">はじめから</button>':''}<p class="tiny">眺める。身体を変える。また進む。</p></section>`;
  }else if(s.mode==='body'){
    const positions=[.24,.35,.50,.65,.80];
    ui.innerHTML=`<section class="body-header"><p class="eyebrow">身体変異</p><h2>どんな身体で、進もうか。</h2><div class="resources"><span>成長資源 <b>◇ ${s.growth}</b></span><span>${Math.floor(s.distance)} / ${s.checkpoint+SEGMENT} m</span></div><p class="body-hint">部位を触れて変異する · 下へ戻すと再開</p></section><div class="parts">${PARTS.map((p,i)=>{
      const owned=MUTATIONS.filter(m=>m.part===p.id&&s.mutations.includes(m.id));
      return `<button class="part part-${p.id} ${selected===p.id?'selected':''}" style="top:${positions[i]*100}%" data-part="${p.id}"><span class="part-dot"></span><span>${p.name}<small>${owned.length?owned.map(m=>m.name).join('・'):p.note}</small></span><b>＋</b></button>`;
    }).join('')}</div>${selected?`<section class="choices" aria-label="${PARTS.find(p=>p.id===selected)!.name}の変異"><div class="choice-heading"><h3>${PARTS.find(p=>p.id===selected)!.name}</h3><button aria-label="変異候補を閉じる" data-action="close">×</button></div>${mutationButtons(selected)}<p class="choice-note">変異はこの区間に残る。拠点で身体を組み直す。</p></section>`:''}`;
  }else if(s.mode==='camp'){
    const available=MUTATIONS.filter(m=>!s.unlocked.includes(m.id));
    ui.innerHTML=`<section class="rest"><p class="eyebrow">${s.checkpoint} m · 拠点</p><h2>ひと息ついて、<br>また先へ。</h2><p class="rest-copy">身体を休めて、次の区間へ。<br>次は${s.checkpoint/SEGMENT%3===1?'重い獣の足跡が多い':s.checkpoint/SEGMENT%3===2?'速い獣の足跡が続く':'小さな虫の群れが見える'}。</p>${available.length?`<div class="unlock-heading">遺骨の記憶 <b>✧ ${s.fossils}</b><small>新しい身体のかたちを覚える</small></div><div class="unlocks">${available.map(m=>`<button data-unlock="${m.id}" ${s.fossils<1?'disabled':''}><span>${m.name}</span><small>${m.description}</small><b>解禁 · ✧ 1</b></button>`).join('')}</div>`:'<p class="rest-copy">すべての変異を覚えた。<br>次は、どの組み合わせにしよう。</p>'}<button class="primary" data-action="depart">身体を組み直す <span>↑</span></button><p class="tiny">区間変異と成長資源をリセット · 解禁は残る</p></section>`;
  }else if(s.mode==='fallen'){
    ui.innerHTML=`<section class="rest fallen"><p class="eyebrow">前進が止まった</p><h2>少し、戻ろう。</h2><p class="rest-copy">押し寄せる群れに、身体が沈んだ。<br>${s.checkpoint} m の拠点で組み直せる。</p><button class="primary" data-action="depart">拠点で身体を組み直す <span>↺</span></button><p class="tiny">覚えた変異は、そのまま残る</p></section>`;
  }else ui.innerHTML='';
}
ui.addEventListener('click',event=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
  if(button.dataset.part){selected=button.dataset.part as Part;}
  else if(button.dataset.mutate){if(mutate(s,button.dataset.mutate as MutationId))persist();}
  else if(button.dataset.unlock){if(unlock(s,button.dataset.unlock as MutationId))persist();}
  else switch(button.dataset.action){
    case 'start':intro=false;if(s.mode==='title')start(s);else if(s.mode==='body')s.mode='running';persist();break;
    case 'close':selected=null;break;
    case 'depart':depart(s);selected=null;persist();break;
    case 'reset':{
      const dialog=document.createElement('dialog');dialog.className='reset-dialog';dialog.innerHTML='<h2>はじめから進む？</h2><p>この端末の進行と解禁を消して、新しい遠征を始めます。</p><form method="dialog"><button value="cancel">戻る</button><button value="reset">はじめから</button></form>';
      game.append(dialog);dialog.addEventListener('close',()=>{if(dialog.returnValue==='reset'){s=createState();saved=null;persist();renderUI(true);}dialog.remove();});dialog.showModal();break;
    }
  }
  renderUI(true);
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
  draw(ctx,s,{height,reveal,idle});renderUI();
  saveClock+=dt;if(saveClock>=3&&!intro){persist();saveClock=0;}
  if(noticeTimer>0){noticeTimer-=dt;if(noticeTimer<=0)notice.classList.remove('show');}
  requestAnimationFrame(frame);
}
resize();renderUI(true);requestAnimationFrame(frame);
