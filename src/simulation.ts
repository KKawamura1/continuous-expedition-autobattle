import { ENEMIES, INITIAL_UNLOCKS, MAX_HEALTH, MUTATIONS, SEGMENT, WORLD_SCALE, has } from './content';
import type { Effect, Enemy, EnemyKind, MutationId, State } from './types';
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function createState(): State {
  return { version: 2, mode: 'title', distance: 0, checkpoint: 0, best: 0, health: MAX_HEALTH, speed: 0, time: 0, growth: 12, fossils: 0, unlocked: [...INITIAL_UNLOCKS], mutations: [], enemies: [], seed: 73419, nextId: 1, spawn: 0, bite: .4, sweep: .7, organ: 1.5, pressure: 0, effects: [], kills: 0, reaction: '', reactionTime: 0, reactionCooldown: 0 };
}
export function random(s: State): number { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
export function react(s: State, text: string, force = false): void {
  if (!force && s.reactionCooldown > 0) return;
  s.reaction = text; s.reactionTime = 2.5; s.reactionCooldown = 10;
}
export function start(s: State): void { if (s.mode === 'title') { s.mode = 'running'; react(s, 'いけいけー！', true); } }
export function cost(s: State, id: MutationId): number { return (MUTATIONS.find(m => m.id === id)?.cost ?? Infinity) + s.mutations.length * 2; }
export function mutate(s: State, id: MutationId): boolean {
  if (s.mode !== 'body' || !s.unlocked.includes(id) || s.mutations.includes(id) || s.growth < cost(s, id)) return false;
  s.growth -= cost(s, id); s.mutations.push(id); react(s, 'おおー！', true); return true;
}
export function unlock(s: State, id: MutationId): boolean {
  if (s.mode !== 'camp' || s.fossils < 1 || s.unlocked.includes(id) || !MUTATIONS.some(m => m.id === id)) return false;
  s.fossils--; s.unlocked.push(id); return true;
}
export function depart(s: State): boolean {
  if (s.mode !== 'camp' && s.mode !== 'fallen') return false;
  s.distance = s.checkpoint; s.health = MAX_HEALTH; s.speed = 0; s.pressure = 0; s.growth = 12; s.mutations = []; s.enemies = []; s.effects = []; s.spawn = 0; s.bite = .4; s.sweep = .7; s.organ = 1.5;
  s.mode = 'body'; react(s, 'まだ行くんだ', true); return true;
}
export function surface(x: number): number { return -9 * Math.pow(Math.abs(x) / 195, 1.8); }
export function spawnEnemy(s: State, kind?: EnemyKind, x?: number, y?: number): Enemy {
  const stage = s.checkpoint / SEGMENT;
  const r = random(s);
  const selected = kind ?? (r < (stage % 3 === 1 ? .27 : .15) ? 'boar' : r < (stage % 3 === 2 ? .63 : .38) ? 'wolf' : 'beetle');
  const spec = ENEMIES[selected];
  const e: Enemy = { ...spec, hp: spec.hp * (1 + Math.min(stage, 6) * .06), id: s.nextId++, kind: selected, x: x ?? -180 + random(s) * 360, y: y ?? s.distance + 145 + random(s) * 10, vx: 0, vy: -spec.speed, contact: 0, flash: 0, collisionCooldown: 0 };
  s.enemies.push(e); return e;
}
function effect(s: State, type: Effect['type'], x: number, y: number, life = .35, target?: Enemy): void {
  if (s.effects.length >= 100) return;
  s.effects.push({ type, x, y, life, maxLife: life, targetX: target?.x, targetY: target?.y });
}
function damage(e: Enemy, amount: number): void { e.hp -= amount; e.flash = .12; }
export function collide(a: Enemy, b: Enemy): number {
  const dx = b.x - a.x, dy = (b.y - a.y) * WORLD_SCALE;
  const d = Math.hypot(dx, dy), reach = a.radius + b.radius;
  if (d >= reach) return 0;
  const nx = d > .001 ? dx / d : (a.id < b.id ? 1 : -1), ny = d > .001 ? dy / d : 0;
  const sum = a.mass + b.mass, overlap = reach - d;
  a.x -= nx * overlap * b.mass / sum; b.x += nx * overlap * a.mass / sum;
  a.y -= ny * overlap / WORLD_SCALE * b.mass / sum; b.y += ny * overlap / WORLD_SCALE * a.mass / sum;
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * WORLD_SCALE * ny;
  if (closing <= 0) return 0;
  const impulse = closing * 1.25 / (1 / a.mass + 1 / b.mass);
  a.vx -= impulse / a.mass * nx; b.vx += impulse / b.mass * nx;
  a.vy -= impulse / a.mass * ny / WORLD_SCALE; b.vy += impulse / b.mass * ny / WORLD_SCALE;
  if (closing > 38 && a.collisionCooldown <= 0 && b.collisionCooldown <= 0) {
    const energy = Math.min(35, (closing - 38) * Math.min(a.mass, b.mass) * .24);
    damage(a, energy); damage(b, energy); a.collisionCooldown = b.collisionCooldown = .25; return energy;
  }
  return 0;
}
/** One fixed physical tick. All movement and resource generation freeze outside running. */
export function step(s: State, dt: number): void {
  if (s.mode !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .05);
  s.time += dt; s.reactionTime = Math.max(0, s.reactionTime - dt); s.reactionCooldown -= dt;
  s.effects = s.effects.filter(e => { e.life -= dt; return e.life > 0; });
  const m = s.mutations, heavy = (has(m, 'heavy-horn') ? 1.65 : 1) * (has(m, 'heavy-neck') ? 1.5 : 1);
  const sweepPeriod = (has(m, 'fast') ? .62 : 1.15) * (has(m, 'heavy-horn') ? 1.28 : 1) * (has(m, 'heavy-neck') ? 1.2 : 1);
  s.spawn += dt * .28 * (1 + Math.min(s.checkpoint / SEGMENT, 6) * .025) * Math.max(.8, 4.5 + s.speed);
  while (s.spawn >= 1 && s.enemies.length < 110) { s.spawn--; spawnEnemy(s); }
  s.spawn = Math.min(s.spawn, 2);
  s.bite -= dt; s.sweep -= dt; s.organ -= dt;
  const jawReady = s.bite <= 0, sweepReady = s.sweep <= 0;
  if (jawReady) s.bite = 1.05;
  if (sweepReady) s.sweep = sweepPeriod;
  const sweepTargets = new Set(sweepReady ? s.enemies.filter(e => e.y-s.distance<27 && e.y-s.distance>-16).sort((a,b)=>a.y-b.y).slice(0,has(m,'branch')?7:2).map(e=>e.id) : []);
  let touching = 0;
  for (const e of s.enemies) {
    e.flash = Math.max(0, e.flash - dt); e.collisionCooldown -= dt;
    const ahead = e.y - s.distance;
    const contactY = s.distance + surface(e.x) + e.radius / WORLD_SCALE;
    const touchingBody = e.y <= contactY + .8;
    e.vy += (-e.speed - e.vy) * dt * (has(m, 'hook-scale') && touchingBody ? .35 : 1.7);
    e.vx *= Math.exp(-dt * (has(m, 'hook-scale') && touchingBody ? 8 : 2));
    if (has(m, 'curl') && ahead < 25 && ahead > -14 && Math.abs(e.x) > 40) e.vx -= Math.sign(e.x) * 95 / e.mass * dt;
    if (has(m, 'tentacle') && ahead < 55 && ahead > 0 && Math.abs(e.x) > 70) {
      e.vx -= Math.sign(e.x) * 75 / e.mass * dt;
      if (s.organ <= 0) effect(s, 'pull', Math.sign(e.x) * 125, s.distance - 12, .45, e);
    }
    if (has(m, 'tongue') && s.organ <= 0 && Math.abs(e.x) < 90 && ahead > 8 && ahead < 75) {
      e.vy -= 30 / e.mass; effect(s, 'pull', 0, s.distance - 2, .5, e); s.organ = 2.7;
    }
    if (jawReady && ahead < 15 && ahead > -18 && Math.abs(e.x) < (has(m, 'wide-jaw') ? 135 : 65)) {
      const closing = Math.max(0, s.speed - e.vy);
      damage(e, (has(m, 'wide-jaw') ? 29 : 39) + (has(m, 'spring-jaw') ? closing * 2.4 : 0));
      effect(s, 'bite', e.x, e.y); e.vy += 8 / e.mass;
    }
    if (sweepTargets.has(e.id)) {
      damage(e, (has(m, 'branch') ? 14 : 18) * heavy);
      e.vy += 16 * heavy * (has(m, 'fast') ? .75 : 1) * (has(m, 'branch') ? .7 : 1) / e.mass;
      e.vx += Math.sign(e.x || 1) * 14 * heavy / e.mass;
      effect(s, 'sweep', e.x, e.y, .28);
    }
    const previousVy = e.vy;
    e.x = clamp(e.x + e.vx * dt, -187, 187); e.y += e.vy * dt;
    if (e.y < contactY) {
      const impactSpeed = Math.max(0, s.speed - previousVy);
      e.y = contactY; e.contact += dt; e.vy = Math.max(e.vy, s.speed);
      touching += e.mass; s.health -= e.mass * dt * .8;
      if (has(m, 'thorn')) damage(e, dt * (2 + Math.abs(e.vx) * .19 + impactSpeed * .9));
      if (has(m, 'hook-scale')) e.vx *= Math.exp(-dt * 12);
      if (has(m, 'elastic-scale') && impactSpeed > 4 && e.collisionCooldown <= 0) {
        e.vy = s.speed + impactSpeed * .8; damage(e, impactSpeed * .8); e.collisionCooldown = .3; effect(s, 'impact', e.x, e.y);
      }
    } else e.contact = 0;
  }
  if (s.organ <= 0) s.organ = 2.7;
  const grid = new Map<string, Enemy[]>();
  for (const e of s.enemies) {
    const gx = Math.floor(e.x / 32), gy = Math.floor(e.y * WORLD_SCALE / 32);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      for (const other of grid.get(`${gx + ox}:${gy + oy}`) ?? []) if (collide(other, e) > 0) effect(s, 'impact', e.x, e.y);
    }
    const key = `${gx}:${gy}`; const cell = grid.get(key) ?? []; cell.push(e); grid.set(key, cell);
  }
  s.enemies = s.enemies.filter(e => {
    if (e.hp > 0) return true;
    s.growth += e.kind === 'boar' ? 3 : 1; s.kills++; effect(s, 'dust', e.x, e.y, .6); return false;
  });
  s.pressure += (touching - s.pressure) * dt * 3;
  const targetSpeed = clamp(3.2 - s.pressure * 1.35 / (has(m, 'heavy-neck') ? 1.6 : 1) - (MAX_HEALTH - s.health) * .007, -3.4, 3.2);
  s.speed += (targetSpeed - s.speed) * dt * 2;
  s.health = clamp(s.health + 1.7 * dt, 0, MAX_HEALTH);
  s.distance = Math.max(s.checkpoint, s.distance + s.speed * dt); s.best = Math.max(s.best, s.distance);
  if (s.health <= 0) { s.mode = 'fallen'; s.speed = 0; react(s, 'やばいかも', true); }
  else if (s.distance >= s.checkpoint + SEGMENT) {
    s.checkpoint += SEGMENT; s.distance = s.checkpoint; s.fossils++; s.mode = 'camp'; s.speed = 0; react(s, 'あ、なんかある', true);
  } else if (s.pressure > 5) react(s, 'うわ、多い');
  else if (s.speed < -.5) react(s, '危ないかも');
  else if (s.kills > 0 && s.kills % 13 === 0) react(s, 'すご');
}
export function advance(s: State, seconds: number): void { for (let left = seconds; left > 1e-9; left -= .05) step(s, Math.min(.05, left)); }
