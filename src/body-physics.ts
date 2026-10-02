import { has, WORLD_SCALE } from './content';
import type { Effect, MutationId, State } from './types';

/** Local artwork coordinates: x points right, y points back down the body, in pixels. */
export interface Point { x: number; y: number }
export interface Contact { x: number; y: number; nx: number; ny: number; depth: number }
export function sweepPeriod(m: MutationId[]): number {
  return (has(m, 'fast') ? .62 : 1.15) * (has(m, 'heavy-horn') ? 1.28 : 1) *
    (has(m, 'heavy-neck') ? 1.2 : 1) * (has(m, 'ram-horn') ? 1.1 : 1) * (has(m, 'rapid-neck') ? .72 : 1);
}
export const NECK_PIVOT: Point = { x: 0, y: 140 };
/** Both horns, the eyes, jaw and front scales are rigid parts of one head. */
export function headMotion(s: State): { angle: number; omega: number } {
  const period = sweepPeriod(s.mutations);
  if (s.sweep > period) return { angle: 0, omega: 0 };
  const phase = Math.max(0, 1 - s.sweep / period) * Math.PI * 2;
  const amplitude = has(s.mutations, 'heavy-neck') ? .045 : .075;
  return { angle: Math.sin(phase) * amplitude, omega: Math.cos(phase) * amplitude * Math.PI * 2 / period };
}
export function headPoint(s: State, p: Point): Point {
  const { angle } = headMotion(s), cos = Math.cos(angle), sin = Math.sin(angle), y = p.y - NECK_PIVOT.y;
  return { x: p.x * cos - y * sin, y: NECK_PIVOT.y + p.x * sin + y * cos };
}
/** Pixel velocity of a point fixed to the rotating head, relative to forward travel. */
export function headVelocity(s: State, p: Point): Point {
  const { omega } = headMotion(s);
  return { x: -(p.y - NECK_PIVOT.y) * omega, y: p.x * omega };
}
export function skinShape(m: MutationId[]): Point[] {
  const front = Array.from({ length: 24 }, (_, i) => { const x = -230 + i * 20; return { x, y: skinEdge(x, m) }; });
  return [...front, { x: 230, y: 170 }, { x: -230, y: 170 }];
}
/** The exposed diagonal faces funnel incoming bodies toward the mouth. Same polygons in art and collision. */
export function hornShapes(m: MutationId[]): Point[][] {
  const heavy = has(m, 'heavy-horn'), ram = has(m, 'ram-horn'), curl = has(m, 'curl');
  const reach = ram ? 167 : heavy ? 135 : curl ? 116 : 90;
  const outer = ram ? 188 : heavy ? 183 : 178;
  const inner = heavy || curl ? 45 : 90;
  const right: Point[][] = [[{ x: outer, y: -reach }, { x: inner, y: -13 },
    { x: 104, y: 58 }, { x: 116, y: 78 }, { x: 139, y: 84 }, { x: 161, y: 67 },
    { x: heavy ? 141 : 126, y: 12 }, { x: outer - 14, y: -reach * .55 }]];
  if (curl) right.push([{ x: inner, y: -13 }, { x: 38, y: 24 }, { x: 66, y: 12 }, { x: 83, y: -3 }]);
  if (has(m, 'branch')) {
    right.push([{ x: 139, y: 22 }, { x: 190, y: -72 }, { x: 183, y: 26 }, { x: 151, y: 53 }]);
    if (has(m, 'crown')) right.push([{ x: 116, y: 40 }, { x: 67, y: -77 }, { x: 75, y: 35 }, { x: 135, y: 70 }]);
  }
  return [-1, 1].flatMap(side => right.map(shape => shape.map(p => ({ x: p.x * side, y: p.y }))));
}
export function jawWidth(m: MutationId[]): number { return has(m, 'wide-jaw') ? 135 : 65; }
export function jawShape(m: MutationId[]): Point[] {
  const w = jawWidth(m);
  return [{ x: -w, y: 8 }, { x: -w, y: -38 }, { x: -w * .55, y: -48 },
    { x: w * .55, y: -48 }, { x: w, y: -38 }, { x: w, y: 8 }];
}
/** Circle against a closed physical outline; returns the outward surface normal and penetration. */
export function shapeContact(p: Point, radius: number, shape: Point[]): Contact | null {
  let inside = false, best = Infinity, hit = { x: 0, y: 0 }, edge = { x: 0, y: 0 }, area = 0;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const a = shape[j], b = shape[i], dx = b.x - a.x, dy = b.y - a.y;
    area += a.x * b.y - b.x * a.y;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < dx * (p.y - a.y) / dy + a.x) inside = !inside;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    const x = a.x + t * dx, y = a.y + t * dy, d = Math.hypot(p.x - x, p.y - y);
    if (d < best) { best = d; hit = { x, y }; edge = { x: dx, y: dy }; }
  }
  if (!inside && best >= radius) return null;
  let nx = p.x - hit.x, ny = p.y - hit.y;
  if (best > 1e-6) { nx /= best; ny /= best; if (inside) { nx = -nx; ny = -ny; } }
  else { const length = Math.hypot(edge.x, edge.y); nx = edge.y / length * Math.sign(area); ny = -edge.x / length * Math.sign(area); }
  return { ...hit, nx, ny, depth: inside ? radius + best : radius - best };
}
export function organOrigin(f: Effect, s: State): Point {
  return f.source === 'tongue' ? headPoint(s, { x: 0, y: 12 }) : { x: Math.sign(f.x) * (f.strength === 2 ? 105 : 88), y: 125 };
}
/** A material tip extends to its aimed position, then retracts; no remote force during extension. */
export function organRestTip(f: Effect, s: State): Point {
  const origin = organOrigin(f, s), age = f.maxLife - f.life;
  const reach = age < .3 ? age / .3 : age < .48 ? 1 : Math.max(0, (f.maxLife - age) / (f.maxLife - .48));
  return { x: origin.x + ((f.targetX ?? 0) - origin.x) * reach,
    y: origin.y + (-( (f.targetY ?? s.distance) - s.distance) * WORLD_SCALE - origin.y) * reach };
}

export function skinEdge(x: number, m: MutationId[]): number {
  return 36 * Math.pow(Math.abs(x) / 195, 1.8) - (has(m, 'thorn') ? (has(m, 'razor-scale') ? 14 : 8) : has(m, 'elastic-scale') ? (has(m, 'rebound-scale') ? 9 : 5) : has(m, 'hook-scale') ? 4 : 0);
}

/** A hooked tip stays on its captured body while the organ contracts against its inertia. */
export function organTip(f: Effect, s: State): Point {
  const target = f.attached && s.enemies.find(e => e.id === f.targetId && e.hp > 0);
  return target ? { x: target.x, y: -(target.y - s.distance) * WORLD_SCALE } : organRestTip(f, s);
}
