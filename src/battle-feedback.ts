import { WORLD_SCALE } from './content';
import { organOrigin, organTip } from './body-physics';
import type { Effect, Enemy, State } from './types';

export function enemyHealth(c: CanvasRenderingContext2D, e: Enemy, x: number, y: number): void {
  if (e.hpTime <= 0 && e.hp >= e.maxHp && e.kind !== 'boar') return;
  const width = Math.max(20, e.radius * 2.4), ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
  c.save(); c.globalAlpha *= e.hpTime > 0 ? 1 : .5;
  c.fillStyle = '#17313be6'; c.beginPath(); c.roundRect(x - width / 2 - 1, y - e.radius - 12, width + 2, 5, 2); c.fill();
  c.fillStyle = ratio < .3 ? '#ef9972' : '#f2d392'; c.fillRect(x - width / 2, y - e.radius - 11, width * ratio, 3);
  c.restore();
}
export function battleEffects(c: CanvasRenderingContext2D, s: State, head: number, reducedMotion: boolean): void {
  // Capturing organs are opaque, shaded anatomy. Their tips use the collision coordinates.
  for (const side of [-1, 1]) if (s.mutations.includes('tentacle')) {
    const active = s.effects.some(f => f.type === 'pull' && f.source === 'tentacle' && Math.sign(f.x) === side);
    if (!active) organ(c, { x: side * 88, y: 125 }, { x: side * 154, y: s.mutations.includes('long-tentacle') ? -95 : -25 }, head, false, false);
    if (s.mutations.includes('double-tentacle') && !s.effects.some(f => f.type === 'pull' && f.source === 'long-tentacle' && Math.sign(f.x) === side)) {
      organ(c, { x: side * 105, y: 125 }, { x: side * 171, y: -18 }, head, false, true);
    }
  }
  for (const f of s.effects) {
    if (f.type === 'pull') {
      organ(c, organOrigin(f), organTip(f, s), head, f.source === 'tongue', s.mutations.includes('barbed-tongue') && f.source === 'tongue');
      continue;
    }
    // A little sand at material impacts. No target rings, direction arrows or skill-colored trails.
    if (f.type === 'hook') continue;
    const p = 1 - f.life / f.maxLife, x = 195 + f.x, y = head - (f.y - s.distance) * WORLD_SCALE;
    c.save(); c.globalAlpha *= (1 - p) * (f.type === 'dust' ? .55 : .8);
    for (let i = 0; i < (reducedMotion ? 3 : 5); i++) {
      const a = i * 2.4, travel = reducedMotion ? 4 : p * (f.type === 'dust' ? 20 : 13);
      c.fillStyle = i % 2 ? '#dac293' : '#8e8066'; c.beginPath();
      c.ellipse(x + Math.cos(a) * travel, y + Math.sin(a) * travel * .65, 2 + p * 2, 1.4 + p, a, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
}
function organ(c: CanvasRenderingContext2D, origin: { x: number; y: number }, tip: { x: number; y: number }, head: number, tongue: boolean, barbed: boolean): void {
  const ox = 195 + origin.x, oy = head + origin.y, tx = 195 + tip.x, ty = head + tip.y;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(ox, oy); c.quadraticCurveTo(ox + (tx - ox) * .65 + (tongue ? 0 : Math.sign(origin.x) * 24), (oy + ty) / 2, tx, ty);
  c.strokeStyle = '#16333e'; c.lineWidth = tongue ? 9 : 13; c.stroke();
  c.strokeStyle = tongue ? '#b16f62' : '#688b80'; c.lineWidth = tongue ? 6 : 9; c.stroke();
  c.strokeStyle = tongue ? '#dbad95' : '#a5b39a'; c.lineWidth = 2; c.stroke();
  const angle = Math.atan2(ty - oy, tx - ox);
  c.translate(tx, ty); c.rotate(angle);
  c.beginPath(); c.moveTo(-5, 0); c.quadraticCurveTo(10, -10, 11, 3); c.quadraticCurveTo(11, 12, 3, 8);
  c.strokeStyle = '#233c41'; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#dfd8b6'; c.lineWidth = 3.5; c.stroke();
  if (barbed) { c.beginPath(); c.moveTo(-9, -4); c.lineTo(-3, -9); c.lineTo(-2, -2); c.strokeStyle = '#dfd8b6'; c.lineWidth = 2; c.stroke(); }
  c.restore();
}
export function newest(s: State, type: Effect['type']): Effect | undefined {
  return s.effects.filter(e => e.type === type).sort((a, b) => b.life / b.maxLife - a.life / a.maxLife)[0];
}
