export type Part = 'horn' | 'jaw' | 'neck' | 'back' | 'skin';
export type MutationId = 'curl' | 'heavy-horn' | 'branch' | 'wide-jaw' | 'tongue' | 'spring-jaw' | 'fast' | 'heavy-neck' | 'tentacle' | 'thorn' | 'hook-scale' | 'elastic-scale' | 'ram-horn' | 'crown' | 'crusher' | 'barbed-tongue' | 'rapid-neck' | 'anchor-neck' | 'long-tentacle' | 'double-tentacle' | 'razor-scale' | 'rebound-scale';
export type Mode = 'title' | 'running' | 'body' | 'camp' | 'fallen';
export type EnemyKind = 'beetle' | 'wolf' | 'boar';
export interface Enemy { id: number; kind: EnemyKind; x: number; y: number; vx: number; vy: number; hp: number; maxHp: number; hpTime: number; mass: number; radius: number; speed: number; contact: number; flash: number; collisionCooldown: number }
export type Feedback = 'bite' | 'sweep' | 'pull' | 'collision' | 'rebound' | 'scrape' | 'hook' | 'dust';
export interface Effect { type: Feedback; x: number; y: number; life: number; maxLife: number; targetX?: number; targetY?: number; targetId?: number; otherId?: number; source?: MutationId; strength?: number; dx?: number; dy?: number }
export interface State { version: 2; mode: Mode; distance: number; checkpoint: number; best: number; health: number; speed: number; time: number; growth: number; fossils: number; unlocked: MutationId[]; mutations: MutationId[]; enemies: Enemy[]; seed: number; nextId: number; spawn: number; bite: number; sweep: number; organ: number; pressure: number; effects: Effect[]; kills: number; reaction: string; reactionTime: number; reactionCooldown: number }
