import { ROSTER } from './content.ts';
import type { GameState } from './types.ts';

export function createBattleRenderer(canvas: HTMLCanvasElement): { resize: () => void; draw: (game: GameState) => void } {
  const context: CanvasRenderingContext2D = (() => {
    const value = canvas.getContext('2d');
    if (!value) throw new Error('This browser does not support Canvas 2D.');
    return value;
  })();

  function resize(): void {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    context.setTransform(canvas.width, 0, 0, canvas.height, 0, 0);
  }

  function draw(game: GameState): void {
    const t = game.distance;
    const bg = context.createLinearGradient(0, 0, 0, 1);
    bg.addColorStop(0, '#344251'); bg.addColorStop(.55, '#263641'); bg.addColorStop(1, '#192b35');
    context.fillStyle = bg; context.fillRect(0, 0, 1, 1);
    context.strokeStyle = 'rgba(192,213,207,.07)'; context.lineWidth = .002;
    for (let i = 0; i < 9; i++) {
      const y = ((i / 8 + t / 240) % 1);
      context.beginPath(); context.moveTo(.04, y); context.lineTo(.96, y); context.stroke();
    }
    context.setLineDash([.009, .02]); context.strokeStyle = 'rgba(172,204,193,.13)';
    for (const x of [.12, .5, .88]) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 1); context.stroke(); }
    context.setLineDash([]);
    context.fillStyle = 'rgba(10,24,31,.25)'; context.fillRect(0, .67, 1, .33);
    context.strokeStyle = '#92bcae'; context.lineWidth = .003; context.setLineDash([.03, .015]);
    context.beginPath(); context.moveTo(.04, .68); context.lineTo(.96, .68); context.stroke(); context.setLineDash([]);
    context.save(); context.setTransform(canvas.width / canvas.clientWidth, 0, 0, canvas.height / canvas.clientHeight, 0, 0);
    context.font = '600 10px system-ui'; context.fillStyle = 'rgba(194,219,207,.7)'; context.fillText('FRONT LINE', .05 * canvas.clientWidth, .665 * canvas.clientHeight); context.restore();
    for (const e of game.enemies) {
      context.fillStyle = 'rgba(0,0,0,.22)'; context.beginPath(); context.ellipse(e.x, e.y + .012, e.radius * 1.25, e.radius * .55, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = e.flash > 0 ? '#fff4d5' : e.color; context.strokeStyle = '#12242d'; context.lineWidth = .005;
      context.beginPath(); context.arc(e.x, e.y, e.radius, 0, Math.PI * 2); context.fill(); context.stroke();
      if (e.kind === 'heavy') { context.strokeStyle = '#ddd0e8'; context.lineWidth = .004; context.beginPath(); context.arc(e.x, e.y, e.radius * .63, 0, Math.PI * 2); context.stroke(); }
      context.fillStyle = '#182830'; context.fillRect(e.x - e.radius, e.y - e.radius - .015, e.radius * 2, .005);
      context.fillStyle = '#e6bc83'; context.fillRect(e.x - e.radius, e.y - e.radius - .015, e.radius * 2 * Math.max(0, e.hp / e.maxHp), .005);
    }
    for (const a of game.allies) {
      const person = ROSTER.find(r => r.id === a.id)!;
      context.fillStyle = 'rgba(0,0,0,.25)'; context.beginPath(); context.ellipse(a.x, a.y + .015, .046, .015, 0, 0, 7); context.fill();
      if (a.shield > 0) { context.strokeStyle = '#b4ded4'; context.lineWidth = .006; context.beginPath(); context.arc(a.x, a.y, .048, 0, 7); context.stroke(); }
      context.fillStyle = a.status === 'active' ? person.color : '#58656a'; context.strokeStyle = '#e6e2ce'; context.lineWidth = .004;
      context.beginPath(); context.arc(a.x, a.y, .031, 0, 7); context.fill(); context.stroke();
      if (a.status === 'downed') {
        context.strokeStyle = '#e8947f'; context.lineWidth = .006;
        context.beginPath();
        context.moveTo(a.x - .012, a.y - .012); context.lineTo(a.x + .012, a.y + .012);
        context.moveTo(a.x + .012, a.y - .012); context.lineTo(a.x - .012, a.y + .012);
        context.stroke();
      }
      context.save(); context.setTransform(canvas.width / canvas.clientWidth, 0, 0, canvas.height / canvas.clientHeight, 0, 0);
      context.fillStyle = '#1a2930'; context.textAlign = 'center'; context.font = 'bold 13px system-ui'; context.fillText(person.name[0], a.x * canvas.clientWidth, a.y * canvas.clientHeight + 4);
      context.fillStyle = 'rgba(234,237,222,.9)'; context.font = '10px system-ui'; context.fillText(person.name, a.x * canvas.clientWidth, (a.y + .063) * canvas.clientHeight); context.restore();
    }
    context.textAlign = 'left';
    for (const fx of game.effects) {
      context.globalAlpha = Math.min(1, fx.life / .3);
      context.strokeStyle = fx.color; context.fillStyle = fx.color; context.lineWidth = .006;
      if (fx.kind === 'burst') { context.beginPath(); context.arc(fx.x, fx.y, (.42 - fx.life) * .11, 0, 7); context.stroke(); }
      else { context.beginPath(); context.moveTo(fx.x, fx.y); context.lineTo(fx.toX, fx.toY); context.stroke(); }
    }
    context.globalAlpha = 1;
    // Framing bands keep labels and combat readable over any device width.
    context.fillStyle = 'rgba(17,30,37,.35)'; context.fillRect(0, 0, .025, 1); context.fillRect(.975, 0, .025, 1);
  }

  return { resize, draw };
}
