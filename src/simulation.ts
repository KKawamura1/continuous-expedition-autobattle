import { ENEMIES, INITIAL_UNLOCKS, MAX_HEALTH, MUTATIONS, SEGMENT, WORLD_SCALE, has } from './content';
import { hornMotion, hornShapes, jawShape, organRestTip, shapeContact, skinEdge, sweepPeriod } from './body-physics';
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
export function mutationBlock(s: State, id: MutationId): string | null {
  const m = MUTATIONS.find(m => m.id === id);
  if (!m) return '不明な変異';
  if (s.mutations.includes(id)) return '取得済み';
  if (!s.unlocked.includes(id)) return '拠点で解禁';
  const missing = m.requires?.filter(id => !s.mutations.includes(id)) ?? [];
  if (missing.length) return `前提: ${missing.map(id => MUTATIONS.find(m => m.id === id)!.name).join(' + ')}`;
  const excluded = MUTATIONS.find(other => s.mutations.includes(other.id) && (m.excludes?.includes(other.id) || other.excludes?.includes(id)));
  if (excluded) return `${excluded.name}と排他`;
  if (s.growth < cost(s, id)) return `資源不足 · あと${cost(s, id) - s.growth}`;
  return null;
}
export function mutate(s: State, id: MutationId): boolean {
  if (s.mode !== 'body' || mutationBlock(s, id)) return false;
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
export function spawnEnemy(s: State, kind?: EnemyKind, x?: number, y?: number): Enemy {
  const stage = s.checkpoint / SEGMENT;
  const r = random(s);
  const selected = kind ?? (r < (stage % 3 === 1 ? .27 : .15) ? 'boar' : r < (stage % 3 === 2 ? .63 : .38) ? 'wolf' : 'beetle');
  const spec = ENEMIES[selected];
  const e: Enemy = { ...spec, hp: spec.hp * (1 + Math.min(stage, 6) * .06), maxHp: spec.hp * (1 + Math.min(stage, 6) * .06), hpTime: 0, id: s.nextId++, kind: selected, x: x ?? -180 + random(s) * 360, y: y ?? s.distance + 145 + random(s) * 10, vx: 0, vy: -spec.speed, contact: 0, flash: 0, collisionCooldown: 0 };
  s.enemies.push(e); return e;
}
function effect(s: State, type: Effect['type'], x: number, y: number, life = .35, target?: Enemy, extra: Partial<Effect> = {}): void {
  if (s.effects.length >= 100) return;
  s.effects.push({ type, x, y, life, maxLife: life, targetX: target?.x, targetY: target?.y, targetId: target?.id, ...extra });
}
function damage(e: Enemy, amount: number): void { e.hp -= amount; e.flash = .12; e.hpTime = 2.2; }
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
/** Organs are material hooks. Each arm can hold one body, and a missed tip exerts no force. */
function operateOrgans(s: State, dt: number): void {
  const m = s.mutations;
  const cast = (source: MutationId, side: number, reach: number, bundle = false) => {
    if (s.effects.some(f => f.type === 'pull' && f.source === source && Math.sign(f.x) === side)) return;
    const origin = source === 'tongue' ? { x: 0, y: 12 } : { x: side * (bundle ? 105 : 88), y: 125 };
    const target = s.enemies.filter(e => e.hp > 0 && !s.effects.some(f => f.type === 'pull' && f.targetId === e.id) &&
      (source === 'tongue' ? Math.abs(e.x) < 90 : Math.sign(e.x) === side && Math.abs(e.x) > 60) &&
      e.y - s.distance > 10 && Math.hypot(e.x - origin.x, -(e.y - s.distance) * WORLD_SCALE - origin.y) < reach)
      .sort((a, b) => a.y - b.y)[0];
    if (target) effect(s, 'pull', origin.x, s.distance - origin.y / WORLD_SCALE, source === 'tongue' ? 1.05 : 1.3, target,
      { source, strength: bundle ? 2 : 1, attached: false });
  };
  if (has(m, 'tongue') && s.organ <= 0) cast('tongue', 0, 312);
  if (s.organ <= 0) s.organ = 2.7;
  if (has(m, 'tentacle')) for (const side of [-1, 1]) {
    cast('tentacle', side, has(m, 'long-tentacle') ? 470 : 350);
    if (has(m, 'double-tentacle')) cast('long-tentacle', side, 470, true);
  }
  for (const f of s.effects.filter(f => f.type === 'pull')) {
    const e = s.enemies.find(e => e.id === f.targetId);
    if (!e || e.hp <= 0) { f.attached = false; continue; }
    const tip = organRestTip(f, s), dx = tip.x - e.x, dy = tip.y + (e.y - s.distance) * WORLD_SCALE;
    if (!f.attached && Math.hypot(dx, dy) < e.radius + 6) f.attached = true;
    if (!f.attached) continue;
    // Spring tension from tip/body separation; heavier bodies lag behind the contracting hook.
    const stiffness = f.source === 'tongue' && has(m, 'barbed-tongue') ? 85 : 55;
    e.vx += clamp(dx * stiffness / e.mass, -1600, 1600) * dt;
    e.vy -= clamp(dy * stiffness / e.mass, -1600, 1600) / WORLD_SCALE * dt;
  }
}
/** One fixed physical tick. All movement and resource generation freeze outside running. */
export function step(s: State, dt: number): void {
  if (s.mode !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .05);
  s.time += dt; s.reactionTime = Math.max(0, s.reactionTime - dt); s.reactionCooldown -= dt;
  s.effects = s.effects.filter(e => { e.life -= dt; return e.life > 0; });
  const m = s.mutations, heavy = (has(m, 'heavy-horn') ? 1.65 : 1) * (has(m, 'heavy-neck') ? 1.5 : 1);
  s.spawn += dt * .28 * (1 + Math.min(s.checkpoint / SEGMENT, 6) * .025) * Math.max(.8, 4.5 + s.speed);
  while (s.spawn >= 1 && s.enemies.length < 110) { s.spawn--; spawnEnemy(s); }
  s.spawn = Math.min(s.spawn, 2);
  s.bite -= dt; s.sweep -= dt; s.organ -= dt;
  const jawReady = s.bite <= 0;
  if (jawReady) s.bite = has(m, 'crusher') ? 1.26 : 1.05;
  if (s.sweep <= 0) s.sweep += sweepPeriod(m);
  const horns = hornShapes(m), motion = hornMotion(s), jaw = jawShape(m);
  operateOrgans(s, dt);
  let touching = 0;
  for (const e of s.enemies) {
    e.flash = Math.max(0, e.flash - dt); e.hpTime = Math.max(0, e.hpTime - dt); e.collisionCooldown -= dt;
    const ahead = e.y - s.distance;
    const contactY = s.distance - skinEdge(e.x, m) / WORLD_SCALE + e.radius / WORLD_SCALE;
    const touchingBody = e.y <= contactY + .8;
    e.vy += (-e.speed - e.vy) * dt * (has(m, 'hook-scale') && touchingBody ? .35 : 1.7);
    e.vx *= Math.exp(-dt * (has(m, 'hook-scale') && touchingBody ? 8 : 2));
    if (jawReady && shapeContact({ x: e.x, y: -ahead * WORLD_SCALE }, e.radius, jaw)) {
      const closing = Math.max(0, s.speed - e.vy);
      const amount = (has(m, 'wide-jaw') ? 29 : 39) + (has(m, 'spring-jaw') ? closing * 2.4 : 0) + (has(m, 'crusher') ? 20 : 0);
      damage(e, amount);
      effect(s, 'bite', e.x, e.y, .38, e, { strength: amount, source: has(m, 'spring-jaw') ? 'spring-jaw' : has(m, 'crusher') ? 'crusher' : undefined }); e.vy += 8 / e.mass;
    }
    const previousVy = e.vy;
    e.x = clamp(e.x + e.vx * dt, -187, 187); e.y += e.vy * dt;
    // Visible horn surfaces redirect momentum only after material contact.
    for (const shape of horns) {
      const hit = shapeContact({ x: e.x - motion.x, y: -(e.y - s.distance) * WORLD_SCALE }, e.radius, shape);
      if (!hit) continue;
      e.x += hit.nx * hit.depth; e.y -= hit.ny * hit.depth / WORLD_SCALE;
      const closing = Math.max(0, -((e.vx - motion.vx) * hit.nx - (e.vy - s.speed) * WORLD_SCALE * hit.ny));
      // A little restitution and a mass-dependent impact; tangential velocity is retained.
      const push = closing * (1 + .16 * heavy / e.mass);
      e.vx += hit.nx * push; e.vy -= hit.ny * push / WORLD_SCALE;
      if (closing > 8 && !s.effects.some(f => f.type === 'sweep' && f.targetId === e.id)) {
        const amount = Math.min(65, (9 + closing * .16) * heavy * (has(m, 'ram-horn') ? 1.4 : 1));
        damage(e, amount);
        effect(s, 'sweep', hit.x + motion.x, s.distance - hit.y / WORLD_SCALE, .32, e, { strength: heavy, source: has(m, 'ram-horn') ? 'ram-horn' : has(m, 'heavy-horn') ? 'heavy-horn' : has(m, 'crown') ? 'crown' : has(m, 'branch') ? 'branch' : has(m, 'curl') ? 'curl' : undefined });
      }
    }
    e.x = clamp(e.x, -187, 187);
    // Recompute after sliding along the horns, since the skin edge is curved.
    const skinY = s.distance - skinEdge(e.x, m) / WORLD_SCALE + e.radius / WORLD_SCALE;
    if (e.y < skinY) {
      const impactSpeed = Math.max(0, s.speed - previousVy);
      e.y = skinY; e.contact += dt; e.vy = Math.max(e.vy, s.speed);
      touching += e.mass; s.health -= e.mass * dt * .8;
      if (has(m, 'thorn')) {
        damage(e, dt * (2 + Math.abs(e.vx) * .19 + impactSpeed * .9) * (has(m, 'razor-scale') ? 1.8 : 1));
        if (!s.effects.some(f => f.type === 'scrape' && f.targetId === e.id)) effect(s, 'scrape', e.x, e.y, .25, e, { source: 'thorn' });
      }
      if (has(m, 'hook-scale')) {
        e.vx *= Math.exp(-dt * 12);
        if (!s.effects.some(f => f.type === 'hook' && f.targetId === e.id)) effect(s, 'hook', e.x, e.y, .45, e, { source: 'hook-scale' });
      }
      if (has(m, 'elastic-scale') && impactSpeed > 4 && e.collisionCooldown <= 0) {
        e.vy = s.speed + impactSpeed * (has(m, 'rebound-scale') ? 1.25 : .8); damage(e, impactSpeed * .8 * (has(m, 'rebound-scale') ? 1.5 : 1)); e.collisionCooldown = .3; effect(s, 'rebound', e.x, e.y, .4, e, { source: 'elastic-scale', dx: e.vx, dy: e.vy });
      }
    } else e.contact = 0;
  }
  const grid = new Map<string, Enemy[]>();
  for (const e of s.enemies) {
    const gx = Math.floor(e.x / 32), gy = Math.floor(e.y * WORLD_SCALE / 32);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      for (const other of grid.get(`${gx + ox}:${gy + oy}`) ?? []) {
        const energy = collide(other, e);
        if (energy > 0) effect(s, 'collision', (e.x + other.x) / 2, (e.y + other.y) / 2, .32, e, { otherId: other.id, strength: energy });
      }
    }
    const key = `${gx}:${gy}`; const cell = grid.get(key) ?? []; cell.push(e); grid.set(key, cell);
  }
  s.enemies = s.enemies.filter(e => {
    if (e.hp > 0) return true;
    s.growth += e.kind === 'boar' ? 3 : 1; s.kills++; effect(s, 'dust', e.x, e.y, .6); return false;
  });
  s.pressure += (touching - s.pressure) * dt * 3;
  const targetSpeed = clamp(3.2 - s.pressure * 1.35 / (has(m, 'anchor-neck') ? 2.4 : has(m, 'heavy-neck') ? 1.6 : 1) - (MAX_HEALTH - s.health) * .007, -3.4, 3.2);
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
