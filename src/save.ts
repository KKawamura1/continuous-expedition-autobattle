import { ENEMY_KINDS, ROSTER, UPGRADES } from './content.ts';
import { RECOVERY_SECONDS, WORLD_ORIGIN_Y, METRES_PER_UNIT, CAMERA_FRONT_Y } from './simulation.ts';
import type {
  AllyId, AllyState, CampSnapshot, EnemyState, GameState, PauseReason, PersistentGameState, Rates,
  Stats, UpgradeId, UpgradeLevels
} from './types.ts';

export const SAVE_KEY = 'continuous-expedition-prototype-v1';

export function encodeSave(state: GameState): string {
  const { effects, comparison, ...persistentState } = state;
  // Transient visuals and the last UI comparison are reconstructed instead of stored.
  void effects;
  void comparison;
  return JSON.stringify(persistentState satisfies PersistentGameState);
}

export function decodeSave(serialized: string | null): GameState | null {
  if (!serialized) return null;
  try {
    return validateSave(JSON.parse(serialized) as unknown);
  } catch {
    return null;
  }
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
function isEnemyKindId(value: unknown): value is (typeof ENEMY_KINDS)[number]['id'] {
  return ENEMY_KINDS.some(kind => kind.id === value);
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
function parseAlly(raw: unknown, expectedId: AllyId, legacySave: boolean): AllyState | null {
  if (!isRecord(raw) || raw.id !== expectedId) return null;
  if (![raw.x, raw.y, raw.hp, raw.maxHp, raw.shield, raw.cooldown, raw.casts].every(isFiniteNumber)) return null;
  const status = raw.status === undefined && legacySave
    ? ((raw.hp as number) <= 0 ? 'downed' : 'active')
    : raw.status;
  if (status !== 'active' && status !== 'downed') return null;
  const reviveIn = raw.reviveIn === undefined && legacySave
    ? (status === 'downed' ? RECOVERY_SECONDS : 0)
    : raw.reviveIn;
  if (!isFiniteNumber(reviveIn) || reviveIn < 0) return null;
  if (status === 'active' && ((raw.hp as number) <= 0 || reviveIn !== 0)) return null;
  if (status === 'downed' && ((raw.hp as number) !== 0 || reviveIn <= 0)) return null;
  return {
    id: expectedId, x: raw.x as number, y: raw.y as number, hp: raw.hp as number,
    status, reviveIn,
    maxHp: raw.maxHp as number, shield: raw.shield as number, cooldown: raw.cooldown as number,
    casts: raw.casts as number
  };
}
function parseEnemy(raw: unknown): EnemyState | null {
  if (!isRecord(raw)) return null;
  // Older saves can recover a kind from its display name if they predate kind IDs.
  const kind = isEnemyKindId(raw.kind)
    ? ENEMY_KINDS.find(item => item.id === raw.kind)!
    : ENEMY_KINDS.find(item => item.name === raw.name);
  if (!kind) return null;
  const fields = ['id', 'x', 'y', 'hp', 'maxHp', 'speed', 'damage', 'mass', 'pressure', 'bounty', 'radius', 'vy', 'attackCd'];
  if (!fields.every(field => isFiniteNumber(raw[field]))) return null;
  return {
    id: raw.id as number, kind: kind.id, name: kind.name,
    x: raw.x as number, y: raw.y as number, hp: raw.hp as number, maxHp: raw.maxHp as number,
    speed: raw.speed as number, damage: raw.damage as number, mass: raw.mass as number,
    pressure: raw.pressure as number, bounty: raw.bounty as number, radius: raw.radius as number,
    color: kind.color, vy: raw.vy as number, attackCd: raw.attackCd as number,
    flash: isFiniteNumber(raw.flash) ? raw.flash : 0, impactCd: isFiniteNumber(raw.impactCd) ? raw.impactCd : 0, alerted: typeof raw.alerted === 'boolean' ? raw.alerted : true
  };
}
function parseRates(raw: unknown): Rates | null {
  if (!isRecord(raw) || ![raw.kills, raw.damage, raw.income].every(isFiniteNumber)) return null;
  if (raw.recovery !== undefined && !isFiniteNumber(raw.recovery)) return null;
  const recovery = (raw.recovery as number | undefined) ?? 0;
  if (recovery < 0) return null;
  return { kills: raw.kills as number, damage: raw.damage as number, recovery, income: raw.income as number };
}
function parseStats(raw: unknown): Stats | null {
  const rates = parseRates(raw);
  if (!rates || !isRecord(raw) || ![raw.collisions, raw.counter, raw.period].every(isFiniteNumber)) return null;
  return { ...rates, collisions: raw.collisions as number, counter: raw.counter as number, period: raw.period as number };
}

export function validateSave(raw: unknown): GameState | null {
  if (!isRecord(raw) || (raw.version !== 1 && raw.version !== 2 && raw.version !== 3 && raw.version !== 4)) return null;
  const legacySave = raw.version < 3;
  const numbers = ['seed', 'nextId', 'time', 'distance', 'best', 'camp', 'velocity', 'kills', 'earnings', 'coins', 'spent', 'spawnIn'];
  if (!numbers.every(field => isFiniteNumber(raw[field]))) return null;
  const migratedPeak = Math.max(raw.camp as number, raw.distance as number,
    raw.pauseReason === 'danger' ? (raw.camp as number) + 66 : raw.camp as number);
  const peakSinceCamp = raw.peakSinceCamp === undefined && legacySave ? migratedPeak : raw.peakSinceCamp;
  if (!isFiniteNumber(peakSinceCamp) || peakSinceCamp < (raw.camp as number)) return null;
  if (!Array.isArray(raw.allies) || raw.allies.length !== ROSTER.length) return null;
  if (!Array.isArray(raw.enemies)) return null;
  const allies = raw.allies.map((ally, index) => parseAlly(ally, ROSTER[index].id, legacySave));
  const enemies = raw.enemies.map(parseEnemy);
  const upgrades = parseUpgradeLevels(raw.upgrades);
  const rates = parseRates(raw.rates);
  const stats = parseStats(raw.stats);
  const campSnapshot = raw.campSnapshot === null ? null : parseCampSnapshot(raw.campSnapshot);
  const reasons: PauseReason[] = ['start', 'camp', 'danger', 'manual', 'collapse', null];
  if (allies.some(ally => ally === null) || enemies.some(enemy => enemy === null) || !upgrades || !rates || !stats) return null;
  if (raw.campSnapshot !== null && !campSnapshot) return null;
  if (typeof raw.paused !== 'boolean' || !reasons.includes(raw.pauseReason as PauseReason)) return null;
  if (raw.dangerAcknowledged !== undefined && typeof raw.dangerAcknowledged !== 'boolean') return null;
  if (![1, 2, 4].includes(raw.speed as number)) return null;
  if (!Array.isArray(raw.events) || raw.events.some(event => typeof event !== 'string')) return null;
  const collapsed = (allies as AllyState[]).every(ally => ally.status === 'downed');
  if (!collapsed && raw.pauseReason === 'collapse') return null;
  let frontline = raw.frontline as number;
  let cameraY = raw.cameraY as number;
  let generatedTo = raw.generatedTo as number;
  let retreatBias = raw.retreatBias as number;
  if (raw.version === 4) {
    if (![frontline, cameraY, generatedTo, retreatBias].every(isFiniteNumber) || retreatBias < 0 || retreatBias > 1) return null;
    if (Math.abs((WORLD_ORIGIN_Y - frontline) * METRES_PER_UNIT - (raw.distance as number)) > .001) return null;
  } else {
    // Translate the entire old screen-space battle, preserving both relative
    // distances and saved expedition progress. New territory begins beyond it.
    const squad = (allies as AllyState[]).filter(a => a.status === 'active');
    const front = squad.length ? Math.min(...squad.map(a => a.y)) : WORLD_ORIGIN_Y;
    const oldFront = Math.max(front, ...(enemies as EnemyState[]).filter(e => e.hp > 0).map(e => e.y));
    frontline = WORLD_ORIGIN_Y - (raw.distance as number) / METRES_PER_UNIT;
    const shift = frontline - oldFront;
    for (const a of allies as AllyState[]) a.y += shift;
    for (const e of enemies as EnemyState[]) e.y += shift;
    cameraY = frontline - CAMERA_FRONT_Y;
    generatedTo = Math.min(frontline - .5, ...(enemies as EnemyState[]).map(e => e.y)) - .36;
    retreatBias = 0;
  }
  // Effects and comparisons are transient; loading always returns a paused expedition.
  return {
    version: 4, seed: (raw.seed as number) >>> 0, nextId: raw.nextId as number,
    time: raw.time as number, distance: raw.distance as number, best: raw.best as number,
    peakSinceCamp,
    camp: raw.camp as number, velocity: raw.velocity as number, kills: raw.kills as number,
    earnings: raw.earnings as number, coins: raw.coins as number, spent: raw.spent as number,
    upgrades, allies: allies as AllyState[], enemies: enemies as EnemyState[], effects: [],
    frontline, cameraY, generatedTo, retreatBias,
    spawnIn: raw.spawnIn as number, paused: true,
    pauseReason: collapsed ? 'collapse' : (raw.pauseReason as PauseReason) || 'manual', speed: raw.speed as 1 | 2 | 4,
    dangerAcknowledged: typeof raw.dangerAcknowledged === 'boolean' ? raw.dangerAcknowledged : raw.pauseReason === 'danger',
    campSnapshot, stats, rates, events: raw.events as string[], comparison: null
  };
}
