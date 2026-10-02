import type { EnemyKind, MutationId, Part } from './types';
export const PARTS: { id: Part; name: string; note: string; y: number }[] = [
  { id: 'horn', name: '角・頭部', note: '触れる / 集める / 押す', y: .27 },
  { id: 'jaw', name: '顎・口腔', note: '噛む / 引き込む', y: .40 },
  { id: 'neck', name: '首・前胸', note: '振る / 重さを伝える', y: .54 },
  { id: 'back', name: '背部器官', note: '引っ掛ける', y: .69 },
  { id: 'skin', name: '外皮・鱗', note: '擦る / 留める / 返す', y: .83 },
];
export interface Mutation { id: MutationId; part: Part; name: string; description: string; cost: number; initial: boolean }
export const MUTATIONS: Mutation[] = [
  { id: 'curl', part: 'horn', name: '反り角', description: '横から触れた敵を、角の内側へ。中央に集まるほど顎が働く。', cost: 8, initial: true },
  { id: 'heavy-horn', part: 'horn', name: '重角', description: '太い角で強く押し返す。飛ばした敵は、後続の敵にぶつかる。切り返しは遅くなる。', cost: 10, initial: true },
  { id: 'branch', part: 'horn', name: '枝角', description: '枝分かれした角が一度に多くの敵に触れる。一体を押す力は弱くなる。', cost: 10, initial: true },
  { id: 'wide-jaw', part: 'jaw', name: '大顎', description: '噛む幅が大きく広がる。集まった敵をまとめて噛むが、一体への力は少し弱まる。', cost: 8, initial: true },
  { id: 'tongue', part: 'jaw', name: '鉤舌', description: '正面の敵を舌で引き込む。軽い敵ほど、速く口元へ引かれる。', cost: 10, initial: true },
  { id: 'spring-jaw', part: 'jaw', name: '跳ね顎', description: '近づく敵の勢いを、噛む力に変える。舌で引いた敵にも効く。', cost: 12, initial: false },
  { id: 'fast', part: 'neck', name: '速筋', description: '頭の切り返しが速くなり、角が何度も敵に触れる。一回の押し出しは弱くなる。', cost: 10, initial: true },
  { id: 'heavy-neck', part: 'neck', name: '重頸', description: '前胸に重さが加わる。押し合いと衝突に強くなるが、横への動きは遅くなる。', cost: 10, initial: true },
  { id: 'tentacle', part: 'back', name: '鉤触手', description: '左右の敵を引っ掛けて中央へ寄せる。重い敵は少しずつしか動かない。', cost: 12, initial: false },
  { id: 'thorn', part: 'skin', name: '棘鱗', description: '身体に沿って動く敵を擦り削る。速く滑るほど深く傷つく。', cost: 8, initial: true },
  { id: 'hook-scale', part: 'skin', name: '鉤鱗', description: '敵を鱗に引っ掛け、身体の近くに留める。噛みやすくなるが、接触の圧も残る。', cost: 10, initial: false },
  { id: 'elastic-scale', part: 'skin', name: '弾性鱗', description: '速く当たった敵ほど強く跳ね返す。その勢いは敵同士の衝突にも伝わる。', cost: 12, initial: false },
];
export const INITIAL_UNLOCKS = MUTATIONS.filter(m => m.initial).map(m => m.id);
export const ENEMIES: Record<EnemyKind, { hp: number; mass: number; radius: number; speed: number }> = {
  beetle: { hp: 22, mass: .65, radius: 8, speed: 4.5 },
  wolf: { hp: 32, mass: 1.1, radius: 10, speed: 8 },
  boar: { hp: 88, mass: 3.4, radius: 15, speed: 2.8 },
};
export const has = (mutations: MutationId[], id: MutationId) => mutations.includes(id);
export const WORLD_SCALE = 4;
export const MAX_HEALTH = 180;
export const SEGMENT = 300;
