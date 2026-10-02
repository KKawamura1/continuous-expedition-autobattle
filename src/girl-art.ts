import { paint } from './creature-art';
import type { State } from './types';

const outfit = `<defs>
  <linearGradient id="coat" x2=".8" y2="1"><stop stop-color="#f4bc64"/><stop offset=".55" stop-color="#d28a3e"/><stop offset="1" stop-color="#975832"/></linearGradient>
  <linearGradient id="hair" x2=".8" y2="1"><stop stop-color="#6a4935"/><stop offset=".35" stop-color="#493128"/><stop offset="1" stop-color="#2a2224"/></linearGradient>
  <linearGradient id="pack" x2=".8" y2="1"><stop stop-color="#b1a078"/><stop offset=".5" stop-color="#887a58"/><stop offset="1" stop-color="#5d5946"/></linearGradient>
</defs>`;
const jacket = `${outfit}
  <path d="M-6-4Q0-7 6-4L9 3L7 12Q0 16-7 12L-9 3Z" fill="url(#coat)" stroke="#342e2b" stroke-width=".9"/>
  <path d="M-6 1Q0-3 6 1M-6 10Q0 12 6 10" stroke="#966037" fill="none" stroke-width=".7"/>
  <path d="M-7-2L-5 8M5-3L6 8" stroke="#ffe0a0" stroke-width=".7" fill="none"/>
  <path d="M-7 10Q0 12 7 10L7 15L1 15L0 12L-1 15L-7 15Z" fill="#364e54" stroke="#272f34" stroke-width=".7"/>
  <path d="M-6 8L-6-2L-3-3M6 8L6-2L3-3" fill="none" stroke="#6e4c37" stroke-width="1.7"/>
  <path d="M-5 1Q0-1 5 1L6 8Q5 12 0 12Q-5 12-6 8Z" fill="url(#pack)" stroke="#343431" stroke-width=".8"/>
  <path d="M-5 1Q0-2 5 1L4 5Q0 7-4 5Z" fill="#b4a17a" stroke="#6e654a" stroke-width=".6"/>
  <path d="M-.8 3h1.6v5H-.8Z" fill="#6e4c37"/>
  <path d="M-1 5h2v1.5h-2Z" fill="#c9bd90" stroke="#584b37" stroke-width=".4"/>
  <path d="M-3 9Q0 10 3 9" stroke="#c4ac6d" fill="none" stroke-width=".6"/>`;
const head = `${outfit}
  <path d="M-2-3h4v3h-4Z" fill="#c39473"/>
  <ellipse cx="-6.6" cy="-6" rx="1.5" ry="2.1" fill="#c39473"/>
  <ellipse cx="6.6" cy="-6" rx="1.5" ry="2.1" fill="#c39473"/>
  <path d="M-6-3Q-10-7-7-15Q-5-20 1-19Q8-19 8-11Q9-5 5-2Q0 1-6-3Z" fill="url(#hair)" stroke="#25282a" stroke-width=".8"/>
  <path d="M-5-14Q-3-18 1-16M-6-10Q-5-14-2-15M4-15Q7-9 3-4M-4-8Q-3-4 0-3" fill="none" stroke="#a1794f" stroke-opacity=".55" stroke-width=".6"/>
  <path d="M-7-10Q0-5 7-10" fill="none" stroke="#ad8b50" stroke-width="1.1"/>
  <path d="M-1-4Q2-5 3-3L2 0L-1 0Z" fill="#392a25"/>`;

function limb(c: CanvasRenderingContext2D, points: number[][], colour: string, width: number): void {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = '#24323a'; c.lineWidth = width + 1.5; c.stroke();
  c.strokeStyle = colour; c.lineWidth = width; c.stroke();
}

export function drawGirl(c: CanvasRenderingContext2D, s: State, y: number, idle: number): void {
  const alarm = s.pressure > 4, cheer = s.reactionTime > 0 && !alarm;
  const feet = Math.sin(idle * 3.6), sway = Math.sin(idle * 1.7);
  c.save(); c.translate(5, y); c.rotate(alarm ? Math.sin(idle * 7) * .07 : sway * .025);
  c.fillStyle = '#0f2836aa'; c.beginPath(); c.ellipse(3, 12, 16, 9, .1, 0, Math.PI * 2); c.fill();
  // Facing north: knees and boots extend ahead of the hips, beside the torso.
  for (const side of [-1, 1]) {
    const kick = feet * side * 1.3, x = side * 9;
    limb(c, [[side * 4, 13], [x, 12], [x + side, 7 + kick]], '#bd926e', 3.5);
    limb(c, [[x + side, 8 + kick], [x + side * 2, 4 + kick]], '#dfd4af', 3.5);
    limb(c, [[x + side * 2, 4 + kick], [x + side * 2, 1 + kick]], '#4b3c32', 4);
    limb(c, [[x + side, 1 + kick], [x + side * 3, 1 + kick]], '#27333a', 1.6);
  }
  paint(c, 'girl-coat', jacket, -14, -10, 28, 30);
  for (const side of [-1, 1]) {
    const handY = cheer ? -15 + Math.sin(idle * 6) : alarm ? 7 : 4 + sway * side;
    const handX = side * (cheer ? 12 : alarm ? 9 : 13);
    limb(c, [[side * 7, -1], [side * 10, cheer ? -5 : 3]], '#d99c49', 4);
    limb(c, [[side * 10, cheer ? -5 : 3], [handX, handY]], '#efc99a', 2.6);
    c.beginPath(); c.ellipse(handX, handY, 1.9, 2.2, side * .3, 0, Math.PI * 2);
    c.fillStyle = '#eac298'; c.fill(); c.strokeStyle = '#584034'; c.lineWidth = .5; c.stroke();
  }
  // A small ponytail and the scarf react to travel without suggesting controls.
  c.save(); c.translate(1, -3); c.rotate(sway * .12);
  c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(6, 0, 3, 6, 6, 8); c.quadraticCurveTo(2, 11, -1, 6); c.quadraticCurveTo(-4, 3, 0, 0);
  c.fillStyle = '#433028'; c.fill(); c.strokeStyle = '#29282a'; c.lineWidth = .7; c.stroke();
  limb(c, [[-1, 1], [2, 1]], '#bb753c', 1.3); c.restore();
  c.save(); c.translate(0, -2); c.rotate(Math.sin(idle * 2.5) * .12);
  c.beginPath(); c.moveTo(-5, -1); c.quadraticCurveTo(1, 3, 6, -1); c.bezierCurveTo(11, 0, 13, 6, 20, 5 + sway * 2); c.lineTo(17, 9 + sway * 2); c.quadraticCurveTo(9, 8, 5, 3); c.quadraticCurveTo(-2, 3, -5, -1);
  c.fillStyle = '#e05c39'; c.fill(); c.strokeStyle = '#783d2f'; c.lineWidth = .7; c.stroke();
  limb(c, [[6, 1], [11, 4], [16, 5]], '#f68a4e', .8); c.restore();
  c.save(); c.rotate(Math.sin(idle * .8) * .12 + (alarm ? -.08 : .02));
  paint(c, 'girl-head', head, -14, -25, 28, 28); c.restore();
  c.restore();
}
