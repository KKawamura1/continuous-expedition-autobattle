import { CAMP_INTERVAL, ROSTER, UPGRADES, STEP, buy, createGame, describe, format, pause, price, refundAtCamp, resume, retreat, step, validateSave } from './simulation.js';
import './style.css';

const SAVE_KEY = 'continuous-expedition-prototype-v1';
const app = document.querySelector('#app');
let game;
try { game = validateSave(JSON.parse(localStorage.getItem(SAVE_KEY))) || createGame(); }
catch { game = createGame(); }
let showAll = false;
let shopGroup = 'structure';
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
      <canvas id="battle" role="img" aria-label="敵が上から現れ、下の5人が自動で戦う戦場"></canvas>
      <div class="battle-overlay"><span id="fieldLabel">坑口の境界</span><span class="live" id="liveTag">一時停止中</span></div>
      <div class="battle-footer"><span>↑ 敵の流入</span><span>前線 · 自律戦闘</span><span>↓ 調査隊</span></div>
    </section>
    <section class="readout" aria-label="観測値">
      <div><span>滞留</span><strong id="crowd">0</strong><small>体</small></div>
      <div><span>撃破圧</span><strong id="killRate">0.0</strong><small>/秒</small></div>
      <div><span>被害</span><strong id="damageRate">0.0</strong><small>/秒</small></div>
      <div><span>収入</span><strong id="incomeRate">0.0</strong><small>G/秒</small></div>
    </section>
    <p class="observation" id="observation"></p>
    <section class="crew" aria-label="調査隊"><div class="section-title">調査隊 <span>5人</span></div><div id="crewRows"></div></section>
    <div class="control-dock"><div class="wallet"><span>遠征資金</span><strong><span id="coins">0</span> G</strong></div><button id="pauseButton" class="primary">改造・一時停止</button><button id="speedButton" class="speed-button" aria-label="再生速度">1×</button></div>
    <section class="workshop" id="workshop" aria-label="一時停止中の工房">
      <div class="workshop-head"><div><span class="eyebrow">THE WORKSHOP</span><h2 id="workshopTitle">遠征を始める</h2></div><span class="workshop-status" id="workshopStatus">停止中</span></div>
      <p id="workshopIntro"></p>
      <div class="comparison" id="comparison" hidden></div>
      <div class="shop-tabs" role="group" aria-label="改造の種類"><button data-group="structure">戦い方を変える</button><button data-group="tuning">性能を調整する</button></div>
      <div class="shop-list" id="shopList"></div>
      <button id="showAll" class="secondary full">全ての候補を見る</button>
      <div class="workshop-actions"><button id="refund" class="secondary">全額を再配分</button><button id="retreat" class="secondary danger">拠点へ撤退</button></div>
      <button id="resume" class="primary full">進軍を再開 ↗</button>
    </section>
    <section class="journal"><div class="section-title">観測記録 <span id="best"></span></div><p id="event"></p></section>
    <footer>試作版 · 進軍式と数値はプレイで検証する仮説です</footer>
  </main>`;

const $ = id => document.getElementById(id);
const canvas = $('battle');
const ctx = canvas.getContext('2d');
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch { /* Storage may be disabled. Play remains available. */ } };
const number = n => Math.round(n).toLocaleString('ja-JP');
const sign = n => `${n >= 0 ? '+' : ''}${format(n)}`;

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
  document.querySelectorAll('.shop-tabs button').forEach(button => button.classList.toggle('selected', button.dataset.group === shopGroup));
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
  $('crowd').textContent = game.enemies.filter(e => e.y > .47).length;
  $('killRate').textContent = format(game.rates.kills);
  $('damageRate').textContent = format(game.rates.damage);
  $('incomeRate').textContent = format(game.rates.income);
  $('observation').textContent = describe(game);
  $('coins').textContent = number(game.coins);
  $('best').textContent = `最高 ${number(game.best)}m`;
  $('event').textContent = game.events[0] || '';
  $('crewRows').innerHTML = game.allies.map(a => {
    const person = ROSTER.find(r => r.id === a.id);
    return `<div class="crew-row"><i style="background:${person.color}"></i><span>${person.name}</span><div class="hp"><b style="width:${Math.max(0, 100 * a.hp / a.maxHp)}%;background:${person.color}"></b></div><small>${Math.ceil(a.hp)}${a.shield > 0 ? ` +${Math.ceil(a.shield)}` : ''}</small></div>`;
  }).join('');
  $('liveTag').textContent = game.paused ? '一時停止中' : `${game.speed}× 進軍中`;
  $('liveTag').classList.toggle('running', !game.paused);
  $('speedButton').textContent = `${game.speed}×`;
  $('pauseButton').textContent = game.paused ? (game.pauseReason === 'start' ? '進軍を始める' : '工房を表示') : '改造・一時停止';
  $('workshop').hidden = !game.paused;
  if (game.paused && force) {
    $('workshopTitle').textContent = game.pauseReason === 'camp' ? '中継拠点' : game.pauseReason === 'danger' ? '前線が危険域' : game.pauseReason === 'start' ? '遠征を始める' : '戦闘機械を改造';
    $('workshopIntro').textContent = game.pauseReason === 'camp'
      ? 'この地点を保存しました。購入分も含めて再配分できます。準備ができたら、そのまま奥へ進みましょう。'
      : game.pauseReason === 'danger' ? 'ここで時間は止まっています。手持ちの資金で改造して押し返すか、中継拠点へ戻れます。'
      : game.pauseReason === 'start' ? '5人の調査隊が自律して戦います。敵の滞留と被害を観察し、好きなときに止めて改造してください。'
      : '購入した効果はすぐに反映されます。再開して前線の変化を観察しましょう。';
    $('refund').hidden = game.pauseReason !== 'camp';
    $('retreat').hidden = game.pauseReason === 'start' || game.pauseReason === 'camp';
    $('comparison').hidden = !game.comparison;
    if (game.comparison) $('comparison').textContent = `直前の改造: ${game.comparison.name}　改造前の進軍 ${sign(game.comparison.velocity)} m/s · 被害 ${format(game.comparison.damage)}/秒。再開後の観測値と比べられます。`;
    updateShop();
  }
}

$('pauseButton').addEventListener('click', () => { if (game.pauseReason === 'start') { resume(game); save(); updateUi(true); return; } if (!game.paused) { pause(game); save(); updateUi(true); } $('workshop').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('resume').addEventListener('click', () => { resume(game); save(); updateUi(true); window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('speedButton').addEventListener('click', () => { game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 4 : 1; save(); updateUi(true); });
$('refund').addEventListener('click', () => { if (refundAtCamp(game)) { save(); updateUi(true); } });
$('retreat').addEventListener('click', () => { if (retreat(game)) { save(); updateUi(true); } });
$('showAll').addEventListener('click', () => { showAll = true; updateShop(); });
$('shopList').addEventListener('click', event => { const id = event.target.closest('[data-buy]')?.dataset.buy; if (id && buy(game, id)) { save(); updateUi(true); } });
document.querySelectorAll('.shop-tabs button').forEach(button => button.addEventListener('click', () => { shopGroup = button.dataset.group; showAll = false; updateShop(); }));
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(game); save(); } else { lastFrame = 0; accumulator = 0; updateUi(true); } });

function resize() {
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
  ctx.setTransform(canvas.width, 0, 0, canvas.height, 0, 0);
}
window.addEventListener('resize', resize);

function draw() {
  const t = game.distance;
  const bg = ctx.createLinearGradient(0, 0, 0, 1);
  bg.addColorStop(0, '#344251'); bg.addColorStop(.55, '#263641'); bg.addColorStop(1, '#192b35');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1, 1);
  ctx.strokeStyle = 'rgba(192,213,207,.07)'; ctx.lineWidth = .002;
  for (let i = 0; i < 9; i++) {
    const y = ((i / 8 + t / 240) % 1);
    ctx.beginPath(); ctx.moveTo(.04, y); ctx.lineTo(.96, y); ctx.stroke();
  }
  ctx.setLineDash([.009, .02]); ctx.strokeStyle = 'rgba(172,204,193,.13)';
  for (const x of [.12, .5, .88]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(10,24,31,.25)'; ctx.fillRect(0, .67, 1, .33);
  ctx.strokeStyle = '#92bcae'; ctx.lineWidth = .003; ctx.setLineDash([.03, .015]);
  ctx.beginPath(); ctx.moveTo(.04, .68); ctx.lineTo(.96, .68); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.setTransform(canvas.width / canvas.clientWidth, 0, 0, canvas.height / canvas.clientHeight, 0, 0);
  ctx.font = '600 10px system-ui'; ctx.fillStyle = 'rgba(194,219,207,.7)'; ctx.fillText('FRONT LINE', .05 * canvas.clientWidth, .665 * canvas.clientHeight); ctx.restore();
  for (const e of game.enemies) {
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + .012, e.radius * 1.25, e.radius * .55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = e.flash > 0 ? '#fff4d5' : e.color; ctx.strokeStyle = '#12242d'; ctx.lineWidth = .005;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (e.id === 'heavy') { ctx.strokeStyle = '#ddd0e8'; ctx.lineWidth = .004; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * .63, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#182830'; ctx.fillRect(e.x - e.radius, e.y - e.radius - .015, e.radius * 2, .005);
    ctx.fillStyle = '#e6bc83'; ctx.fillRect(e.x - e.radius, e.y - e.radius - .015, e.radius * 2 * Math.max(0, e.hp / e.maxHp), .005);
  }
  for (const a of game.allies) {
    const person = ROSTER.find(r => r.id === a.id);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(a.x, a.y + .015, .046, .015, 0, 0, 7); ctx.fill();
    if (a.shield > 0) { ctx.strokeStyle = '#b4ded4'; ctx.lineWidth = .006; ctx.beginPath(); ctx.arc(a.x, a.y, .048, 0, 7); ctx.stroke(); }
    ctx.fillStyle = a.hp > 0 ? person.color : '#58656a'; ctx.strokeStyle = '#e6e2ce'; ctx.lineWidth = .004;
    ctx.beginPath(); ctx.arc(a.x, a.y, .031, 0, 7); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.setTransform(canvas.width / canvas.clientWidth, 0, 0, canvas.height / canvas.clientHeight, 0, 0);
    ctx.fillStyle = '#1a2930'; ctx.textAlign = 'center'; ctx.font = 'bold 13px system-ui'; ctx.fillText(person.name[0], a.x * canvas.clientWidth, a.y * canvas.clientHeight + 4);
    ctx.fillStyle = 'rgba(234,237,222,.9)'; ctx.font = '10px system-ui'; ctx.fillText(person.name, a.x * canvas.clientWidth, (a.y + .063) * canvas.clientHeight); ctx.restore();
  }
  ctx.textAlign = 'left';
  for (const fx of game.effects) {
    ctx.globalAlpha = Math.min(1, fx.life / .3);
    ctx.strokeStyle = fx.color; ctx.fillStyle = fx.color; ctx.lineWidth = .006;
    if (fx.kind === 'burst') { ctx.beginPath(); ctx.arc(fx.x, fx.y, (.42 - fx.life) * .11, 0, 7); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.lineTo(fx.toX, fx.toY); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  // Framing bands keep labels and combat readable over any device width.
  ctx.fillStyle = 'rgba(17,30,37,.35)'; ctx.fillRect(0, 0, .025, 1); ctx.fillRect(.975, 0, .025, 1);
}
function frame(now) {
  if (!lastFrame) lastFrame = now;
  const elapsed = Math.min(.15, (now - lastFrame) / 1000); lastFrame = now;
  if (!game.paused) {
    accumulator += elapsed * game.speed;
    let iterations = 0;
    while (accumulator >= STEP && iterations++ < 20 && !game.paused) { step(game, STEP); accumulator -= STEP; }
    if (iterations >= 20) accumulator = 0;
  } else accumulator = 0;
  draw();
  if (now - lastUi > 220 || game.paused && !lastUi) {
    if (game.paused && $('workshop').hidden) { save(); updateUi(true); }
    else updateUi(false);
    lastUi = now;
  }
  if (now - lastSave > 5000) { save(); lastSave = now; }
  requestAnimationFrame(frame);
}
resize(); updateUi(true); requestAnimationFrame(frame);
