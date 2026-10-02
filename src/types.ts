export type Part = 'horn' | 'jaw' | 'neck' | 'back' | 'skin';
export type MutationId = 'curl' | 'heavy-horn' | 'branch' | 'wide-jaw' | 'tongue' | 'spring-jaw' | 'fast' | 'heavy-neck' | 'tentacle' | 'thorn' | 'hook-scale' | 'elastic-scale';
export type Mode = 'title' | 'running' | 'body' | 'camp' | 'fallen';
export type EnemyKind = 'beetle' | 'wolf' | 'boar';
export interface Enemy { id: number; kind: EnemyKind; x: number; y: number; vx: number; vy: number; hp: number; mass: number; radius: number; speed: number; contact: number; flash: number; collisionCooldown: number }
export interface Effect { type: 'bite' | 'sweep' | 'pull' | 'impact' | 'dust'; x: number; y: number; life: number; maxLife: number; targetX?: number; targetY?: number }
export interface State { version: 2; mode: Mode; distance: number; checkpoint: number; best: number; health: number; speed: number; time: number; growth: number; fossils: number; unlocked: MutationId[]; mutations: MutationId[]; enemies: Enemy[]; seed: number; nextId: number; spawn: number; bite: number; sweep: number; organ: number; pressure: number; effects: Effect[]; kills: number; reaction: string; reactionTime: number; reactionCooldown: number }
