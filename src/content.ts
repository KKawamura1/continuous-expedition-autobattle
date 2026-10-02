import type { EnemyKind, MutationId, Part } from './types';
export const PARTS: { id: Part; name: string; note: string; x: number; y: number }[] = [
  { id: 'horn', name: '角・頭部', note: '触れる / 集める / 押す', x: -150, y: -40 },
  { id: 'jaw', name: '顎・口腔', note: '噛む / 引き込む', x: 30, y: 10 },
  { id: 'neck', name: '首・前胸', note: '振る / 重さを伝える', x: 115, y: 155 },
  { id: 'back', name: '背部器官', note: '引っ掛ける', x: 0, y: 365 },
  { id: 'skin', name: '外皮・鱗', note: '擦る / 留める / 返す', x: -170, y: 600 },
];
export interface Mutation { id: MutationId; part: Part; name: string; description: string; cost: number; initial: boolean; tier?: number; requires?: MutationId[]; excludes?: MutationId[] }
export interface MutationInfo { family: string; trigger: string; stats: [string, string][]; synergy: MutationId[]; tradeoff?: string }
export const INFO: Record<MutationId, MutationInfo> = {
  curl: { family: '集束', trigger: '角の前方25m・左右40pxより外', stats: [['中央への加速','95 ÷ 敵重量 px/s²']], synergy: ['wide-jaw', 'tentacle'] },
  'heavy-horn': { family: '衝突', trigger: '切り返し時・前方27m以内', stats: [['角の威力・押出','×1.65'],['切り返し間隔','×1.28']], synergy: ['elastic-scale', 'heavy-neck'], tradeoff: '枝角と排他' },
  branch: { family: '拡散', trigger: '切り返し時・前方27m以内', stats: [['接触対象','2 → 7体'],['基礎ダメージ','18 → 14'],['押出','×0.7']], synergy: ['curl', 'thorn'], tradeoff: '重角と排他' },
  'wide-jaw': { family: '捕食', trigger: '噛みつき・前方15m以内', stats: [['左右の到達','65 → 135px'],['基礎ダメージ','39 → 29']], synergy: ['curl','tentacle'] },
  tongue: { family: '捕獲', trigger: '2.7秒ごと・正面8〜75m', stats: [['引き込む速度','30 ÷ 敵重量 m/s'],['左右の到達','90px']], synergy: ['spring-jaw'] },
  'spring-jaw': { family: '勢い', trigger: '噛みつき命中時', stats: [['追加ダメージ','接近速度 ×2.4']], synergy: ['tongue','barbed-tongue'] },
  fast: { family: '連撃', trigger: '角の切り返し', stats: [['基本間隔','1.15 → 0.62秒'],['押出','×0.75']], synergy: ['branch','curl'], tradeoff: '重頸と排他' },
  'heavy-neck': { family: '重量', trigger: '接触・角の切り返し', stats: [['角の威力・押出','×1.5'],['圧力耐性','×1.6'],['切り返し間隔','×1.2']], synergy: ['heavy-horn','elastic-scale'], tradeoff: '速筋と排他' },
  tentacle: { family: '集束', trigger: '前方55m・左右70pxより外', stats: [['中央への加速','75 ÷ 敵重量 px/s²']], synergy: ['wide-jaw','spring-jaw'] },
  thorn: { family: '接触', trigger: '身体に接触している間', stats: [['毎秒ダメージ','2 + 横速度×0.19 + 接近速度×0.9']], synergy: ['hook-scale','curl'] },
  'hook-scale': { family: '拘束', trigger: '身体に接触している間', stats: [['横移動の減衰','強'],['前後速度の復帰','通常の21%']], synergy: ['thorn','wide-jaw'], tradeoff: '敵の接触圧も残る' },
  'elastic-scale': { family: '反発', trigger: '接近速度4m/s超の接触・0.3秒間隔', stats: [['反発速度','接近速度 ×0.8'],['ダメージ','接近速度 ×0.8']], synergy: ['heavy-horn','heavy-neck'] },
  'ram-horn': { family: '衝突', trigger: '重角の切り返し', stats: [['角ダメージ','さらに×1.4'],['押出','さらに×1.25'],['間隔','さらに×1.1']], synergy: ['rebound-scale'], tradeoff: '一撃に資源を集中' },
  crown: { family: '拡散', trigger: '枝角の切り返し', stats: [['接触対象','7 → 11体']], synergy: ['fast','curl'] },
  crusher: { family: '捕食', trigger: '大顎の噛みつき', stats: [['ダメージ','+20'],['噛む間隔','1.05 → 1.26秒']], synergy: ['curl','tentacle'], tradeoff: '噛む頻度が低下' },
  'barbed-tongue': { family: '捕獲', trigger: '鉤舌の発動時', stats: [['引込速度','さらに×1.6']], synergy: ['spring-jaw'] },
  'rapid-neck': { family: '連撃', trigger: '速筋の切り返し', stats: [['間隔','さらに×0.72'],['押出','さらに×0.8']], synergy: ['crown','curl'], tradeoff: '押し出す勢いが低下' },
  'anchor-neck': { family: '重量', trigger: '身体に敵が接触中', stats: [['圧力耐性','1.6 → 2.4倍']], synergy: ['hook-scale','thorn'] },
  'long-tentacle': { family: '集束', trigger: '鉤触手の捕獲', stats: [['前方の到達','55 → 85m']], synergy: ['wide-jaw'] },
  'double-tentacle': { family: '集束', trigger: '鉤触手の捕獲', stats: [['中央への加速','さらに×1.5']], synergy: ['crusher','spring-jaw'] },
  'razor-scale': { family: '接触', trigger: '棘鱗の接触', stats: [['擦りダメージ','さらに×1.8']], synergy: ['hook-scale'] },
  'rebound-scale': { family: '反発', trigger: '弾性鱗の反発', stats: [['反発速度','0.8 → 1.25倍'],['反発ダメージ','さらに×1.5']], synergy: ['ram-horn'] },
};
export const MUTATIONS: Mutation[] = [
  { id: 'curl', part: 'horn', name: '反り角', description: '横から触れた敵を、角の内側へ。中央に集まるほど顎が働く。', cost: 8, initial: true },
  { id: 'heavy-horn', excludes: ['branch'], part: 'horn', name: '重角', description: '太い角で強く押し返す。飛ばした敵は、後続の敵にぶつかる。切り返しは遅くなる。', cost: 10, initial: true },
  { id: 'branch', excludes: ['heavy-horn'], part: 'horn', name: '枝角', description: '枝分かれした角が一度に多くの敵に触れる。一体を押す力は弱くなる。', cost: 10, initial: true },
  { id: 'wide-jaw', part: 'jaw', name: '大顎', description: '噛む幅が大きく広がる。集まった敵をまとめて噛むが、一体への力は少し弱まる。', cost: 8, initial: true },
  { id: 'tongue', part: 'jaw', name: '鉤舌', description: '正面の敵を舌で引き込む。軽い敵ほど、速く口元へ引かれる。', cost: 10, initial: true },
  { id: 'spring-jaw', requires: ['tongue'], part: 'jaw', name: '跳ね顎', description: '近づく敵の勢いを、噛む力に変える。舌で引いた敵にも効く。', cost: 12, initial: false },
  { id: 'fast', excludes: ['heavy-neck'], part: 'neck', name: '速筋', description: '頭の切り返しが速くなり、角が何度も敵に触れる。一回の押し出しは弱くなる。', cost: 10, initial: true },
  { id: 'heavy-neck', excludes: ['fast'], part: 'neck', name: '重頸', description: '前胸に重さが加わる。押し合いと衝突に強くなるが、横への動きは遅くなる。', cost: 10, initial: true },
  { id: 'tentacle', part: 'back', name: '鉤触手', description: '左右の敵を引っ掛けて中央へ寄せる。重い敵は少しずつしか動かない。', cost: 12, initial: false },
  { id: 'thorn', part: 'skin', name: '棘鱗', description: '身体に沿って動く敵を擦り削る。速く滑るほど深く傷つく。', cost: 8, initial: true },
  { id: 'hook-scale', part: 'skin', name: '鉤鱗', description: '敵を鱗に引っ掛け、身体の近くに留める。噛みやすくなるが、接触の圧も残る。', cost: 10, initial: false },
  { id: 'elastic-scale', part: 'skin', name: '弾性鱗', description: '速く当たった敵ほど強く跳ね返す。その勢いは敵同士の衝突にも伝わる。', cost: 12, initial: false },
  { id: 'ram-horn', part: 'horn', name: '破城角', description: '重角をさらに太くして、一撃と押し出す勢いを伸ばす。', cost: 26, initial: true, tier: 2, requires: ['heavy-horn'] },
  { id: 'crown', part: 'horn', name: '冠角', description: '枝を広げて、密集した敵に同時に触れる。', cost: 24, initial: true, tier: 2, requires: ['branch'] },
  { id: 'crusher', part: 'jaw', name: '圧砕顎', description: '広い顎をゆっくり閉じ、集まった敵を重く噛み砕く。', cost: 26, initial: true, tier: 2, requires: ['wide-jaw'] },
  { id: 'barbed-tongue', part: 'jaw', name: '巻き鉤舌', description: '引き込む速度を上げ、跳ね顎へ勢いを渡す。', cost: 24, initial: true, tier: 2, requires: ['tongue'] },
  { id: 'rapid-neck', part: 'neck', name: '瞬発筋', description: '頻繁な切り返しで敵を捉え続ける。押す力はさらに弱まる。', cost: 24, initial: true, tier: 2, requires: ['fast'] },
  { id: 'anchor-neck', part: 'neck', name: '支柱頸', description: '前胸を支柱のように支え、密集した敵の圧に耐える。', cost: 26, initial: true, tier: 2, requires: ['heavy-neck'] },
  { id: 'long-tentacle', part: 'back', name: '長鉤触手', description: '遠くの左右の敵まで捕らえ、早くから中央へ寄せる。', cost: 24, initial: true, tier: 2, requires: ['tentacle'] },
  { id: 'double-tentacle', part: 'back', name: '束鉤触手', description: '触手を束ねて、重い敵も強く中央へ引く。', cost: 28, initial: true, tier: 3, requires: ['long-tentacle'] },
  { id: 'razor-scale', part: 'skin', name: '刃鱗', description: '棘を鋭く研ぎ、身体を滑る敵を深く削る。', cost: 24, initial: true, tier: 2, requires: ['thorn'] },
  { id: 'rebound-scale', part: 'skin', name: '反響鱗', description: '反発を増幅し、跳ねた敵から後続へ勢いを渡す。', cost: 28, initial: true, tier: 2, requires: ['elastic-scale'] },
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
