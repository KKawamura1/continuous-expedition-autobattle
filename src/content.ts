import type { EnemyKindDefinition, RosterEntry, UpgradeDefinition } from './types.ts';

export const ROSTER = [
  { id: 'gou', name: 'ゴウ', role: '前衛・衝撃', x: .42, y: .77, hp: 100, range: .23, preferredRange: .15, moveSpeed: .19, damage: 21, interval: 1.35, color: '#db966c' },
  { id: 'nagi', name: 'ナギ', role: '庇護・反撃', x: .67, y: .79, hp: 125, range: .22, preferredRange: .18, moveSpeed: .14, damage: 13, interval: 1.65, color: '#7eb8b1' },
  { id: 'hibana', name: 'ヒバナ', role: '連撃', x: .23, y: .8, hp: 75, range: .31, preferredRange: .21, moveSpeed: .24, damage: 9, interval: .57, color: '#e8bc71' },
  { id: 'tsugumi', name: 'ツグミ', role: '射撃・治療', x: .32, y: .91, hp: 78, range: .66, preferredRange: .48, moveSpeed: .15, damage: 12, interval: 1.35, color: '#a4c5a0' },
  { id: 'genzou', name: 'ゲンゾウ', role: '術式', x: .76, y: .9, hp: 78, range: .72, preferredRange: .55, moveSpeed: .13, damage: 16, interval: 1.75, color: '#af9dc8' }
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

export const ENEMY_KINDS = [
  { id: 'stray', name: '徘徊体', hp: 31, speed: .048, damage: 5, mass: 1, pressure: 1, bounty: 13, radius: .026, color: '#d49c82' },
  { id: 'runner', name: '疾走体', hp: 21, speed: .081, damage: 4, mass: .65, pressure: .8, bounty: 11, radius: .021, color: '#edc47e' },
  { id: 'heavy', name: '重殻体', hp: 83, speed: .031, damage: 9, mass: 2.6, pressure: 2.3, bounty: 29, radius: .041, color: '#ad9dc0' },
  { id: 'swarm', name: '群体', hp: 19, speed: .056, damage: 3, mass: .55, pressure: .65, bounty: 9, radius: .019, color: '#99bdb1' }
] satisfies EnemyKindDefinition[];
