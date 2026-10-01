import type {
  AllyId, AllyState, CampSnapshot, Comparison, DamageSource, EffectKind, EnemyKindDefinition,
  EnemyKindId, EnemyState, GameState, PauseReason, Rates, RosterEntry, Stats, UpgradeDefinition,
  UpgradeId, UpgradeLevels
} from './types.ts';

// The simulation owns all game rules. Rendering and storage never mutate state directly.
export const STEP = 1 / 30;
export const CAMP_INTERVAL = 300;
export const ROSTER = [
  { id: 'gou', name: 'ゴウ', role: '前衛・衝撃', x: .42, y: .77, hp: 100, range: .23, damage: 21, interval: 1.35, color: '#db966c' },
  { id: 'nagi', name: 'ナギ', role: '庇護・反撃', x: .67, y: .79, hp: 125, range: .22, damage: 13, interval: 1.65, color: '#7eb8b1' },
  { id: 'hibana', name: 'ヒバナ', role: '連撃', x: .23, y: .8, hp: 75, range: .31, damage: 9, interval: .57, color: '#e8bc71' },
  { id: 'tsugumi', name: 'ツグミ', role: '射撃・治療', x: .32, y: .91, hp: 78, range: .66, damage: 12, interval: 1.35, color: '#a4c5a0' },
  { id: 'genzou', name: 'ゲンゾウ', role: '術式', x: .76, y: .9, hp: 78, range: .72, damage: 16, interval: 1.75, color: '#af9dc8' }
] satisfies RosterEntry[];

export const UPGRADES = [
  { id: 'hook', group: 'structure', name: '鉤引き', owner: 'ツグミ', cost: 55, description: '射撃した敵を手前に引く。重い敵ほど動きにくい。' },
  { id: 'cleave', group: 'structure', name: '薙ぎ払い', owner: 'ゴウ', cost: 80, description: '近接攻撃が周囲にも当たる。密集した敵をまとめて削る。' },
  { id: 'collision', group: 'structure', name: '衝突損傷', owner: '共通', cost: 80, description: '動かされた敵同士がぶつかると双方に傷を負う。' },
  { id: 'counter', group: 'structure', name: '受け返し', owner: 'ナギ', cost: 70, description: 'ナギが受けた攻撃に反撃。敵が多いほど機会が増える。' },
  { id: 'chain', group: 'structure', name: '鎖雷', owner: 'ゲンゾウ', cost: 90, description: '術式が近くの別の敵へ跳ぶ。敵の距離を参照する。' },
  { id: 'pierce', group: 'structure', name: '貫き', owner: 'ツグミ', cost: 95, description: '射線上の敵にも弾が当たる。奥の敵ほど威力が減る。' },
  { id: 'barrier', group: 'structure', name: '防壁処置', owner: 'ツグミ', cost: 65, description: '治療時にナギへ防壁を付ける。受け返しと噛み合う。' },
  { id: 'shock', group: 'structure', name: '衝撃打', owner: 'ゴウ', cost: 75, description: 'ゴウの一撃が敵を押し返す。別の敵に当てられる。' },
  { id: 'longshot', group: 'tuning', name: '長射程', owner: 'ツグミ', cost: 45, max: 3, description: '射程と遠距離での射撃威力を伸ばす。' },
  { id: 'rapid', group: 'tuning', name: '連撃訓練', owner: 'ヒバナ', cost: 50, max: 3, description: 'ヒバナの攻撃間隔を短くする。単体処理が速くなる。' },
  { id: 'ward', group: 'tuning', name: '装甲補修', owner: 'ナギ', cost: 45, max: 3, description: 'ナギの被害を抑え、治療の余裕を作る。' },
  { id: 'reach', group: 'tuning', name: '踏み込み', owner: 'ゴウ', cost: 50, max: 3, description: 'ゴウの間合いを広げる。集めた敵に先手を取る。' },
  { id: 'arc', group: 'tuning', name: '導体改良', owner: 'ゲンゾウ', cost: 55, max: 3, description: '鎖雷の跳躍距離と術式の威力を伸ばす。' }
] satisfies UpgradeDefinition[];

const KINDS = [
  { id: 'stray', name: '徘徊体', hp: 31, speed: .048, damage: 5, mass: 1, pressure: 1, bounty: 13, radius: .026, color: '#d49c82' },
  { id: 'runner', name: '疾走体', hp: 21, speed: .081, damage: 4, mass: .65, pressure: .8, bounty: 11, radius: .021, color: '#edc47e' },
  { id: 'heavy', name: '重殻体', hp: 83, speed: .031, damage: 9, mass: 2.6, pressure: 2.3, bounty: 29, radius: .041, color: '#ad9dc0' },
  { id: 'swarm', name: '群体', hp: 19, speed: .056, damage: 3, mass: .55, pressure: .65, bounty: 9, radius: .019, color: '#99bdb1' }
 ] satisfies EnemyKindDefinition[];
type Point = Pick<AllyState, 'x' | 'y'>;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const round = (value: number): number => Math.round(value * 10) / 10;
const random = (s: GameState): number => { s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0; return s.seed / 4294967296; };
const level = (s: GameState, id: UpgradeId): number => s.upgrades[id] || 0;
const alive = (s: GameState): EnemyState[] => s.enemies.filter(e => e.hp > 0);
const length = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const totalHp = (s: GameState): number => s.allies.reduce((sum, a) => sum + Math.max(0, a.hp), 0);
const maxHp = ROSTER.reduce((sum, a) => sum + a.hp, 0);

export function price(s: GameState, id: string): number {
  const upgrade = UPGRADES.find(u => u.id === id);
  if (!upgrade) return Infinity;
  return Math.round(upgrade.cost * 2.5 * (1 + .75 * level(s, upgrade.id)));
}

export function createGame(seed = 194): GameState {
  return {
    version: 1, seed: seed >>> 0, nextId: 1, time: 0, distance: 0, best: 0, camp: 0,
    velocity: 0, kills: 0, earnings: 0, coins: 0, spent: 0, upgrades: {},
    allies: ROSTER.map(a => ({ id: a.id, x: a.x, y: a.y, hp: a.hp, maxHp: a.hp, shield: 0, cooldown: .3, casts: 0 })),
    enemies: [], effects: [], spawnIn: 1, paused: true, pauseReason: 'start', dangerAcknowledged: false, speed: 1,
    campSnapshot: null, stats: { kills: 0, damage: 0, income: 0, collisions: 0, counter: 0, period: 0 },
    rates: { kills: 0, damage: 0, income: 0 }, events: ['坑の入り口。前線の変化を見ながら進もう。'], comparison: null
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
    const priority = e.y * 2 - d * .3;
    if (priority > score) { target = e; score = priority; }
  }
  return target;
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
  if (tsugumi.hp <= 0) return;
  const wounded = s.allies.filter(a => a.hp > 0).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
  if (wounded) wounded.hp = Math.min(wounded.maxHp, wounded.hp + 2.8);
  if (level(s, 'barrier')) {
    const nagi = s.allies.find(a => a.id === 'nagi')!;
    if (nagi.hp > 0) nagi.shield = Math.min(20, nagi.shield + 3.2);
  }
}
function spawn(s: GameState): void {
  const tier = Math.floor(s.distance / CAMP_INTERVAL);
  const r = random(s);
  const kind = KINDS[r < .17 + tier * .02 ? 1 : r < .28 + tier * .04 ? 2 : r < .47 + tier * .03 ? 3 : 0];
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
function enemyAttack(s: GameState, e: EnemyState): void {
  const candidates = s.allies.filter(a => a.hp > 0).sort((a, b) => length(a, e) - length(b, e));
  let target = candidates[0];
  if (!target) return;
  const nagi = s.allies.find(a => a.id === 'nagi')!;
  if (nagi.hp > 0 && target.id !== 'nagi' && length(nagi, target) < .44) target = nagi;
  const reduction = target.id === 'nagi' ? 1 - .13 * level(s, 'ward') : 1;
  const incoming = e.damage * reduction;
  const absorbed = Math.min(incoming, target.shield);
  target.shield -= absorbed;
  const taken = incoming - absorbed;
  target.hp = Math.max(0, target.hp - taken);
  s.stats.damage += taken;
  effect(s, e, target, '#ee7b6d');
  if (target.id === 'nagi' && level(s, 'counter')) {
    damageEnemy(s, e, 12 + absorbed * .9, 'counter'); s.stats.counter++;
    effect(s, target, e, '#8fd3c7');
  }
}
function updateRates(s: GameState, dt: number): void {
  s.stats.period += dt;
  if (s.stats.period < 2) return;
  const span = s.stats.period;
  const blend = .55;
  for (const k of ['kills', 'damage', 'income'] as const) s.rates[k] = s.rates[k] * (1 - blend) + (s.stats[k] / span) * blend;
  s.stats.kills = 0; s.stats.damage = 0; s.stats.income = 0; s.stats.period = 0;
}
export function step(s: GameState, dt = STEP): void {
  if (s.paused) return;
  dt = clamp(dt, 0, STEP);
  s.time += dt;
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
      if (e.attackCd <= 0) { enemyAttack(s, e); e.attackCd += 1.55; }
    }
  }
  contacts(s);
  for (const a of s.allies) {
    if (a.hp <= 0) continue;
    a.cooldown -= dt;
    if (a.cooldown > 0) continue;
    if (strike(s, a)) {
      const base = ROSTER.find(r => r.id === a.id)!;
      a.cooldown += base.interval * (a.id === 'hibana' ? 1 / (1 + .24 * level(s, 'rapid')) : 1);
      if (a.id === 'tsugumi') heal(s);
    } else a.cooldown = .1;
  }
  s.enemies = alive(s);
  s.effects = s.effects.filter(fx => (fx.life -= dt) > 0);
  updateRates(s, dt);
  // Pressure is a short rolling observation, so each kill produces a visible push without a one-frame jump.
  const target = clamp(5.6 * s.rates.kills - 1.25 - .53 * s.rates.damage, -3.8, 6.5);
  s.velocity += (target - s.velocity) * Math.min(1, dt * 1.15);
  s.distance = Math.max(s.camp, s.distance + s.velocity * dt);
  s.best = Math.max(s.best, s.distance);
  const nextCamp = (Math.floor(s.camp / CAMP_INTERVAL) + 1) * CAMP_INTERVAL;
  if (s.distance >= nextCamp) {
    s.distance = nextCamp; s.camp = nextCamp; s.velocity = 0; s.paused = true; s.pauseReason = 'camp';
    s.dangerAcknowledged = false;
    s.enemies = []; s.effects = []; s.spawnIn = .8;
    for (const a of s.allies) { a.hp = a.maxHp; a.shield = 0; a.cooldown = .3; }
    s.campSnapshot = snapshot(s);
    log(s, `${nextCamp}mの中継拠点に到達。遠征資金を組み直せる。`);
  } else {
    const inDanger = s.best > s.camp + 65 && (s.distance < s.camp + 18 || totalHp(s) < maxHp * .19);
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
  s.distance = saved.camp; s.camp = saved.camp; s.coins = saved.coins; s.spent = saved.spent;
  s.upgrades = { ...saved.upgrades }; s.earnings = saved.earnings; s.kills = saved.kills;
  s.enemies = []; s.effects = []; s.spawnIn = .8; s.velocity = 0; s.rates = { kills: 0, damage: 0, income: 0 };
  s.stats = { kills: 0, damage: 0, income: 0, collisions: 0, counter: 0, period: 0 };
  s.dangerAcknowledged = false;
  for (const a of s.allies) { a.hp = a.maxHp; a.shield = 0; a.cooldown = .3; }
  s.paused = true; s.pauseReason = 'camp'; s.comparison = null;
  log(s, `${saved.camp}mの拠点へ撤退。途中の資金と購入は戻った。`);
  return true;
}
export function resume(s: GameState): void {
  if (!s.paused) return;
  if (s.pauseReason === 'camp') s.campSnapshot = snapshot(s);
  s.paused = false; s.pauseReason = null;
  if (s.distance === s.camp && s.velocity < 0) s.velocity = 0;
}
export function pause(s: GameState): void { if (!s.paused) { s.paused = true; s.pauseReason = 'manual'; } }
export function describe(s: GameState): string {
  const crowd = s.enemies.filter(e => e.y > .47).length;
  if (s.paused && s.pauseReason === 'camp') return '中継拠点。購入分を含む全資金を組み直せます。';
  if (s.paused && s.pauseReason === 'danger') return '前線が危険域です。強化して続行するか撤退できます。';
  if (crowd >= 7) return '敵が前線に滞留中。密集・接触を活かせるか観察。';
  if (s.rates.damage > 5) return '被害が大きく、進軍を押し戻しています。';
  if (s.velocity > 1.4) return '撃破が抵抗を上回り、前線を押し上げています。';
  if (s.velocity < -.7) return '敵の処理が追いつかず、前線が後退中。';
  return '敵の数、被害、撃破の変化を見て改造しよう。';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function isUpgradeId(value: string): value is UpgradeId {
  return UPGRADES.some(upgrade => upgrade.id === value);
}
function isEnemyKindId(value: unknown): value is EnemyKindId {
  return KINDS.some(kind => kind.id === value);
}
function parseUpgradeLevels(raw: unknown): UpgradeLevels | null {
  if (!isRecord(raw)) return null;
  const result: UpgradeLevels = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isUpgradeId(key) || !Number.isInteger(value) || (value as number) < 0) return null;
    const upgrade = UPGRADES.find(item => item.id === key)!;
    if ((value as number) > (upgrade.max || 1)) return null;
    result[key] = value as number;
  }
  return result;
}
function parseCampSnapshot(raw: unknown): CampSnapshot | null {
  if (!isRecord(raw)) return null;
  const upgrades = parseUpgradeLevels(raw.upgrades);
  if (!upgrades) return null;
  if (![raw.camp, raw.coins, raw.spent, raw.earnings, raw.kills].every(isFiniteNumber)) return null;
  return {
    camp: raw.camp as number, coins: raw.coins as number, spent: raw.spent as number,
    upgrades, earnings: raw.earnings as number, kills: raw.kills as number
  };
}
function parseAlly(raw: unknown, expectedId: AllyId): AllyState | null {
  if (!isRecord(raw) || raw.id !== expectedId) return null;
  if (![raw.x, raw.y, raw.hp, raw.maxHp, raw.shield, raw.cooldown, raw.casts].every(isFiniteNumber)) return null;
  return {
    id: expectedId, x: raw.x as number, y: raw.y as number, hp: raw.hp as number,
    maxHp: raw.maxHp as number, shield: raw.shield as number, cooldown: raw.cooldown as number,
    casts: raw.casts as number
  };
}
function parseEnemy(raw: unknown): EnemyState | null {
  if (!isRecord(raw)) return null;
  // Saves made before kind IDs were kept separately can recover the kind from its display name.
  const kind = isEnemyKindId(raw.kind)
    ? KINDS.find(item => item.id === raw.kind)!
    : KINDS.find(item => item.name === raw.name);
  if (!kind) return null;
  const fields = ['id', 'x', 'y', 'hp', 'maxHp', 'speed', 'damage', 'mass', 'pressure', 'bounty', 'radius', 'vy', 'attackCd'];
  if (!fields.every(field => isFiniteNumber(raw[field]))) return null;
  return {
    id: raw.id as number, kind: kind.id, name: kind.name,
    x: raw.x as number, y: raw.y as number, hp: raw.hp as number, maxHp: raw.maxHp as number,
    speed: raw.speed as number, damage: raw.damage as number, mass: raw.mass as number,
    pressure: raw.pressure as number, bounty: raw.bounty as number, radius: raw.radius as number,
    color: kind.color, vy: raw.vy as number, attackCd: raw.attackCd as number,
    flash: isFiniteNumber(raw.flash) ? raw.flash : 0, impactCd: isFiniteNumber(raw.impactCd) ? raw.impactCd : 0
  };
}
function parseRates(raw: unknown): Rates | null {
  if (!isRecord(raw) || ![raw.kills, raw.damage, raw.income].every(isFiniteNumber)) return null;
  return { kills: raw.kills as number, damage: raw.damage as number, income: raw.income as number };
}
function parseStats(raw: unknown): Stats | null {
  const rates = parseRates(raw);
  if (!rates || !isRecord(raw) || ![raw.collisions, raw.counter, raw.period].every(isFiniteNumber)) return null;
  return { ...rates, collisions: raw.collisions as number, counter: raw.counter as number, period: raw.period as number };
}
export function validateSave(raw: unknown): GameState | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const numbers = ['seed', 'nextId', 'time', 'distance', 'best', 'camp', 'velocity', 'kills', 'earnings', 'coins', 'spent', 'spawnIn'];
  if (!numbers.every(field => isFiniteNumber(raw[field]))) return null;
  if (!Array.isArray(raw.allies) || raw.allies.length !== ROSTER.length) return null;
  if (!Array.isArray(raw.enemies)) return null;
  const allies = raw.allies.map((ally, index) => parseAlly(ally, ROSTER[index].id));
  const enemies = raw.enemies.map(parseEnemy);
  const upgrades = parseUpgradeLevels(raw.upgrades);
  const rates = parseRates(raw.rates);
  const stats = parseStats(raw.stats);
  const campSnapshot = raw.campSnapshot === null ? null : parseCampSnapshot(raw.campSnapshot);
  const reasons: PauseReason[] = ['start', 'camp', 'danger', 'manual', null];
  if (allies.some(ally => ally === null) || enemies.some(enemy => enemy === null) || !upgrades || !rates || !stats) return null;
  if (raw.campSnapshot !== null && !campSnapshot) return null;
  if (typeof raw.paused !== 'boolean' || !reasons.includes(raw.pauseReason as PauseReason)) return null;
  if (raw.dangerAcknowledged !== undefined && typeof raw.dangerAcknowledged !== 'boolean') return null;
  if (![1, 2, 4].includes(raw.speed as number)) return null;
  if (!Array.isArray(raw.events) || raw.events.some(event => typeof event !== 'string')) return null;
  // The browser never simulates time while the page is closed. Effects and comparisons are transient.
  return {
    version: 1, seed: (raw.seed as number) >>> 0, nextId: raw.nextId as number,
    time: raw.time as number, distance: raw.distance as number, best: raw.best as number,
    camp: raw.camp as number, velocity: raw.velocity as number, kills: raw.kills as number,
    earnings: raw.earnings as number, coins: raw.coins as number, spent: raw.spent as number,
    upgrades, allies: allies as AllyState[], enemies: enemies as EnemyState[], effects: [],
    spawnIn: raw.spawnIn as number, paused: true,
    pauseReason: (raw.pauseReason as PauseReason) || 'manual', speed: raw.speed as 1 | 2 | 4,
    dangerAcknowledged: typeof raw.dangerAcknowledged === 'boolean' ? raw.dangerAcknowledged : raw.pauseReason === 'danger',
    campSnapshot, stats, rates, events: raw.events as string[], comparison: null
  };
}
export const format = (value: number): string => round(value).toFixed(1);
