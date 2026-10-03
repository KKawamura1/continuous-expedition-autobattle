import type { EnemyKind, MutationId, Part } from './types';
export const PARTS: { id: Part; name: string; note: string; x: number; y: number }[] = [
  { id: 'horn', name: '角・頭部', note: '触れる / 集める / 押す', x: -150, y: -40 },
  { id: 'jaw', name: '顎・口腔', note: '噛む / 引き込む', x: 30, y: 10 },
  { id: 'neck', name: '首・前胸', note: '進む / 重さを支える', x: 115, y: 155 },
  { id: 'back', name: '背部器官', note: '引っ掛ける', x: 0, y: 260 },
  { id: 'skin', name: '外皮・鱗', note: '擦る / 留める / 返す', x: -170, y: 350 },
];
export interface Mutation { id: MutationId; part: Part; name: string; description: string; cost: number; initial: boolean; tier?: number; requires?: MutationId[]; excludes?: MutationId[] }
export interface MutationInfo { family: string; trigger: string; stats: [string, string][]; synergy: MutationId[]; tradeoff?: string }
export const INFO: Record<MutationId, MutationInfo> = {
  curl: { family: '集束', trigger: '反った角の内側に敵が触れる', stats: [['角のかたち','内側へ曲がる'],['受け流し','角に沿って口元へ滑る']], synergy: ['wide-jaw', 'tentacle'] },
  'heavy-horn': { family: '衝突', trigger: '大きな角の斜面に敵が当たる', stats: [['角のかたち','太く、長い斜面になる'],['接触','中央へ受け流し、重く弾く']], synergy: ['elastic-scale', 'heavy-neck'], tradeoff: '枝角と排他' },
  branch: { family: '拡散', trigger: '枝分かれした角に敵が触れる', stats: [['角のかたち','左右に枝が生える'],['接触','枝に触れた敵をまとめて弾く']], synergy: ['curl', 'thorn'], tradeoff: '重角と排他' },
  'wide-jaw': { family: '捕食', trigger: '開いた顎の間に敵が入る', stats: [['顎のかたち','横幅が約2倍になる'],['基礎ダメージ','39 → 29']], synergy: ['curl','tentacle'] },
  tongue: { family: '捕獲', trigger: '伸びた舌の鉤が敵に引っ掛かる', stats: [['舌のかたち','長い鉤舌が伸び縮みする'],['捕獲','触れた1体を口元へ引き戻す'],['伸ばす間隔','2.7秒']], synergy: ['spring-jaw'] },
  'spring-jaw': { family: '勢い', trigger: '勢いよく顎に飛び込んだ敵を噛む', stats: [['噛む力','速く飛び込むほど強い'],['追加ダメージ','接近速度 ×2.4']], synergy: ['tongue','barbed-tongue'] },
  fast: { family: '進軍', trigger: '前胸の筋肉が身体全体を前へ押す', stats: [['前胸のかたち','押し進む筋が発達する'],['進軍速度の上限','3.2 → 3.8m/s']], synergy: ['branch','curl'], tradeoff: '重頸と排他' },
  'heavy-neck': { family: '重量', trigger: '身体と敵が押し合う・角が当たる', stats: [['前胸のかたち','太く重くなる'],['角の威力・反発','×1.5'],['圧力耐性','×1.6']], synergy: ['heavy-horn','elastic-scale'], tradeoff: '速筋と排他' },
  tentacle: { family: '捕獲', trigger: '伸びた触手の鉤が敵に引っ掛かる', stats: [['器官のかたち','左右に鉤付きの腕が生える'],['捕獲','片腕に1体ずつ、縮んで引き戻す']], synergy: ['wide-jaw','spring-jaw'] },
  thorn: { family: '接触', trigger: '身体の縁に生えた棘を敵が擦る', stats: [['鱗のかたち','身体の縁と背に棘が生える'],['擦り傷','速く滑るほど深い']], synergy: ['hook-scale','curl'] },
  'hook-scale': { family: '拘束', trigger: '身体の縁の鉤に敵が引っ掛かる', stats: [['鱗のかたち','曲がった鉤が生える'],['摩擦','滑りにくく、身体の近くに留まる']], synergy: ['thorn','wide-jaw'], tradeoff: '敵の接触圧も残る' },
  'elastic-scale': { family: '反発', trigger: '膨らんだ鱗に敵がぶつかる', stats: [['鱗のかたち','厚く柔らかな鱗になる'],['反発','凹んで戻り、敵を跳ね返す']], synergy: ['heavy-horn','heavy-neck'] },
  'ram-horn': { family: '衝突', trigger: 'さらに大きな重角が敵に当たる', stats: [['角のかたち','さらに長く、太くなる'],['角ダメージ','さらに×1.4']], synergy: ['rebound-scale'], tradeoff: '一撃に資源を集中' },
  crown: { family: '拡散', trigger: '増えた角の枝が敵に触れる', stats: [['角のかたち','内側にも大きな枝が生える']], synergy: ['fast','curl'] },
  crusher: { family: '捕食', trigger: '厚い顎で敵を噛み砕く', stats: [['顎のかたち','縁と歯が厚くなる'],['ダメージ','+20'],['噛む間隔','1.05 → 1.26秒']], synergy: ['curl','tentacle'], tradeoff: '噛む頻度が低下' },
  'barbed-tongue': { family: '捕獲', trigger: '舌先の棘が敵に引っ掛かる', stats: [['舌のかたち','鉤に返しが生える'],['引き戻し','強く縮んで口へ引く']], synergy: ['spring-jaw'] },
  'rapid-neck': { family: '進軍', trigger: '発達した筋肉で身体を押し進める', stats: [['前胸のかたち','進む筋がさらに発達する'],['進軍速度の上限','3.8 → 4.0m/s']], synergy: ['crown','curl'] },
  'anchor-neck': { family: '重量', trigger: '身体に敵が押し寄せる', stats: [['前胸のかたち','厚い支柱が身体を支える'],['圧力耐性','1.6 → 2.4倍']], synergy: ['hook-scale','thorn'] },
  'long-tentacle': { family: '捕獲', trigger: '長く伸びた触手の鉤が敵に触れる', stats: [['器官のかたち','触手が長くなり、遠くまで届く']], synergy: ['wide-jaw'] },
  'double-tentacle': { family: '捕獲', trigger: '増えた触手の鉤が敵に触れる', stats: [['器官のかたち','左右にもう1本ずつ生える'],['捕獲','左右2体ずつ掴める']], synergy: ['crusher','spring-jaw'] },
  'razor-scale': { family: '接触', trigger: '鋭い棘に沿って敵が滑る', stats: [['鱗のかたち','棘が長く鋭くなる'],['擦りダメージ','さらに×1.8']], synergy: ['hook-scale'] },
  'rebound-scale': { family: '反発', trigger: '厚い弾性鱗に敵がぶつかる', stats: [['鱗のかたち','反発する鱗がさらに厚くなる'],['反発速度','0.8 → 1.25倍'],['反発ダメージ','さらに×1.5']], synergy: ['ram-horn'] },
};
export const MUTATIONS: Mutation[] = [
  { id: 'curl', part: 'horn', name: '反り角', description: '横から触れた敵を、角の内側へ。中央に集まるほど顎が働く。', cost: 8, initial: true },
  { id: 'heavy-horn', excludes: ['branch'], part: 'horn', name: '重角', description: '太く大きな角が生える。斜面に当たった敵が中央・口元へ滑り、衝突の勢いで弾かれる。', cost: 10, initial: true },
  { id: 'branch', excludes: ['heavy-horn'], part: 'horn', name: '枝角', description: '枝分かれした角が一度に多くの敵に触れる。一体を押す力は弱くなる。', cost: 10, initial: true },
  { id: 'wide-jaw', part: 'jaw', name: '大顎', description: '噛む幅が大きく広がる。集まった敵をまとめて噛むが、一体への力は少し弱まる。', cost: 8, initial: true },
  { id: 'tongue', part: 'jaw', name: '鉤舌', description: '正面の敵を舌で引き込む。軽い敵ほど、速く口元へ引かれる。', cost: 10, initial: true },
  { id: 'spring-jaw', requires: ['tongue'], part: 'jaw', name: '跳ね顎', description: '近づく敵の勢いを、噛む力に変える。舌で引いた敵にも効く。', cost: 12, initial: false },
  { id: 'fast', excludes: ['heavy-neck'], part: 'neck', name: '速筋', description: '前胸の筋が発達し、身体全体を前へ押し進める力が強くなる。', cost: 10, initial: true },
  { id: 'heavy-neck', excludes: ['fast'], part: 'neck', name: '重頸', description: '前胸に重さが加わる。押し合いと衝突に強くなる。', cost: 10, initial: true },
  { id: 'tentacle', part: 'back', name: '鉤触手', description: '左右の敵を引っ掛けて中央へ寄せる。重い敵は少しずつしか動かない。', cost: 12, initial: false },
  { id: 'thorn', part: 'skin', name: '棘鱗', description: '身体に沿って動く敵を擦り削る。速く滑るほど深く傷つく。', cost: 8, initial: true },
  { id: 'hook-scale', part: 'skin', name: '鉤鱗', description: '敵を鱗に引っ掛け、身体の近くに留める。噛みやすくなるが、接触の圧も残る。', cost: 10, initial: false },
  { id: 'elastic-scale', part: 'skin', name: '弾性鱗', description: '速く当たった敵ほど強く跳ね返す。その勢いは敵同士の衝突にも伝わる。', cost: 12, initial: false },
  { id: 'ram-horn', part: 'horn', name: '破城角', description: '重角をさらに太くして、一撃と押し出す勢いを伸ばす。', cost: 26, initial: true, tier: 2, requires: ['heavy-horn'] },
  { id: 'crown', part: 'horn', name: '冠角', description: '枝を広げて、密集した敵に同時に触れる。', cost: 24, initial: true, tier: 2, requires: ['branch'] },
  { id: 'crusher', part: 'jaw', name: '圧砕顎', description: '広い顎をゆっくり閉じ、集まった敵を重く噛み砕く。', cost: 26, initial: true, tier: 2, requires: ['wide-jaw'] },
  { id: 'barbed-tongue', part: 'jaw', name: '巻き鉤舌', description: '舌の鉤に返しが生え、強く縮んで敵を口元へ引き戻す。', cost: 24, initial: true, tier: 2, requires: ['tongue'] },
  { id: 'rapid-neck', part: 'neck', name: '瞬発筋', description: '前胸の筋がさらに発達し、身体全体が速く前進する。', cost: 24, initial: true, tier: 2, requires: ['fast'] },
  { id: 'anchor-neck', part: 'neck', name: '支柱頸', description: '前胸を支柱のように支え、密集した敵の圧に耐える。', cost: 26, initial: true, tier: 2, requires: ['heavy-neck'] },
  { id: 'long-tentacle', part: 'back', name: '長鉤触手', description: '遠くの左右の敵まで捕らえ、早くから中央へ寄せる。', cost: 24, initial: true, tier: 2, requires: ['tentacle'] },
  { id: 'double-tentacle', part: 'back', name: '束鉤触手', description: '左右の触手がもう1本ずつ増え、それぞれの鉤で敵を掴む。', cost: 28, initial: true, tier: 3, requires: ['long-tentacle'] },
  { id: 'razor-scale', part: 'skin', name: '刃鱗', description: '棘を鋭く研ぎ、身体を滑る敵を深く削る。', cost: 24, initial: true, tier: 2, requires: ['thorn'] },
  { id: 'rebound-scale', part: 'skin', name: '反響鱗', description: '弾性鱗がさらに厚くなる。大きく凹んで戻り、跳ねた敵が後続へぶつかる。', cost: 28, initial: true, tier: 2, requires: ['elastic-scale'] },
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
