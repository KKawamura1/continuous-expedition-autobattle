export type AllyId = 'gou' | 'nagi' | 'hibana' | 'tsugumi' | 'genzou';
export type EnemyKindId = 'stray' | 'runner' | 'heavy' | 'swarm';
export type UpgradeId =
  | 'hook' | 'cleave' | 'collision' | 'counter' | 'chain' | 'pierce' | 'barrier' | 'shock'
  | 'longshot' | 'rapid' | 'ward' | 'reach' | 'arc';
export type UpgradeGroup = 'structure' | 'tuning';
export type PauseReason = 'start' | 'camp' | 'danger' | 'manual' | 'collapse' | null;
export type AllyStatus = 'active' | 'downed';
export type EffectKind = 'line' | 'burst';
export type DamageSource = AllyId | 'collision' | 'counter';
export type UpgradeLevels = Partial<Record<UpgradeId, number>>;

export interface RosterEntry {
  id: AllyId;
  name: string;
  role: string;
  x: number;
  y: number;
  hp: number;
  range: number;
  preferredRange: number;
  moveSpeed: number;
  damage: number;
  interval: number;
  color: string;
}

export interface UpgradeDefinition {
  id: UpgradeId;
  group: UpgradeGroup;
  name: string;
  owner: string;
  cost: number;
  max?: number;
  description: string;
}

export interface EnemyKindDefinition {
  id: EnemyKindId;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  mass: number;
  pressure: number;
  bounty: number;
  radius: number;
  color: string;
}

export interface AllyState {
  id: AllyId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  status: AllyStatus;
  reviveIn: number;
  shield: number;
  cooldown: number;
  casts: number;
}

export interface EnemyState extends Omit<EnemyKindDefinition, 'id'> {
  id: number;
  kind: EnemyKindId;
  x: number;
  y: number;
  maxHp: number;
  vy: number;
  attackCd: number;
  flash: number;
  impactCd: number;
}

export interface EffectState {
  x: number;
  y: number;
  toX: number;
  toY: number;
  color: string;
  kind: EffectKind;
  life: number;
}

export interface Rates {
  kills: number;
  damage: number;
  recovery: number;
  income: number;
}

export interface Stats extends Rates {
  collisions: number;
  counter: number;
  period: number;
}

export interface CampSnapshot {
  camp: number;
  coins: number;
  spent: number;
  upgrades: UpgradeLevels;
  earnings: number;
  kills: number;
}

export interface Comparison extends Rates {
  velocity: number;
  time: number;
  name: string;
}

export interface GameState {
  version: 3;
  seed: number;
  nextId: number;
  time: number;
  distance: number;
  best: number;
  peakSinceCamp: number;
  camp: number;
  velocity: number;
  kills: number;
  earnings: number;
  coins: number;
  spent: number;
  upgrades: UpgradeLevels;
  allies: AllyState[];
  enemies: EnemyState[];
  effects: EffectState[];
  spawnIn: number;
  paused: boolean;
  pauseReason: PauseReason;
  dangerAcknowledged: boolean;
  speed: 1 | 2 | 4;
  campSnapshot: CampSnapshot | null;
  stats: Stats;
  rates: Rates;
  events: string[];
  comparison: Comparison | null;
}

// Values needed to continue an expedition. Effects and the latest UI comparison are rebuilt on load.
export type PersistentGameState = Omit<GameState, 'effects' | 'comparison'>;
