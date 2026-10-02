import { paint } from './creature-art';
import type { State } from './types';

const outfit = `<defs>
  <linearGradient id="coat" x2=".8" y2="1"><stop stop-color="#f4bc64"/><stop offset=".55" stop-color="#d28a3e"/><stop offset="1" stop-color="#975832"/></linearGradient>
  <linearGradient id="hair" x2=".8" y2="1"><stop stop-color="#6a4935"/><stop offset=".35" stop-color="#493128"/><stop offset="1" stop-color="#2a2224"/></linearGradient>
  <linearGradient id="face" x2="1" y2=".8"><stop stop-color="#f5d9ac"/><stop offset="1" stop-color="#c29174"/></linearGradient>
</defs>`;
const jacket = `${outfit}
  <path d="M-6-4Q0-7 6-4L9 3L7 12Q0 16-7 12L-9 3Z" fill="url(#coat)" stroke="#342e2b" stroke-width=".9"/>
  <path d="M-5 1Q0-2 5 1L5 8Q0 11-5 8Z" fill="#dd9c48"/>
  <path d="M0 0L0 11M-6 5l3 1v3l-3-1M6 5l-3 1v3l3-1" stroke="#966037" fill="none" stroke-width=".7"/>
  <path d="M-7-2L-5 8M5-3L6 8" stroke="#ffe0a0" stroke-width=".7" fill="none"/>
  <path d="M-7 10Q0 12 7 10L7 15L1 15L0 12L-1 15L-7 15Z" fill="#364e54" stroke="#272f34" stroke-width=".7"/>
  <path d="M-5 10L-5-3L-2-4L0 10" fill="#6e4c37" opacity=".9"/>
  <path d="M-8 1Q-11 3-10 10L-7 11L-4 8L-4 2Z" fill="#88734d" stroke="#343431" stroke-width=".7"/>
  <path d="M-9 4l4 1M-8 6v2" stroke="#c4ac6d" fill="none" stroke-width=".7"/>
  <path d="M-2 9h3v2h-3Z" fill="#c9bd90" stroke="#584b37" stroke-width=".5"/>`;
const head = `${outfit}
  <path d="M-7-2Q-12-11-6-18Q0-22 6-17Q11-11 7-3Z" fill="url(#hair)" stroke="#25282a" stroke-width=".8"/>
  <ellipse cx="-6.6" cy="-6" rx="1.5" ry="2.1" fill="#c39473"/>
  <ellipse cx="6.6" cy="-6" rx="1.5" ry="2.1" fill="#c39473"/>
  <path d="M-6-10Q0-14 6-10L5-3Q0 1-5-3Z" fill="url(#face)" stroke="#4d3c31" stroke-width=".6"/>
  <path d="M-7-11Q-7-19 1-18Q7-18 7-9L4-6L3-12Q0-8-4-9L-6-5Z" fill="url(#hair)"/>
  <path d="M-5-15Q-2-18 1-16M-5-13Q-3-13-2-11M4-14l1 4" fill="none" stroke="#a1794f" stroke-opacity=".55" stroke-width=".6"/>
  <path d="M-7-14Q0-18 7-13" fill="none" stroke="#ad8b50" stroke-width="1.3"/>
  <path d="M-4-16h3v2h-3Zm5 0h3v2H1Z" fill="#b2b7a0" stroke="#4f4a38" stroke-width=".7"/>
  <path d="M-4-6l2 .3M2-5.7l2-.3" stroke="#302b28" stroke-width=".8" stroke-linecap="round"/>
  <path d="M-.8-3.5l1.6 .1" stroke="#a85d46" stroke-width=".6" stroke-linecap="round"/>
  <path d="M-5-4l1 .3M4-4l1-.3" stroke="#d28564" stroke-width=".7" opacity=".8"/>`;

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
  // Seated legs swing independently; boots, socks and knees keep their silhouettes.
  for (const side of [-1, 1]) {
    const kick = feet * side * 1.8, x = side * 6;
    limb(c, [[side * 4, 12], [x, 18 + kick]], '#bd926e', 3.5);
    limb(c, [[x, 17 + kick], [x + side, 21 + kick]], '#dfd4af', 3.5);
    limb(c, [[x + side, 21 + kick], [x + side * 3, 24 + kick]], '#4b3c32', 4);
    limb(c, [[x + side * 2, 23 + kick], [x + side * 4, 24 + kick]], '#27333a', 1.6);
  }
  paint(c, 'girl-coat', jacket, -14, -10, 28, 30);
  for (const side of [-1, 1]) {
    const handY = cheer ? -12 + Math.sin(idle * 6) : alarm ? 10 : 7 + sway * side;
    const handX = side * (cheer ? 12 : alarm ? 9 : 13);
    limb(c, [[side * 7, -1], [side * 10, cheer ? -5 : 3]], '#d99c49', 4);
    limb(c, [[side * 10, cheer ? -5 : 3], [handX, handY]], '#efc99a', 2.6);
    c.beginPath(); c.ellipse(handX, handY, 1.9, 2.2, side * .3, 0, Math.PI * 2);
    c.fillStyle = '#eac298'; c.fill(); c.strokeStyle = '#584034'; c.lineWidth = .5; c.stroke();
  }
  // A small ponytail and the scarf react to travel without suggesting controls.
  c.save(); c.translate(-6, -12); c.rotate(sway * .12);
  c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-8, -6, -14, 0, -9, 8); c.bezierCurveTo(-6, 12, -11, 13, -11, 13); c.bezierCurveTo(-1, 12, -7, 3, 0, 0);
  c.fillStyle = '#433028'; c.fill(); c.strokeStyle = '#29282a'; c.lineWidth = .7; c.stroke();
  limb(c, [[-4, 0], [-7, 1]], '#bb753c', 1.3); c.restore();
  c.save(); c.translate(0, -2); c.rotate(Math.sin(idle * 2.5) * .12);
  c.beginPath(); c.moveTo(-5, -1); c.quadraticCurveTo(1, 3, 6, -1); c.bezierCurveTo(11, 0, 13, 6, 20, 5 + sway * 2); c.lineTo(17, 9 + sway * 2); c.quadraticCurveTo(9, 8, 5, 3); c.quadraticCurveTo(-2, 3, -5, -1);
  c.fillStyle = '#e05c39'; c.fill(); c.strokeStyle = '#783d2f'; c.lineWidth = .7; c.stroke();
  limb(c, [[6, 1], [11, 4], [16, 5]], '#f68a4e', .8); c.restore();
  c.save(); c.rotate(Math.sin(idle * .8) * .12 + (alarm ? -.08 : .02));
  paint(c, 'girl-head', head, -14, -25, 28, 28); c.restore();
  c.restore();
}
