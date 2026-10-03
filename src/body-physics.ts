import { has, WORLD_SCALE } from './content';
import type { Effect, MutationId, State } from './types';

/** Local artwork coordinates: x points right, y points back down the body, in pixels. */
export interface Point { x: number; y: number }
export interface Contact { x: number; y: number; nx: number; ny: number; depth: number }
export function skinShape(m: MutationId[]): Point[] {
  const front = Array.from({ length: 24 }, (_, i) => { const x = -230 + i * 20; return { x, y: skinEdge(x, m) }; });
  return [...front, { x: 230, y: 170 }, { x: -230, y: 170 }];
}
export interface HornSection { center: Point; normal: Point; radius: number }
export interface Horn { outline: Point[]; sections: HornSection[] }
const hornCache = new Map<string, Horn[]>();
/** A round root tapers along a curved centerline into a single sharp tip. */
function curvedHorn(root: Point, a: Point, b: Point, tip: Point, width: number): Horn {
  const sections = Array.from({ length: 21 }, (_, i) => {
    const t = i / 20, u = 1 - t;
    const center = { x: u ** 3 * root.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * tip.x,
      y: u ** 3 * root.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * tip.y };
    const dx = 3 * u * u * (a.x - root.x) + 6 * u * t * (b.x - a.x) + 3 * t * t * (tip.x - b.x);
    const dy = 3 * u * u * (a.y - root.y) + 6 * u * t * (b.y - a.y) + 3 * t * t * (tip.y - b.y), length = Math.hypot(dx, dy);
    return { center, normal: { x: -dy / length, y: dx / length }, radius: width * (1 - t) ** .9 };
  });
  const edge = (section: HornSection, side: number) => ({ x: section.center.x + section.normal.x * section.radius * side,
    y: section.center.y + section.normal.y * section.radius * side });
  const first = sections[0], tangent = { x: first.normal.y, y: -first.normal.x };
  const cap = Array.from({ length: 7 }, (_, i) => {
    const angle = (i + 1) / 8 * Math.PI;
    return { x: root.x - first.normal.x * width * Math.cos(angle) - tangent.x * width * Math.sin(angle),
      y: root.y - first.normal.y * width * Math.cos(angle) - tangent.y * width * Math.sin(angle) };
  });
  return { sections, outline: [tip, ...sections.slice(0, -1).reverse().map(p => edge(p, -1)), ...cap,
    ...sections.slice(0, -1).map(p => edge(p, 1))] };
}
/** The visible tapered curves are also the solid collision outlines. */
export function hornGeometry(m: MutationId[]): Horn[] {
  const key = m.filter(id => ['heavy-horn', 'ram-horn', 'curl', 'branch', 'crown'].includes(id)).sort().join();
  const cached = hornCache.get(key); if (cached) return cached;
  const heavy = has(m, 'heavy-horn'), ram = has(m, 'ram-horn'), curl = has(m, 'curl');
  const reach = ram ? 200 : heavy ? 162 : curl ? 139 : 108;
  // The pointed ends reach past the sides; incoming enemies stay between the two horns.
  const outer = ram ? 244 : heavy ? 236 : 228;
  const right = [curvedHorn({ x: 133, y: 76 }, { x: curl ? 24 : 52, y: -5 },
    { x: curl ? 125 : 172, y: -reach * .45 }, { x: outer, y: -reach }, ram ? 36 : heavy ? 30 : 22)];
  if (has(m, 'branch')) {
    right.push(curvedHorn({ x: 151, y: 48 }, { x: 157, y: 7 }, { x: 188, y: -36 }, { x: 199, y: -97 }, 13));
    if (has(m, 'crown')) right.push(curvedHorn({ x: 124, y: 65 }, { x: 100, y: 30 }, { x: 90, y: -36 }, { x: 67, y: -97 }, 14));
  }
  const horns = [-1, 1].flatMap(side => right.map(h => ({
    outline: h.outline.map(p => ({ x: p.x * side, y: p.y })),
    sections: h.sections.map(p => ({ center: { x: p.center.x * side, y: p.center.y },
      normal: { x: p.normal.x * side, y: p.normal.y }, radius: p.radius }))
  })));
  hornCache.set(key, horns); return horns;
}
export function hornShapes(m: MutationId[]): Point[][] { return hornGeometry(m).map(h => h.outline); }
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
/** First contact along the entire movement, including the radius around corners. */
function sweptContact(from: Point, delta: Point, radius: number, shape: Point[]): (Contact & { t: number }) | null {
  let first: (Contact & { t: number }) | null = null;
  const area = shape.reduce((sum, a, i) => { const b = shape[(i + 1) % shape.length]; return sum + a.x * b.y - b.x * a.y; }, 0);
  const accept = (t: number, x: number, y: number, nx: number, ny: number) => {
    if (t >= 0 && t <= 1 && (!first || t < first.t) && delta.x * nx + delta.y * ny < -1e-8)
      first = { t, x, y, nx, ny, depth: 0 };
  };
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i], b = shape[(i + 1) % shape.length], ex = b.x - a.x, ey = b.y - a.y;
    const length = Math.hypot(ex, ey), nx = ey / length * Math.sign(area), ny = -ex / length * Math.sign(area);
    const distance = (from.x - a.x) * nx + (from.y - a.y) * ny, speed = delta.x * nx + delta.y * ny;
    if (speed < -1e-8 && distance >= radius - 1e-8) {
      const t = (radius - distance) / speed, x = from.x + delta.x * t - nx * radius, y = from.y + delta.y * t - ny * radius;
      const along = ((x - a.x) * ex + (y - a.y) * ey) / (length * length);
      if (along >= 0 && along <= 1) accept(t, x, y, nx, ny);
    }
    const dx = from.x - a.x, dy = from.y - a.y, aa = delta.x * delta.x + delta.y * delta.y;
    const bb = 2 * (dx * delta.x + dy * delta.y), cc = dx * dx + dy * dy - radius * radius, discriminant = bb * bb - 4 * aa * cc;
    if (aa > 1e-8 && cc >= -1e-8 && discriminant >= 0) {
      const t = (-bb - Math.sqrt(discriminant)) / (2 * aa);
      accept(t, a.x, a.y, (dx + delta.x * t) / radius, (dy + delta.y * t) / radius);
    }
  }
  return first;
}
/** Slide a solid circle along surfaces, without letting a fast step cross to the far side. */
export function moveCircle(from: Point, to: Point, radius: number, shapes: Point[][]): { point: Point; contacts: Contact[] } {
  let point = { ...from }, delta = { x: to.x - from.x, y: to.y - from.y };
  const contacts: Contact[] = [];
  // Repair initial overlap (including old saves and newly enlarged horns) before tracing movement.
  for (let pass = 0; pass < 4; pass++) for (const shape of shapes) {
    const hit = shapeContact(point, radius, shape);
    if (hit) { point.x += hit.nx * (hit.depth + .001); point.y += hit.ny * (hit.depth + .001); contacts.push(hit); }
  }
  for (let pass = 0; pass < 8; pass++) {
    let first: (Contact & { t: number }) | null = null;
    for (const shape of shapes) {
      const hit = sweptContact(point, delta, radius, shape);
      if (hit && (!first || hit.t < first.t)) first = hit;
    }
    if (!first) { point.x += delta.x; point.y += delta.y; break; }
    point.x += delta.x * first.t + first.nx * .001; point.y += delta.y * first.t + first.ny * .001;
    delta = { x: delta.x * (1 - first.t), y: delta.y * (1 - first.t) };
    const inward = Math.min(0, delta.x * first.nx + delta.y * first.ny);
    delta.x -= first.nx * inward; delta.y -= first.ny * inward;
    contacts.push(first);
  }
  return { point, contacts };
}
export function organOrigin(f: Effect): Point {
  return f.source === 'tongue' ? { x: 0, y: 12 } : { x: Math.sign(f.x) * (f.strength === 2 ? 105 : 88), y: 125 };
}
/** A material tip extends to its aimed position, then retracts; no remote force during extension. */
export function organRestTip(f: Effect, s: State): Point {
  const origin = organOrigin(f), age = f.maxLife - f.life;
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
