import { ENEMY_KINDS, ROSTER, UPGRADES } from './content.ts';
import type {
  AllyState, CampSnapshot, Comparison, DamageSource, EffectKind, EnemyState, GameState, UpgradeId
} from './types.ts';

// The simulation owns all game rules. Rendering and storage never mutate state directly.
// One world-coordinate unit is 40 metres. Positive progress is -y.
export const METRES_PER_UNIT = 40;
export const WORLD_ORIGIN_Y = .77;
export const CAMERA_FRONT_Y = .72;
export const ENEMY_DENSITY_AT_START = .40;
export const ENEMY_DENSITY_PER_METRE = .000134;
export const MAX_ENEMY_DENSITY = .56;
export const INITIAL_VISIBLE_FIELD_METRES = CAMERA_FRONT_Y * METRES_PER_UNIT;
export const SPAWN_LEAD_UNITS = .2;
export const ENEMY_KIND_SHARES = { stray: .5, runner: .2, heavy: .1, swarm: .2 } as const;
export const ENEMY_NOTICE_RANGE = .70;
export const UNALERTED_ENEMY_SPEED_RATIO = .45;
export const MAX_SQUAD_RETREAT_SPEED = .035;
export const MAX_RANGE_RETREAT_SPEED = .035;
export const RETREAT_RISE_RATE = 1.5;
export const RETREAT_DECAY_RATE = .5;
export const STEP = 1 / 30;
export const CAMP_INTERVAL = 300;
export const RECOVERY_SECONDS = 5;
export const REVIVE_HP = 1;
export const ENEMY_ATTACK_RANGE = .19;
export const DOWNED_RETREAT_DISTANCE = .08;
export const INJURY_RETREAT_DISTANCE = .18;
export const NAGI_GUARD_RADIUS = .3;
export const PASSIVE_RECOVERY_PER_SECOND = .45;
type Point = Pick<AllyState, 'x' | 'y'>;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const round = (value: number): number => Math.round(value * 10) / 10;
const random = (s: GameState): number => { s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0; return s.seed / 4294967296; };
const exponentialGap = (s: GameState): number => -Math.log(Math.max(Number.EPSILON, 1 - random(s)));
function mixSeed(seed: number): number {
  let value = seed >>> 0;
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15; value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}
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
  a.hp = fullHealth ? a.maxHp : REVIVE_HP;
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
  const s: GameState = {
    version: 5, seed: mixSeed(seed), nextId: 1, time: 0, distance: 0, best: 0, peakSinceCamp: 0, camp: 0,
    velocity: 0, kills: 0, earnings: 0, coins: 0, spent: 0, upgrades: {},
    allies: ROSTER.map(a => ({ id: a.id, x: a.x, y: a.y, hp: a.hp, maxHp: a.hp, status: 'active', reviveIn: 0, shield: 0, cooldown: .3, casts: 0 })),
    enemies: [], effects: [], frontline: WORLD_ORIGIN_Y, cameraY: WORLD_ORIGIN_Y - CAMERA_FRONT_Y,
    spawnExposure: { stray: 0, runner: 0, heavy: 0, swarm: 0 },
    nextSpawnExposure: { stray: 0, runner: 0, heavy: 0, swarm: 0 },
    retreatBias: 0, spawnIn: 1, paused: true, pauseReason: 'start', dangerAcknowledged: false, speed: 1,
    campSnapshot: null, stats: { kills: 0, damage: 0, recovery: 0, income: 0, collisions: 0, counter: 0, period: 0 },
    rates: { kills: 0, damage: 0, recovery: 0, income: 0 }, events: ['坑の入り口。前線の変化を見ながら進もう。'], comparison: null
  };
  seedInitialField(s);
  return s;
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
  // Rearward intruders take precedence over the next group ahead.
  return alive(s).filter(e => e.y > a.y - .04 || length(a, e) < 1.05)
    .sort((e, f) => (f.y * 2 - length(a, f)) - (e.y * 2 - length(a, e)))[0] ?? null;
}
function squadDanger(s: GameState, dt: number): void {
  const squad = s.allies.filter(active);
  if (!squad.length) return;
  const centerY = squad.reduce((sum, a) => sum + a.y, 0) / squad.length;
  const enemies = alive(s);
  const close = enemies.filter(e => squad.some(a => length(a, e) < .3));
  const penetration = enemies.some(e => e.y > centerY) ? .55 : 0;
  const injury = squad.reduce((sum, a) => sum + 1 - a.hp / a.maxHp, 0) / squad.length;
  const netDamage = Math.max(0, s.rates.damage - s.rates.recovery,
    (s.stats.damage - s.stats.recovery) / Math.max(.5, s.stats.period));
  const lossDanger = clamp((netDamage - 2) / 4, 0, 1);
  const crowdDanger = clamp((close.length - 6) / 10, 0, 1);
  const downedCount = s.allies.filter(a => !active(a)).length;
  const casualtyDanger = downedCount >= 2 ? .65 : downedCount === 1 ? .35 : 0;
  const injuryDanger = clamp(injury * .25, 0, .25);
  const danger = Math.max(lossDanger, crowdDanger, penetration, casualtyDanger, injuryDanger);
  const responseRate = danger > s.retreatBias ? RETREAT_RISE_RATE : RETREAT_DECAY_RATE;
  // A little pressure does not turn into flight immediately; sustained pressure builds over seconds.
  s.retreatBias += (danger - s.retreatBias) * (1 - Math.exp(-dt * responseRate));
}
function moveSquad(s: GameState, dt: number): void {
  const squad = s.allies.filter(active);
  const center = {
    x: squad.reduce((sum, a) => sum + a.x, 0) / squad.length,
    y: squad.reduce((sum, a) => sum + a.y, 0) / squad.length
  };
  // All steering uses the same pre-movement snapshot, avoiding roster-order bias.
  const moves = squad.map(a => {
    const person = ROSTER.find(r => r.id === a.id)!;
    const target = movementTarget(s, a);
    let vx = 0, vy = -person.moveSpeed * .75;
    if (target) {
      const dx = target.x - a.x, dy = target.y - a.y;
      const d = Math.max(.001, Math.hypot(dx, dy));
      const isFrontliner = a.id === 'gou' || a.id === 'nagi';
      const desired = person.preferredRange
        + (!isFrontliner && s.allies.some(ally => !active(ally)) ? DOWNED_RETREAT_DISTANCE : 0)
        + (!isFrontliner ? (1 - a.hp / a.maxHp) * INJURY_RETREAT_DISTANCE : 0);
      let amount = Math.abs(d - desired) < .035 ? 0 : clamp((d - desired) * 3, -person.moveSpeed, person.moveSpeed);
      if (isFrontliner) amount = Math.max(0, amount);
      else if (a.id === 'hibana' && amount < 0) amount *= .5;
      else if (amount < 0) amount = Math.max(amount, -MAX_RANGE_RETREAT_SPEED);
      vx = dx / d * amount; vy = dy / d * amount;
    }
    const dx = center.x - a.x, dy = center.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d > .24) {
      const strength = Math.min(2, (d - .24) * 7);
      vx += dx / d * person.moveSpeed * strength;
      vy += dy / d * person.moveSpeed * strength;
    }
    // Retreat is a shared slow pressure, separate from each character's normal speed.
    // It cancels forward travel before adding at most MAX_SQUAD_RETREAT_SPEED.
    vy = Math.min(0, vy) * (1 - s.retreatBias) + Math.max(0, vy)
      + MAX_SQUAD_RETREAT_SPEED * s.retreatBias;
    const speed = Math.hypot(vx, vy);
    const scale = speed > person.moveSpeed ? person.moveSpeed / speed : 1;
    return { a, vx: vx * scale, vy: vy * scale };
  });
  for (const { a, vx, vy } of moves) {
    a.x = clamp(a.x + vx * dt, .08, .92);
    a.y += vy * dt;
  }
}
export function calculateFrontline(s: GameState): number {
  const squad = s.allies.filter(active);
  if (!squad.length) return s.frontline;
  const foremostAlly = Math.min(...squad.map(a => a.y));
  const enemies = alive(s);
  // max in downward-positive y is min in forward-positive progress.
  return enemies.length ? Math.max(foremostAlly, ...enemies.map(e => e.y)) : foremostAlly;
}
export function updateFrontline(s: GameState, dt: number): void {
  const previous = s.frontline;
  s.frontline = calculateFrontline(s);
  s.distance = (WORLD_ORIGIN_Y - s.frontline) * METRES_PER_UNIT;
  s.velocity = dt > 0 ? (previous - s.frontline) * METRES_PER_UNIT / dt : 0;
  s.cameraY += (s.frontline - CAMERA_FRONT_Y - s.cameraY) * (1 - Math.exp(-dt * 2.5));
}
export function nearbyEnemyCount(s: GameState): number {
  return alive(s).filter(e => s.allies.some(a => active(a) && length(a, e) < .5)).length;
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
        a.y -= ny * push;
        b.x = clamp(b.x + nx * push, .08, .92);
        b.y += ny * push;
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
export function enemyDensity(depth: number): number {
  return Math.min(MAX_ENEMY_DENSITY, ENEMY_DENSITY_AT_START + Math.max(0, depth) * ENEMY_DENSITY_PER_METRE);
}
function depthAt(y: number): number { return Math.max(0, (WORLD_ORIGIN_Y - y) * METRES_PER_UNIT); }
function enemyKindAtRandom(s: GameState): (typeof ENEMY_KINDS)[number] {
  const roll = random(s);
  if (roll < ENEMY_KIND_SHARES.stray) return ENEMY_KINDS[0];
  if (roll < ENEMY_KIND_SHARES.stray + ENEMY_KIND_SHARES.runner) return ENEMY_KINDS[1];
  if (roll < ENEMY_KIND_SHARES.stray + ENEMY_KIND_SHARES.runner + ENEMY_KIND_SHARES.heavy) return ENEMY_KINDS[2];
  return ENEMY_KINDS[3];
}
function spawn(s: GameState, y: number, kind: (typeof ENEMY_KINDS)[number]): void {
  const depth = depthAt(y);
  const hpFactor = 1 + depth / 1200;
  s.enemies.push({ ...kind, id: s.nextId++, kind: kind.id, x: .1 + random(s) * .8, y,
    hp: kind.hp * hpFactor, maxHp: kind.hp * hpFactor,
    // Keep the established attack scaling while easing enemy durability growth.
    damage: kind.damage * (1 + depth / 1300), vy: 0, attackCd: 1 + random(s), flash: 0, impactCd: 0, alerted: false });
}
function integratedDensity(startDepth: number, distance: number): number {
  // One metre slices preserve the small depth gradient across a sampled interval.
  let total = 0;
  for (let offset = 0; offset < distance; offset += 1) {
    const slice = Math.min(1, distance - offset);
    total += (enemyDensity(startDepth + offset) + enemyDensity(startDepth + offset + slice)) * .5 * slice;
  }
  return total;
}
export function initializeSpawnExposure(s: GameState, alreadySampledMetres: number): void {
  const leadingAllyY = Math.min(...s.allies.filter(active).map(a => a.y));
  const depth = depthAt(leadingAllyY);
  const sampledDensity = integratedDensity(depth, alreadySampledMetres);
  for (const kind of ENEMY_KINDS) {
    const id = kind.id;
    s.spawnExposure[id] = sampledDensity * ENEMY_KIND_SHARES[id];
    s.nextSpawnExposure[id] = s.spawnExposure[id] + exponentialGap(s);
  }
}
function seedInitialField(s: GameState): void {
  // The visible forward field already contains its expected spatial population.
  // Sample the Poisson field so it is present when play begins.
  let distanceAhead = 0;
  while (distanceAhead < INITIAL_VISIBLE_FIELD_METRES) {
    distanceAhead += exponentialGap(s) / enemyDensity(distanceAtFrontAhead(s, distanceAhead));
    if (distanceAhead >= INITIAL_VISIBLE_FIELD_METRES) break;
    const y = Math.min(...s.allies.filter(active).map(a => a.y)) - distanceAhead / METRES_PER_UNIT;
    spawn(s, y, enemyKindAtRandom(s));
  }
  initializeSpawnExposure(s, INITIAL_VISIBLE_FIELD_METRES);
}
function distanceAtFrontAhead(s: GameState, distanceAhead: number): number {
  const leadingAllyY = Math.min(...s.allies.filter(active).map(a => a.y));
  return depthAt(leadingAllyY - distanceAhead / METRES_PER_UNIT);
}
export function advanceEncounterField(s: GameState, dt: number, squadForwardMps: number): void {
  const squad = s.allies.filter(active);
  if (!squad.length) return;
  const leadingAllyY = Math.min(...squad.map(a => a.y));
  // Spawn entities beyond the top edge, where their own approach carries them into view.
  const spawnY = leadingAllyY - CAMERA_FRONT_Y - SPAWN_LEAD_UNITS;
  const density = enemyDensity(depthAt(spawnY));
  for (const kind of ENEMY_KINDS) {
    const id = kind.id;
    const enemyApproachMps = kind.speed * UNALERTED_ENEMY_SPEED_RATIO * METRES_PER_UNIT;
    const relativeApproachMps = Math.max(0, squadForwardMps + enemyApproachMps);
    // Each enemy kind is an independent spatial Poisson field. Integrating density ×
    // relative travel makes the event rate emerge from movement rather than a spawn timer.
    s.spawnExposure[id] += density * ENEMY_KIND_SHARES[id] * relativeApproachMps * dt;
    while (s.nextSpawnExposure[id] <= s.spawnExposure[id]) {
      spawn(s, spawnY, kind);
      s.nextSpawnExposure[id] += exponentialGap(s);
    }
  }
}
function moveEnemy(s: GameState, e: EnemyState, dt: number): void {
  if (e.hp <= 0) return;
  const target = s.allies.filter(active).sort((a, b) => length(e, a) - length(e, b))[0];
  if (!target) return;
  const d = length(e, target);
  if (d < ENEMY_NOTICE_RANGE) e.alerted = true;
  if (e.alerted) {
    const move = Math.min(Math.max(0, d - ENEMY_ATTACK_RANGE * .85), e.speed * dt);
    if (d > .001) {
      e.x = clamp(e.x + (target.x - e.x) / d * move, .05, .95);
      e.y += (target.y - e.y) / d * move;
    }
  } else e.y += e.speed * UNALERTED_ENEMY_SPEED_RATIO * dt;
  e.y += e.vy * dt;
  e.vy *= Math.exp(-dt * 5.5);
  e.flash = Math.max(0, e.flash - dt);
  e.impactCd = Math.max(0, e.impactCd - dt);
  e.attackCd -= dt;
  if (e.attackCd <= 0) e.attackCd = enemyAttack(s, e) ? 1.55 : .12;
}
function contacts(s: GameState): void {
  // A 0.12-unit grid bounds candidate checks to local cells; heavy enemies
  // have a maximum combined radius of 0.082 units.
  const cellSize = .12;
  const buckets = new Map<string, number[]>();
  const key = (x: number, y: number): string => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
  // Rebuild once after the first separation pass so dense clusters can settle
  // without returning to an all-pairs scan.
  for (let pass = 0; pass < 2; pass++) {
    buckets.clear();
    for (let i = 0; i < s.enemies.length; i++) {
      const enemy = s.enemies[i];
      if (enemy.hp <= 0) continue;
      const cell = key(enemy.x, enemy.y);
      const bucket = buckets.get(cell);
      if (bucket) bucket.push(i); else buckets.set(cell, [i]);
    }
    for (let i = 0; i < s.enemies.length; i++) {
      const a = s.enemies[i];
      if (a.hp <= 0) continue;
      const cellX = Math.floor(a.x / cellSize), cellY = Math.floor(a.y / cellSize);
      for (let dxCell = -1; dxCell <= 1; dxCell++) for (let dyCell = -1; dyCell <= 1; dyCell++) {
        const neighbors = buckets.get(`${cellX + dxCell},${cellY + dyCell}`) || [];
        for (const j of neighbors) {
          if (j <= i) continue;
          const b = s.enemies[j];
          if (b.hp <= 0) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .001;
          const overlap = a.radius + b.radius - d;
          if (overlap <= 0) continue;
          const nx = dx / d, ny = dy / d;
          const separation = overlap * .5;
          a.x = clamp(a.x - nx * separation, .05, .95); b.x = clamp(b.x + nx * separation, .05, .95);
          a.y -= ny * separation; b.y += ny * separation;
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
    const entryY = squadCenterY + .2;
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
  for (const e of s.enemies) moveEnemy(s, e, dt);
  contacts(s);
  if (allDowned(s)) { enterCollapse(s); return; }
  squadDanger(s, dt);
  const activeBeforeMove = s.allies.filter(active);
  const squadYBeforeMove = activeBeforeMove.reduce((sum, a) => sum + a.y, 0) / activeBeforeMove.length;
  moveSquad(s, dt);
  separateAllies(s, dt);
  const activeAfterMove = s.allies.filter(active);
  const squadYAfterMove = activeAfterMove.reduce((sum, a) => sum + a.y, 0) / activeAfterMove.length;
  const squadForwardMps = (squadYBeforeMove - squadYAfterMove) * METRES_PER_UNIT / dt;
  advanceEncounterField(s, dt, squadForwardMps);
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
  updateFrontline(s, dt);
  s.best = Math.max(s.best, s.distance);
  s.peakSinceCamp = Math.max(s.peakSinceCamp, s.distance);
  const nextCamp = (Math.floor(s.camp / CAMP_INTERVAL) + 1) * CAMP_INTERVAL;
  if (s.distance >= nextCamp) {
    s.camp = nextCamp; s.peakSinceCamp = s.distance;
    s.velocity = 0; s.paused = true; s.pauseReason = 'camp';
    s.dangerAcknowledged = false;
    // A checkpoint heals the squad in place. Existing world enemies persist.
    s.effects = [];
    for (const a of s.allies) { a.hp = a.maxHp; a.status = 'active'; a.reviveIn = 0; }
    s.retreatBias = 0;
    updateFrontline(s, 0);
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
  for (const a of s.allies) {
    const person = ROSTER.find(r => r.id === a.id)!;
    resetAlly(a, true, { x: person.x, y: person.y - s.camp / METRES_PER_UNIT });
  }
  s.frontline = WORLD_ORIGIN_Y - s.camp / METRES_PER_UNIT;
  s.cameraY = s.frontline - CAMERA_FRONT_Y;
  s.retreatBias = 0;
  seedInitialField(s);
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
  const crowd = nearbyEnemyCount(s);
  if (s.paused && s.pauseReason === 'camp') return '中継拠点。購入分を含む全資金を組み直せます。';
  if (s.paused && s.pauseReason === 'danger') return '前線が危険域です。強化して続行するか撤退できます。';
  if (!s.paused && s.allies.some(a => a.status === 'downed')) return '仲間の復帰まで、隊列を広げて攻撃圏から後退中。';
  if (!s.paused && s.allies.some(a => a.hp / a.maxHp < .55)) return '傷ついた隊員が後方で回復中。HPに応じて敵との距離を保つ。';
  if (crowd >= 7) return '敵が前線に滞留中。密集・接触を活かせるか観察。';
  if (s.rates.damage - s.rates.recovery > 5) return '受ける被害が回復を上回り、進軍を押し戻しています。';
  if (s.velocity > 1.4) return '前線が前進中。被害と回復の釣り合いを見よう。';
  if (s.velocity < -.7) return '損失が積み上がり、前線が後退中。';
  return '敵の数、被害、撃破の変化を見て改造しよう。';
}
export const format = (value: number): string => round(value).toFixed(1);
