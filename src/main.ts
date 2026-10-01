import {
  CAMP_INTERVAL, STEP, nearbyEnemyCount, buy, createGame, describe, format, pause, price,
  refundAtCamp, resume, retreat, step
} from './simulation.ts';
import { createBattleRenderer } from './canvas.ts';
import { ROSTER, UPGRADES } from './content.ts';
import { decodeSave, encodeSave, SAVE_KEY } from './save.ts';
import type { GameState, UpgradeGroup } from './types.ts';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Game root element #app was not found.');
let game: GameState;
try {
  const stored = localStorage.getItem(SAVE_KEY);
  game = decodeSave(stored) || createGame();
}
catch { game = createGame(); }
let showAll = false;
let shopGroup: UpgradeGroup = 'structure';
let lastFrame = 0;
let accumulator = 0;
let lastSave = 0;
let lastUi = 0;

app.innerHTML = `
  <main class="shell">
    <header class="masthead">
      <div class="eyebrow">FIELD RECORD <span>●</span> 01 / THE SHAFT</div>
      <div class="brand"><div><h1>坑の前線</h1><p>観測 · 改造 · 進軍</p></div><span class="chapter" id="chapter">旧市街 / 坑口</span></div>
    </header>
    <section class="dashboard" aria-label="遠征の状況">
      <div class="distance"><div class="metric-label">現在地点 <span id="milestone">次の拠点まで 300m</span></div><div class="distance-value"><strong id="distance">0</strong><span>m</span></div></div>
      <div class="velocity"><div class="metric-label">進軍速度</div><strong id="velocity">+0.0</strong><span> m/s</span><div class="velocity-meter"><i id="velocityBar"></i></div></div>
    </section>
    <div class="track"><div id="trackFill"></div><span id="trackStart">0m</span><span id="trackEnd">300m 拠点</span></div>
    <section class="battle-panel" aria-label="戦場">
      <canvas id="battle" role="img" aria-label="坑道を進み、敵と遭遇して5人が自律して戦う戦場"></canvas>
      <div class="battle-overlay"><span id="fieldLabel">坑口の境界</span><span class="live" id="liveTag">一時停止中</span></div>
      <div class="battle-footer"><span>↑ 未探索の坑道</span><span>前線 · 自律戦闘</span><span>↓ 調査隊</span></div>
    </section>
    <section class="readout" aria-label="観測値">
      <div><span>滞留</span><strong id="crowd">0</strong><small>体</small></div>
      <div><span>撃破圧</span><strong id="killRate">0.0</strong><small>/秒</small></div>
      <div><span>被害</span><strong id="damageRate">0.0</strong><small id="recoveryRate">回復 0.0/秒</small></div>
      <div><span>収入</span><strong id="incomeRate">0.0</strong><small>G/秒</small></div>
    </section>
    <p class="observation" id="observation"></p>
    <section class="crew" aria-label="調査隊"><div class="section-title">調査隊 <span>5人</span></div><div id="crewRows"></div></section>
    <div class="control-dock"><div class="wallet"><span>遠征資金</span><strong><span id="coins">0</span> G</strong></div><button id="pauseButton" class="primary">改造・一時停止</button><button id="speedButton" class="speed-button" aria-label="再生速度">1×</button></div>
    <section class="workshop" id="workshop" aria-label="一時停止中の工房">
      <div class="workshop-head"><div><span class="eyebrow">THE WORKSHOP</span><h2 id="workshopTitle">遠征を始める</h2></div><span class="workshop-status" id="workshopStatus">停止中</span></div>
      <p id="workshopIntro"></p>
      <div class="collapse-notice" id="collapseNotice" hidden><strong>最高到達地点 <span id="collapseBest">0</span>m</strong><p>戦闘不能になった仲間は、拠点で全員復帰します。</p></div>
      <div class="comparison" id="comparison" hidden></div>
      <div class="shop-tabs" id="shopTabs" role="group" aria-label="改造の種類"><button data-group="structure">戦い方を変える</button><button data-group="tuning">性能を調整する</button></div>
      <div class="shop-list" id="shopList"></div>
      <button id="showAll" class="secondary full">全ての候補を見る</button>
      <div class="workshop-actions"><button id="refund" class="secondary">全額を再配分</button><button id="retreat" class="secondary danger">拠点へ撤退</button></div>
      <button id="resume" class="primary full">進軍を再開 ↗</button>
    </section>
    <section class="journal"><div class="section-title">観測記録 <span id="best"></span></div><p id="event"></p></section>
    <footer>試作版 · 移動ルールと数値はプレイで検証する仮説です</footer>
  </main>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error('Game element #' + id + ' was not found.');
  return element as T;
};
const canvas = $<HTMLCanvasElement>('battle');
const renderer = createBattleRenderer(canvas);
const save = () => { try { localStorage.setItem(SAVE_KEY, encodeSave(game)); } catch { /* Storage may be disabled. Play remains available. */ } };
const number = (n: number): string => Math.round(n).toLocaleString('ja-JP');
const sign = (n: number): string => (n >= 0 ? '+' : '') + format(n);

function updateShop() {
  const list = UPGRADES.filter(u => u.group === shopGroup);
  const visible = showAll ? list : list.slice(0, 3);
  $('shopList').innerHTML = visible.map(u => {
    const acquired = game.upgrades[u.id] || 0;
    const max = u.max || 1;
    const full = acquired >= max;
    const affordable = game.coins >= price(game, u.id);
    return `<article class="upgrade ${full ? 'owned' : ''}"><div class="upgrade-top"><span class="owner">${u.owner}</span><span class="upgrade-level">${acquired ? `${acquired}/${max} 取得` : '未取得'}</span></div><h3>${u.name}</h3><p>${u.description}</p><button data-buy="${u.id}" ${full || !affordable ? 'disabled' : ''}>${full ? '組み込み済み' : `${price(game, u.id)} G で購入`}</button></article>`;
  }).join('');
  $('showAll').hidden = showAll || list.length <= 3;
  document.querySelectorAll<HTMLButtonElement>('.shop-tabs button').forEach(button => button.classList.toggle('selected', button.dataset.group === shopGroup));
}
function updateUi(force = false) {
  $('distance').textContent = number(game.distance);
  $('velocity').textContent = sign(game.velocity);
  $('velocity').className = game.velocity < -.3 ? 'negative' : game.velocity > .3 ? 'positive' : '';
  const ratio = Math.min(1, Math.abs(game.velocity) / 6.5);
  $('velocityBar').style.width = `${ratio * 50}%`;
  $('velocityBar').style.left = game.velocity >= 0 ? '50%' : `${50 - ratio * 50}%`;
  $('velocityBar').classList.toggle('negative', game.velocity < 0);
  const segment = Math.floor(game.camp / CAMP_INTERVAL);
  $('trackFill').style.width = `${Math.min(100, (game.distance - game.camp) / CAMP_INTERVAL * 100)}%`;
  $('trackStart').textContent = `${game.camp}m`;
  $('trackEnd').textContent = `${(segment + 1) * CAMP_INTERVAL}m 拠点`;
  $('milestone').textContent = game.pauseReason === 'camp' ? '中継拠点に到達' : `次の拠点まで ${Math.max(0, Math.ceil((segment + 1) * CAMP_INTERVAL - game.distance))}m`;
  $('chapter').textContent = segment === 0 ? '旧市街 / 坑口' : segment === 1 ? '坑内 / 記録層' : `坑内 / 深度 ${segment + 1}`;
  $('fieldLabel').textContent = segment === 0 ? '坑口の境界' : segment === 1 ? '記録の残る層' : '未知の坑道';
  $('crowd').textContent = String(nearbyEnemyCount(game));
  $('killRate').textContent = format(game.rates.kills);
  $('damageRate').textContent = format(game.rates.damage);
  $('recoveryRate').textContent = `回復 ${format(game.rates.recovery)}/秒`;
  $('incomeRate').textContent = format(game.rates.income);
  $('observation').textContent = describe(game);
  $('coins').textContent = number(game.coins);
  $('best').textContent = `最高 ${number(game.best)}m`;
  $('event').textContent = game.events[0] || '';
  $('crewRows').innerHTML = game.allies.map(a => {
    const person = ROSTER.find(r => r.id === a.id)!;
    const health = a.status === 'downed' ? `戦闘不能 · ${Math.ceil(a.reviveIn)}秒` : `${Math.ceil(a.hp)}${a.shield > 0 ? ` +${Math.ceil(a.shield)}` : ''}`;
    return `<div class="crew-row ${a.status === 'downed' ? 'downed' : ''}"><i style="background:${person.color}"></i><span>${person.name}</span><div class="hp"><b style="width:${Math.max(0, 100 * a.hp / a.maxHp)}%;background:${person.color}"></b></div><small>${health}</small></div>`;
  }).join('');
  $('liveTag').textContent = game.pauseReason === 'collapse' ? '戦線崩壊' : game.paused ? '一時停止中' : `${game.speed}× 進軍中`;
  $('liveTag').classList.toggle('running', !game.paused);
  $('liveTag').classList.toggle('collapsed', game.pauseReason === 'collapse');
  $('speedButton').textContent = `${game.speed}×`;
  $('pauseButton').textContent = game.pauseReason === 'collapse' ? '戦線崩壊' : game.paused ? (game.pauseReason === 'start' ? '進軍を始める' : '進軍を再開') : '改造・一時停止';
  $<HTMLButtonElement>('pauseButton').disabled = game.pauseReason === 'collapse';
  $('workshop').hidden = !game.paused;
  if (game.paused && force) {
    const collapsed = game.pauseReason === 'collapse';
    $('workshopTitle').textContent = collapsed ? '戦線崩壊' : game.pauseReason === 'camp' ? '中継拠点' : game.pauseReason === 'danger' ? '前線が危険域' : game.pauseReason === 'start' ? '遠征を始める' : '戦闘機械を改造';
    $('workshopIntro').textContent = game.pauseReason === 'camp'
      ? 'この地点を保存しました。購入分も含めて再配分できます。準備ができたら、そのまま奥へ進みましょう。'
      : game.pauseReason === 'danger' ? 'ここで時間は止まっています。手持ちの資金で改造して押し返すか、中継拠点へ戻れます。'
      : collapsed ? '調査隊が戦闘を継続できません。最後の拠点へ撤退して態勢を立て直してください。'
      : game.pauseReason === 'start' ? '5人の調査隊が自律して戦います。敵の滞留と被害を観察し、好きなときに止めて改造してください。'
      : '購入した効果はすぐに反映されます。再開して前線の変化を観察しましょう。';
    $('collapseNotice').hidden = !collapsed;
    $('collapseBest').textContent = number(game.best);
    $('shopTabs').hidden = collapsed;
    $('shopList').hidden = collapsed;
    $('showAll').hidden = collapsed || showAll || UPGRADES.filter(u => u.group === shopGroup).length <= 3;
    $('refund').hidden = collapsed || game.pauseReason !== 'camp';
    $('retreat').hidden = game.pauseReason === 'start' || game.pauseReason === 'camp';
    $('resume').hidden = collapsed;
    $('comparison').hidden = !game.comparison;
    if (game.comparison) $('comparison').textContent = `直前の改造: ${game.comparison.name}　改造前の進軍 ${sign(game.comparison.velocity)} m/s · 被害 ${format(game.comparison.damage)}/秒。再開後の観測値と比べられます。`;
    if (!collapsed) updateShop();
  }
}

function resumeExpedition(): void {
  if (!resume(game)) { save(); updateUi(true); return; }
  save();
  updateUi(true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('pauseButton').addEventListener('click', () => {
  if (game.paused) resumeExpedition();
  else {
    pause(game);
    save();
    updateUi(true);
    $('workshop').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
$('resume').addEventListener('click', resumeExpedition);
$('speedButton').addEventListener('click', () => { game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 4 : 1; save(); updateUi(true); });
$('refund').addEventListener('click', () => { if (refundAtCamp(game)) { save(); updateUi(true); } });
$('retreat').addEventListener('click', () => { if (retreat(game)) { save(); updateUi(true); } });
$('showAll').addEventListener('click', () => { showAll = true; updateShop(); });
$('shopList').addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const id = event.target.closest<HTMLButtonElement>('[data-buy]')?.dataset.buy;
  if (id && buy(game, id)) { save(); updateUi(true); }
});
document.querySelectorAll<HTMLButtonElement>('.shop-tabs button').forEach(button => button.addEventListener('click', () => {
  const group = button.dataset.group;
  if (group === 'structure' || group === 'tuning') shopGroup = group;
  showAll = false;
  updateShop();
}));
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(game); save(); } else { lastFrame = 0; accumulator = 0; updateUi(true); } });

window.addEventListener('resize', renderer.resize);

function frame(now: number): void {
  if (!lastFrame) lastFrame = now;
  const elapsed = Math.min(.15, (now - lastFrame) / 1000); lastFrame = now;
  if (!game.paused) {
    accumulator += elapsed * game.speed;
    let iterations = 0;
    while (accumulator >= STEP && iterations++ < 20 && !game.paused) { step(game, STEP); accumulator -= STEP; }
    if (iterations >= 20) accumulator = 0;
  } else accumulator = 0;
  renderer.draw(game);
  if (now - lastUi > 220 || game.paused && !lastUi) {
    if (game.paused && $('workshop').hidden) {
      save();
      updateUi(true);
      $('workshop').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    else updateUi(false);
    lastUi = now;
  }
  if (now - lastSave > 5000) { save(); lastSave = now; }
  requestAnimationFrame(frame);
}
renderer.resize(); updateUi(true); requestAnimationFrame(frame);
