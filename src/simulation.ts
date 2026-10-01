import { ENEMY_KINDS, ROSTER, UPGRADES } from './content.ts';
import type {
  AllyState, CampSnapshot, Comparison, DamageSource, EffectKind, EnemyState, GameState, UpgradeId
} from './types.ts';

// The simulation owns all game rules. Rendering and storage never mutate state directly.
export const STEP = 1 / 30;
export const CAMP_INTERVAL = 300;
export const RECOVERY_SECONDS = 9.5;
export const REVIVE_HP_RATIO = .45;
export const ENEMY_ATTACK_RANGE = .19;
export const DOWNED_RETREAT_DISTANCE = .08;
export const INJURY_RETREAT_DISTANCE = .18;
export const NAGI_GUARD_RADIUS = .3;
export const PASSIVE_RECOVERY_PER_SECOND = .45;
type Point = Pick<AllyState, 'x' | 'y'>;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const round = (value: number): number => Math.round(value * 10) / 10;
const random = (s: GameState): number => { s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0; return s.seed / 4294967296; };
const level = (s: GameState, id: UpgradeId): number => s.upgrades[id] || 0;
const alive = (s: GameState): EnemyState[] => s.enemies.filter(e => e.hp > 0);
const length = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const totalHp = (s: GameState): number => s.allies.reduce((sum, a) => sum + Math.max(0, a.hp), 0);
const maxHp = ROSTER.reduce((sum, a) => sum + a.hp, 0);
const active = (a: AllyState): boolean => a.status === 'active' && a.hp > 0;
const allDowned = (s: GameState): boolean => s.allies.every(a => a.status === 'downed');

function resetAlly(a: AllyState, fullHealth = true, position?: Point): void {
  const person = ROSTER.find(r => r.id === a.id)!;
  a.x = position?.x ?? person.x;
  a.y = position?.y ?? person.y;
  a.hp = fullHealth ? a.maxHp : a.maxHp * REVIVE_HP_RATIO;
  a.status = 'active';
  a.reviveIn = 0;
  a.shield = 0;
  a.cooldown = .3;
}

export function price(s: GameState, id: string): number {
  const upgrade = UPGRADES.find(u => u.id === id);
  if (!upgrade) return Infinity;
  return Math.round(upgrade.cost * 2.5 * (1 + .75 * level(s, upgrade.id)));
}

export function createGame(seed = 194): GameState {
  return {
    version: 3, seed: seed >>> 0, nextId: 1, time: 0, distance: 0, best: 0, peakSinceCamp: 0, camp: 0,
    velocity: 0, kills: 0, earnings: 0, coins: 0, spent: 0, upgrades: {},
    allies: ROSTER.map(a => ({ id: a.id, x: a.x, y: a.y, hp: a.hp, maxHp: a.hp, status: 'active', reviveIn: 0, shield: 0, cooldown: .3, casts: 0 })),
    enemies: [], effects: [], spawnIn: 1, paused: true, pauseReason: 'start', dangerAcknowledged: false, speed: 1,
    campSnapshot: null, stats: { kills: 0, damage: 0, recovery: 0, income: 0, collisions: 0, counter: 0, period: 0 },
    rates: { kills: 0, damage: 0, recovery: 0, income: 0 }, events: ['坑の入り口。前線の変化を見ながら進もう。'], comparison: null
  };
}

export function buy(s: GameState, id: string): boolean {
  if (!s.paused) return false;
  const u = UPGRADES.find(item => item.id === id);
  if (!u || level(s, u.id) >= (u.max || 1)) return false;
  const cost = price(s, u.id);
  if (s.coins < cost) return false;
  s.comparison = { ...s.rates, velocity: s.velocity, time: s.time, name: u.name } satisfies Comparison;
  s.coins -= cost;
  s.spent += cost;
  s.upgrades[u.id] = level(s, u.id) + 1;
  if (s.pauseReason === 'camp') s.campSnapshot = snapshot(s);
  log(s, `${u.name}を組み込んだ。再開して変化を見よう。`);
  return true;
}

export function refundAtCamp(s: GameState): boolean {
  if (!s.paused || s.pauseReason !== 'camp') return false;
  s.coins += s.spent;
  s.spent = 0;
  s.upgrades = {};
  s.comparison = null;
  s.campSnapshot = snapshot(s);
  log(s, '遠征資金をすべて戻した。ここから組み直せる。');
  return true;
}

function log(s: GameState, message: string): void { s.events.unshift(message); s.events.length = Math.min(5, s.events.length); }
function effect(s: GameState, from: Point, to: Point, color: string, kind: EffectKind = 'line'): void {
  s.effects.push({ x: from.x, y: from.y, toX: to.x, toY: to.y, color, kind, life: .42 });
  if (s.effects.length > 45) s.effects.shift();
}
function damageEnemy(s: GameState, enemy: EnemyState, amount: number, source: DamageSource): void {
  if (enemy.hp <= 0) return;
  enemy.hp -= amount;
  enemy.flash = .13;
  if (enemy.hp <= 0) {
    s.stats.kills += enemy.pressure;
    const gain = Math.round(enemy.bounty * (1 + s.distance / 1400));
    s.coins += gain; s.earnings += gain; s.stats.income += gain; s.kills++;
    effect(s, enemy, enemy, '#f4cc81', 'burst');
    if (source === 'collision') s.stats.collisions++;
  }
}
function recoverHp(s: GameState, ally: AllyState, amount: number): void {
  const recovered = Math.min(amount, ally.maxHp - ally.hp);
  if (recovered <= 0) return;
  ally.hp += recovered;
  s.stats.recovery += recovered;
}
function shove(enemy: EnemyState, impulse: number): void {
  enemy.vy += impulse / Math.sqrt(enemy.mass);
  enemy.vy = clamp(enemy.vy, -.32, .32);
}
function acquire(s: GameState, a: AllyState, range: number): EnemyState | null {
  let target = null; let score = -Infinity;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const d = length(a, e);
    if (d > range) continue;
    const priority = e.y * 2 - d;
    if (priority > score) { target = e; score = priority; }
  }
  return target;
}
function movementTarget(s: GameState, a: AllyState): EnemyState | null {
  let target: EnemyState | null = null;
  let score = -Infinity;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const d = length(a, e);
    if (d > .78) continue;
    const priority = e.y * 2 - d;
    if (priority > score) { target = e; score = priority; }
  }
  return target;
}
function moveAlly(s: GameState, a: AllyState, dt: number): void {
  const person = ROSTER.find(r => r.id === a.id)!;
  const target = movementTarget(s, a);
  if (!target) return;
  const dx = target.x - a.x;
  const dy = target.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < .001) return;
  // The active squad opens its spacing while someone is recovering, buying time
  // without changing any individual movement rule or combat statistics.
  const downedSpacing = s.allies.some(ally => ally.status === 'downed') ? DOWNED_RETREAT_DISTANCE : 0;
  const injurySpacing = (1 - clamp(a.hp / a.maxHp, 0, 1)) * INJURY_RETREAT_DISTANCE;
  const desiredRange = person.preferredRange + downedSpacing + injurySpacing;
  const difference = d - desiredRange;
  // A small dead band stops the formation from oscillating around its ideal range.
  if (Math.abs(difference) <= .035) return;
  const direction = difference > 0 ? 1 : -1;
  const movement = Math.min(Math.abs(difference) - .035, person.moveSpeed * dt) * direction;
  a.x = clamp(a.x + dx / d * movement, .08, .92);
  a.y = clamp(a.y + dy / d * movement, .69, .94);
}
function separateAllies(s: GameState, dt: number): void {
  const minimum = .068;
  const response = Math.min(1, dt * 30);
  // A second light pass handles overlap introduced by steering a later pair.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < s.allies.length; i++) {
      const a = s.allies[i];
      if (!active(a)) continue;
      for (let j = i + 1; j < s.allies.length; j++) {
        const b = s.allies[j];
        if (!active(b)) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minimum) continue;
        if (d < .001) { dx = (i + 1) % 2 ? 1 : -1; dy = (j % 2 ? 1 : -1) * .35; d = Math.hypot(dx, dy); }
        const push = (minimum - d) * response * .5;
        const nx = dx / d;
        const ny = dy / d;
        a.x = clamp(a.x - nx * push, .08, .92);
        a.y = clamp(a.y - ny * push, .69, .94);
        b.x = clamp(b.x + nx * push, .08, .92);
        b.y = clamp(b.y + ny * push, .69, .94);
      }
    }
  }
}
function strike(s: GameState, a: AllyState): boolean {
  const base = ROSTER.find(r => r.id === a.id)!;
  const range = base.range + (a.id === 'gou' ? .065 * level(s, 'reach') : 0) + (a.id === 'tsugumi' ? .05 * level(s, 'longshot') : 0);
  const target = acquire(s, a, range);
  if (!target) return false;
  const color = base.color;
  let amount = base.damage;
  if (a.id === 'genzou') amount *= 1 + .16 * level(s, 'arc');
  if (a.id === 'tsugumi') amount *= 1 + level(s, 'longshot') * clamp(length(a, target), 0, .65) * .3;
  damageEnemy(s, target, amount, a.id);
  effect(s, a, target, color);
  if (a.id === 'gou') {
    if (level(s, 'shock')) shove(target, -.14);
    if (level(s, 'cleave')) for (const e of s.enemies) if (e !== target && e.hp > 0 && length(e, target) < .13) {
      damageEnemy(s, e, amount * .52, a.id); effect(s, target, e, '#dc9a6c');
      if (level(s, 'shock')) shove(e, -.06);
    }
  }
  if (a.id === 'tsugumi') {
    if (level(s, 'hook')) shove(target, .115);
    if (level(s, 'pierce')) for (const e of s.enemies) if (e !== target && e.hp > 0 && Math.abs(e.x - target.x) < .065 && e.y < target.y && e.y > a.y - range) {
      damageEnemy(s, e, amount * .55, a.id); effect(s, target, e, '#a4c5a0');
    }
  }
  if (a.id === 'genzou' && level(s, 'chain')) {
    const other = s.enemies.filter(e => e !== target && e.hp > 0 && length(e, target) < .15 + .04 * level(s, 'arc')).sort((e, f) => length(e, target) - length(f, target))[0];
    if (other) { damageEnemy(s, other, amount * .7, a.id); effect(s, target, other, '#c4afe5'); }
  }
  return true;
}
function heal(s: GameState): void {
  const tsugumi = s.allies.find(a => a.id === 'tsugumi')!;
  if (!active(tsugumi)) return;
  const wounded = s.allies.filter(active).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
  if (wounded) recoverHp(s, wounded, 2.8);
  if (level(s, 'barrier')) {
    const nagi = s.allies.find(a => a.id === 'nagi')!;
    if (active(nagi)) nagi.shield = Math.min(20, nagi.shield + 3.2);
  }
}
function recoverActiveAllies(s: GameState, dt: number): void {
  for (const ally of s.allies) if (active(ally)) recoverHp(s, ally, PASSIVE_RECOVERY_PER_SECOND * dt);
}
function spawn(s: GameState): void {
  const tier = Math.floor(s.distance / CAMP_INTERVAL);
  const r = random(s);
  const kind = ENEMY_KINDS[r < .17 + tier * .02 ? 1 : r < .28 + tier * .04 ? 2 : r < .47 + tier * .03 ? 3 : 0];
  const factor = 1 + s.distance / 650;
  s.enemies.push({ ...kind, id: s.nextId++, kind: kind.id, x: .1 + random(s) * .8, y: .055, hp: kind.hp * factor, maxHp: kind.hp * factor,
    damage: kind.damage * (1 + s.distance / 1300), vy: 0, attackCd: 1 + random(s), flash: 0, impactCd: 0 });
}
function contacts(s: GameState): void {
  for (let i = 0; i < s.enemies.length; i++) {
    const a = s.enemies[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < s.enemies.length; j++) {
      const b = s.enemies[j];
      if (b.hp <= 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .001;
      const overlap = a.radius + b.radius - d;
      if (overlap <= 0) continue;
      const nx = dx / d, ny = dy / d;
      const separation = overlap * .5;
      a.x = clamp(a.x - nx * separation, .05, .95); b.x = clamp(b.x + nx * separation, .05, .95);
      a.y = clamp(a.y - ny * separation, .045, .75); b.y = clamp(b.y + ny * separation, .045, .75);
      const impact = Math.abs(a.vy - b.vy);
      const shared = (a.vy * a.mass + b.vy * b.mass) / (a.mass + b.mass);
      a.vy = shared * .6; b.vy = shared * .6;
      if (level(s, 'collision') && impact > .045 && a.impactCd <= 0 && b.impactCd <= 0) {
        const damage = Math.min(33, impact * 115 * Math.sqrt(a.mass * b.mass));
        damageEnemy(s, a, damage, 'collision'); damageEnemy(s, b, damage, 'collision');
        a.impactCd = b.impactCd = .35; effect(s, a, b, '#efb977');
      }
    }
  }
}
function canNagiGuard(e: EnemyState, target: AllyState, nagi: AllyState): boolean {
  // Guarding is a local link between the attacker, Nagi, and the exposed ally.
  // Nagi must be close to both and on the enemy-facing side of the ally.
  return length(nagi, e) <= NAGI_GUARD_RADIUS
    && length(nagi, target) <= NAGI_GUARD_RADIUS
    && nagi.y <= target.y + .035;
}
function enemyAttack(s: GameState, e: EnemyState): boolean {
  const candidates = s.allies.filter(a => active(a) && length(a, e) <= ENEMY_ATTACK_RANGE)
    .sort((a, b) => length(a, e) - length(b, e));
  let target = candidates[0];
  if (!target) return false;
  const nagi = s.allies.find(a => a.id === 'nagi')!;
  if (active(nagi) && target.id !== 'nagi' && canNagiGuard(e, target, nagi)) target = nagi;
  const reduction = target.id === 'nagi' ? 1 - .13 * level(s, 'ward') : 1;
  const incoming = e.damage * reduction;
  const absorbed = Math.min(incoming, target.shield);
  target.shield -= absorbed;
  const taken = incoming - absorbed;
  const actualLoss = Math.min(target.hp, taken);
  target.hp -= actualLoss;
  if (target.hp === 0) {
    target.status = 'downed';
    target.reviveIn = RECOVERY_SECONDS;
    target.shield = 0;
    const person = ROSTER.find(r => r.id === target.id)!;
    log(s, `${person.name}が戦闘不能。${RECOVERY_SECONDS}秒後に復帰する。`);
  }
  s.stats.damage += actualLoss;
  effect(s, e, target, '#ee7b6d');
  if (target.id === 'nagi' && active(target) && level(s, 'counter')) {
    damageEnemy(s, e, 12 + absorbed * .9, 'counter'); s.stats.counter++;
    effect(s, target, e, '#8fd3c7');
  }
  return true;
}
function updateRecovery(s: GameState, dt: number): void {
  for (const a of s.allies) {
    if (a.status !== 'downed') continue;
    a.reviveIn = Math.max(0, a.reviveIn - dt);
    if (a.reviveIn > 0) continue;
    const person = ROSTER.find(entry => entry.id === a.id)!;
    const activeSquad = s.allies.filter(ally => ally !== a && active(ally));
    const squadCenterY = activeSquad.length
      ? activeSquad.reduce((sum, ally) => sum + ally.y, 0) / activeSquad.length
      : person.y;
    const entryY = clamp(Math.max(squadCenterY + .055, person.y + .055), .69, .97);
    resetAlly(a, false, { x: person.x, y: entryY });
    s.stats.recovery += a.hp;
    log(s, `${person.name}が戦線に復帰。`);
  }
}
function enterCollapse(s: GameState): void {
  if (s.pauseReason === 'collapse') return;
  s.paused = true;
  s.pauseReason = 'collapse';
  s.velocity = 0;
  log(s, '戦線崩壊。調査隊は戦闘を継続できない。最後の拠点へ撤退しよう。');
}
function updateRates(s: GameState, dt: number): void {
  s.stats.period += dt;
  if (s.stats.period < 2) return;
  const span = s.stats.period;
  const blend = .55;
  for (const k of ['kills', 'damage', 'recovery', 'income'] as const) s.rates[k] = s.rates[k] * (1 - blend) + (s.stats[k] / span) * blend;
  s.stats.kills = 0; s.stats.damage = 0; s.stats.recovery = 0; s.stats.income = 0; s.stats.period = 0;
}
export function step(s: GameState, dt = STEP): void {
  if (s.paused) return;
  if (allDowned(s)) { enterCollapse(s); return; }
  dt = clamp(dt, 0, STEP);
  s.time += dt;
  updateRecovery(s, dt);
  recoverActiveAllies(s, dt);
  s.spawnIn -= dt;
  if (s.spawnIn <= 0 && s.enemies.length < 42) {
    spawn(s);
    const frequency = .9 + Math.min(1.35, s.distance / 240);
    s.spawnIn += (1 / frequency) * (.85 + random(s) * .3);
  }
  for (const e of s.enemies) {
    e.y = Math.min(.72, e.y + (e.speed + e.vy) * dt);
    e.vy *= Math.exp(-dt * 5.5);
    e.flash = Math.max(0, (e.flash || 0) - dt);
    e.impactCd = Math.max(0, (e.impactCd || 0) - dt);
    if (e.y > .66 && e.hp > 0) {
      e.attackCd -= dt;
      if (e.attackCd <= 0) {
        if (enemyAttack(s, e)) e.attackCd += 1.55;
        else e.attackCd = .12;
      }
    }
  }
  contacts(s);
  for (const a of s.allies) if (active(a)) moveAlly(s, a, dt);
  separateAllies(s, dt);
  for (const a of s.allies) {
    if (!active(a)) continue;
    a.cooldown -= dt;
    if (a.cooldown > 0) continue;
    if (strike(s, a)) {
      const base = ROSTER.find(r => r.id === a.id)!;
      a.cooldown += base.interval * (a.id === 'hibana' ? 1 / (1 + .24 * level(s, 'rapid')) : 1);
      if (a.id === 'tsugumi') heal(s);
    } else a.cooldown = .1;
  }
  if (allDowned(s)) { enterCollapse(s); return; }
  s.enemies = alive(s);
  s.effects = s.effects.filter(fx => (fx.life -= dt) > 0);
  updateRates(s, dt);
  // Pressure is a short rolling observation, so each kill produces a visible push without a one-frame jump.
  const netDamage = s.rates.damage - s.rates.recovery;
  let target = 5.6 * s.rates.kills - 1.25 - .53 * netDamage;
  // HP balance sets the direction: kill momentum cannot hide sustained net loss,
  // and actual healing can slowly regain ground even during a lull.
  if (netDamage > .1) target = Math.min(target, -Math.min(3.8, .25 + .53 * netDamage));
  else if (netDamage < -.1) target = Math.max(target, Math.min(3.8, .25 + .53 * -netDamage));
  target = clamp(target, -3.8, 6.5);
  s.velocity += (target - s.velocity) * Math.min(1, dt * 1.15);
  s.distance = Math.max(s.camp, s.distance + s.velocity * dt);
  s.best = Math.max(s.best, s.distance);
  s.peakSinceCamp = Math.max(s.peakSinceCamp, s.distance);
  const nextCamp = (Math.floor(s.camp / CAMP_INTERVAL) + 1) * CAMP_INTERVAL;
  if (s.distance >= nextCamp) {
    s.distance = nextCamp; s.camp = nextCamp; s.peakSinceCamp = nextCamp;
    s.velocity = 0; s.paused = true; s.pauseReason = 'camp';
    s.dangerAcknowledged = false;
    s.enemies = []; s.effects = []; s.spawnIn = .8;
    for (const a of s.allies) resetAlly(a);
    s.campSnapshot = snapshot(s);
    log(s, `${nextCamp}mの中継拠点に到達。遠征資金を組み直せる。`);
  } else {
    const hasDownedAlly = s.allies.some(a => a.status === 'downed');
    const inDanger = s.peakSinceCamp > s.camp + 65
      && (hasDownedAlly || s.distance < s.camp + 18 || totalHp(s) < maxHp * .19);
    if (!inDanger) s.dangerAcknowledged = false;
    else if (!s.dangerAcknowledged) {
      s.paused = true; s.pauseReason = 'danger'; s.dangerAcknowledged = true;
      log(s, '危険域で自動停止。改造して押し返すか、拠点へ撤退しよう。');
    }
  }
}
function snapshot(s: GameState): CampSnapshot {
  return { camp: s.camp, coins: s.coins, spent: s.spent, upgrades: { ...s.upgrades }, earnings: s.earnings, kills: s.kills };
}
export function retreat(s: GameState): boolean {
  if (!s.paused || s.pauseReason === 'start') return false;
  const saved = s.campSnapshot || { camp: 0, coins: 0, spent: 0, upgrades: {}, earnings: 0, kills: 0 };
  s.distance = saved.camp; s.camp = saved.camp; s.peakSinceCamp = saved.camp;
  s.coins = saved.coins; s.spent = saved.spent;
  s.upgrades = { ...saved.upgrades }; s.earnings = saved.earnings; s.kills = saved.kills;
  s.enemies = []; s.effects = []; s.spawnIn = .8; s.velocity = 0; s.rates = { kills: 0, damage: 0, recovery: 0, income: 0 };
  s.stats = { kills: 0, damage: 0, recovery: 0, income: 0, collisions: 0, counter: 0, period: 0 };
  s.dangerAcknowledged = false;
  for (const a of s.allies) resetAlly(a);
  s.paused = true; s.pauseReason = 'camp'; s.comparison = null;
  log(s, `${saved.camp}mの拠点へ撤退。途中の資金と購入は戻った。`);
  return true;
}
export function resume(s: GameState): boolean {
  if (s.pauseReason === 'collapse' || allDowned(s)) {
    enterCollapse(s);
    return false;
  }
  if (!s.paused) return true;
  if (s.pauseReason === 'camp') s.campSnapshot = snapshot(s);
  s.paused = false; s.pauseReason = null;
  if (s.distance === s.camp && s.velocity < 0) s.velocity = 0;
  return true;
}
export function pause(s: GameState): void { if (!s.paused) { s.paused = true; s.pauseReason = 'manual'; } }
export function describe(s: GameState): string {
  if (s.paused && s.pauseReason === 'collapse') return '戦線崩壊。調査隊は最後の拠点へ撤退する必要があります。';
  const crowd = s.enemies.filter(e => e.y > .47).length;
  if (s.paused && s.pauseReason === 'camp') return '中継拠点。購入分を含む全資金を組み直せます。';
  if (s.paused && s.pauseReason === 'danger') return '前線が危険域です。強化して続行するか撤退できます。';
  if (!s.paused && s.allies.some(a => a.status === 'downed')) return '仲間の復帰まで、隊列を広げて攻撃圏から後退中。';
  if (!s.paused && s.allies.some(a => a.hp / a.maxHp < .55)) return '傷ついた隊員が後方で回復中。HPに応じて敵との距離を保つ。';
  if (crowd >= 7) return '敵が前線に滞留中。密集・接触を活かせるか観察。';
  if (s.rates.damage - s.rates.recovery > 5) return '受ける被害が回復を上回り、進軍を押し戻しています。';
  if (s.velocity > 1.4) return '撃破が抵抗を上回り、前線を押し上げています。';
  if (s.velocity < -.7) return '敵の処理が追いつかず、前線が後退中。';
  return '敵の数、被害、撃破の変化を見て改造しよう。';
}
export const format = (value: number): string => round(value).toFixed(1);
