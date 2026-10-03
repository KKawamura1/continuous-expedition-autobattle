import { hornShapes, jawShape } from './body-physics';
import type { MutationId } from './types';

// Original vector artwork, rasterized once at 2×. The moving parts remain separate
// so attacks, breathing and mutations never require repainting hundreds of scales.
interface Sprite { image: HTMLImageElement; surface?: HTMLCanvasElement; x: number; y: number; width: number; height: number }
const sprites = new Map<string, Sprite>();
const defs = `<defs>
  <linearGradient id="skin" x1="0" y1="0" x2="1" y2=".7"><stop stop-color="#527b7d"/><stop offset=".35" stop-color="#345b65"/><stop offset=".68" stop-color="#264650"/><stop offset="1" stop-color="#142e3b"/></linearGradient>
  <linearGradient id="plate" x1=".15" y1="0" x2=".8" y2="1"><stop stop-color="#78a09a"/><stop offset=".2" stop-color="#557f7e"/><stop offset=".6" stop-color="#355c65"/><stop offset="1" stop-color="#203e4c"/></linearGradient>
  <linearGradient id="brow" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#88aaa0"/><stop offset=".3" stop-color="#567f7b"/><stop offset=".7" stop-color="#365e67"/><stop offset="1" stop-color="#193a47"/></linearGradient>
  <linearGradient id="bone" x1="0" y1="0" x2="1" y2=".4"><stop stop-color="#fbefd0"/><stop offset=".24" stop-color="#e7d7af"/><stop offset=".65" stop-color="#baa880"/><stop offset="1" stop-color="#7d7964"/></linearGradient>
  <linearGradient id="spine" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#777f70"/><stop offset=".42" stop-color="#d3cbaa"/><stop offset=".52" stop-color="#f3e6c2"/><stop offset=".62" stop-color="#b8b294"/><stop offset="1" stop-color="#596c65"/></linearGradient>
  <radialGradient id="light" cx=".34" cy=".18" r=".8"><stop stop-color="#b0c4a3" stop-opacity=".16"/><stop offset="1" stop-color="#102531" stop-opacity=".48"/></radialGradient>
  <pattern id="scales" width="32" height="26" patternUnits="userSpaceOnUse">
    <path d="M-16 0Q0 26 16 0M16 0Q32 26 48 0M0 13Q16 39 32 13" fill="none" stroke="#122e3b" stroke-opacity=".32" stroke-width="1.3"/>
    <path d="M-13 1Q0 19 13 1M19 1Q32 19 45 1M3 14Q16 32 29 14" fill="none" stroke="#9fb6a0" stroke-opacity=".13"/>
  </pattern>
</defs>`;

export function paint(c: CanvasRenderingContext2D, key: string, markup: string | (() => string), x: number, y: number, width: number, height: number): void {
  let sprite = sprites.get(key);
  if (!sprite) {
    const image = new Image();
    sprite = { image, x, y, width, height };
    const target = sprite;
    image.onload = () => {
      const surface = document.createElement('canvas');
      surface.width = width * 2; surface.height = height * 2;
      surface.getContext('2d')!.drawImage(image, 0, 0, surface.width, surface.height);
      target.surface = surface;
    };
    const art = typeof markup === 'function' ? markup() : markup;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="${height * 2}" viewBox="${x} ${y} ${width} ${height}">${defs}${art}</svg>`)}`;
    sprites.set(key, sprite);
    // Mutations produce new horn configurations; bound decoded artwork memory.
    if (sprites.size > 18) sprites.delete(sprites.keys().next().value!);
  }
  if (sprite.surface) c.drawImage(sprite.surface, sprite.x, sprite.y, sprite.width, sprite.height);
}

const bodyOutline = 'M-264 960L-264 163C-267 105-233 54-174 44C-119 32-73 30 0 35C73 30 119 32 174 44C233 54 267 105 264 163L264 960Z';
const body = (() => {
  let art = `<path d="${bodyOutline}" fill="#102833" stroke="#102833" stroke-width="12" transform="translate(3 9)"/>
    <path d="${bodyOutline}" fill="url(#skin)" stroke="#132d37" stroke-width="3"/>
    <path d="${bodyOutline}" fill="url(#scales)"/>`;
  for (const side of [-1, 1]) {
    art += `<g transform="scale(${side} 1)">`;
    for (let row = 0; row < 12; row++) {
      const y = 108 + row * 68, x = 103 + Math.sin(row * 1.7) * 6;
      art += `<path d="M${x} ${y}Q${x + 48} ${y - 35} 237 ${y - 8}L251 ${y + 22}Q197 ${y + 54} ${x + 12} ${y + 54}Q${x + 28} ${y + 25} ${x} ${y}Z" fill="#0f2935" opacity=".65" transform="translate(0 6)"/>
        <path d="M${x} ${y}Q${x + 48} ${y - 35} 237 ${y - 8}L251 ${y + 22}Q197 ${y + 54} ${x + 12} ${y + 54}Q${x + 28} ${y + 25} ${x} ${y}Z" fill="url(#plate)" stroke="#203e49" stroke-width="2"/>
        <path d="M${x + 8} ${y + 1}Q${x + 62} ${y - 27} 232 ${y - 5}" fill="none" stroke="#9db5a0" stroke-opacity=".45" stroke-width="2"/>
        <path d="M${x + 44} ${y - 9}Q${x + 75} ${y + 8} ${x + 73} ${y + 29}M${x + 84} ${y - 13}Q${x + 109} ${y + 5} ${x + 108} ${y + 22}" fill="none" stroke="#163742" stroke-opacity=".45" stroke-width="1.4"/>
        <path d="M${x + 32} ${y + 5}l12 4m20-9 15 5" stroke="#bbcab2" stroke-opacity=".16" fill="none"/>`;
    }
    art += '</g>';
  }
  // Raised vertebral plates and deep seams establish the direction of the body.
  for (let row = 0; row < 12; row++) {
    const y = 139 + row * 68, w = 51 + Math.min(row * 2, 18);
    art += `<path d="M0 ${y - 23}C${-w} ${y - 11} ${-w - 9} ${y + 24} -24 ${y + 54}Q0 ${y + 68} 24 ${y + 54}C${w + 9} ${y + 24} ${w} ${y - 11} 0 ${y - 23}Z" fill="#142f3b" transform="translate(3 6)"/>
      <path d="M0 ${y - 23}C${-w} ${y - 11} ${-w - 9} ${y + 24} -24 ${y + 54}Q0 ${y + 68} 24 ${y + 54}C${w + 9} ${y + 24} ${w} ${y - 11} 0 ${y - 23}Z" fill="url(#plate)" stroke="#193a46" stroke-width="2"/>
      <path d="M-37 ${y + 5}Q-23 ${y - 13} 0 ${y - 18}Q24 ${y - 12} 37 ${y + 5}" fill="none" stroke="#98b1a0" stroke-opacity=".6" stroke-width="1.5"/>
      <path d="M0 ${y - 18}C-13 ${y + 1}-16 ${y + 25} 0 ${y + 47}C16 ${y + 25} 13 ${y + 1} 0 ${y - 18}Z" fill="url(#spine)" stroke="#334e50" stroke-width="1.5"/>
      <path d="M0 ${y - 10}L0 ${y + 38}" stroke="#f0e7cc" stroke-opacity=".45"/>
      <path d="M-35 ${y + 26}l11 5m51-10 8-4" stroke="#a5b7a0" stroke-opacity=".25" fill="none"/>`;
  }
  return art + `<path d="${bodyOutline}" fill="url(#light)"/>`;
})();

const face = (() => {
  let art = `<path d="M0-26C-63-32-85-3-135 6C-165 11-209 29-239 62L-223 124C-185 142-148 159-94 147C-61 141-39 113 0 117C39 113 61 141 94 147C148 159 185 142 223 124L239 62C209 29 165 11 135 6C85-3 63-32 0-26Z" fill="#112d39" stroke="#112d39" stroke-width="10" transform="translate(2 9)"/>
    <path d="M0-26C-63-32-85-3-135 6C-165 11-209 29-239 62L-223 124C-185 142-148 159-94 147C-61 141-39 113 0 117C39 113 61 141 94 147C148 159 185 142 223 124L239 62C209 29 165 11 135 6C85-3 63-32 0-26Z" fill="url(#skin)" stroke="#183945" stroke-width="3"/>`;
  for (const side of [-1, 1]) {
    art += `<g transform="scale(${side} 1)">
      <path d="M79 3Q126-3 185 21L232 56Q206 77 176 84L123 72Z" fill="url(#brow)" stroke="#1b3a43" stroke-width="2"/>
      <path d="M92 7Q146 3 182 27L210 46" fill="none" stroke="#b5c7ae" stroke-opacity=".5" stroke-width="2"/>
      <path d="M182 30l-16 13 5 15m31-11-13 8" fill="none" stroke="#25474c" stroke-width="1.5" opacity=".65"/>
      <path d="M140 69Q166 55 194 60Q183 79 153 83Z" fill="#0d2730"/>
      <path d="M151 71Q170 62 182 64Q171 75 153 76Z" fill="#d5a354"/>
      <path d="M168 64l-2 10" stroke="#1d302d" stroke-width="3"/>
      <path d="M151 71l9-3" stroke="#ffe2a3" stroke-width="2"/>
      <path d="M142 65Q166 51 196 57" fill="none" stroke="#9eb59f" stroke-width="3"/>
      <path d="M198 74Q229 72 244 88L240 119Q218 123 193 111L166 90Z" fill="url(#plate)" stroke="#193c47" stroke-width="2"/>
      <path d="M180 98Q160 98 138 80L90 42L63 64Q103 94 104 118L124 135Q164 128 192 111" fill="url(#plate)" stroke="#1b3b46" stroke-width="2"/>
      <path d="M96 61Q128 113 169 114M205 79l30 13" fill="none" stroke="#90afa0" stroke-opacity=".35" stroke-width="2"/>
      <path d="M216 97l-9 9m-60-2-15 8m-17-20-7 4" stroke="#122f3c" fill="none" stroke-width="1.5"/>
      <path d="M120 127Q93 145 66 124L41 83Q33 60 0 55L0 86Q54 98 43 145L69 158Q104 151 124 139Z" fill="#183b47"/>
      <path d="M127 133Q110 139 104 137" stroke="#6c9089" fill="none"/>
    </g>`;
  }
  art += `<path d="M0-19Q-41-15-66 19L-82 52Q-63 64-46 74Q-34 96 0 109Q34 96 46 74Q63 64 82 52L66 19Q41-15 0-19Z" fill="url(#brow)" stroke="#25434a" stroke-width="2"/>
    <path d="M0-13Q-18 10-29 33L-42 65Q-26 78 0 96Q26 78 42 65L29 33Q18 10 0-13Z" fill="url(#plate)" stroke="#345852" stroke-width="1.5"/>
    <path d="M0-9L0 88M-7-4Q-26 22-31 40" fill="none" stroke="#a6bb9e" stroke-opacity=".45" stroke-width="2"/>
    <path d="M-55 34l8 6-7 9m89 11 8-7" fill="none" stroke="#203f46" stroke-width="1.5"/>
    <path d="M0 76Q-17 100-16 127L0 140L16 127Q17 100 0 76Z" fill="url(#spine)" stroke="#27484b" stroke-width="1.5"/>`;
  return art;
})();

function hornArt(mutations: MutationId[]): string {
  return hornShapes(mutations).map(shape => {
    const path = `M${shape.map(p => `${p.x} ${p.y}`).join('L')}Z`;
    const [tip, inner] = shape, root = shape[3] ?? shape[2];
    const ribs = [ .2, .4, .6, .8 ].map(t => {
      const x = tip.x + (inner.x - tip.x) * t, y = tip.y + (inner.y - tip.y) * t;
      return `<path d="M${x} ${y}q${Math.sign(x) * 10} 8 ${Math.sign(x) * 16} 17" stroke="#827d63" stroke-width="1.4" fill="none" opacity=".55"/>`;
    }).join('');
    return `<ellipse cx="${Math.sign(tip.x) * 133}" cy="76" rx="30" ry="17" fill="url(#plate)" stroke="#203b43" stroke-width="2"/><path d="${path}" transform="translate(3 5)" fill="#102e3a" opacity=".6"/>
      <path d="${path}" fill="url(#bone)" stroke="#30454a" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M${tip.x} ${tip.y}L${inner.x} ${inner.y}L${root.x} ${root.y}" fill="none" stroke="#fff2d2" stroke-width="2.5" stroke-linejoin="round" opacity=".65"/>${ribs}`;
  }).join('');
}

export function drawBody(c: CanvasRenderingContext2D): void {
  paint(c, 'body', body, -280, 20, 560, 940);
}

export function drawHead(c: CanvasRenderingContext2D): void {
  paint(c, 'face', face, -255, -40, 510, 210);
}

export function drawHorns(c: CanvasRenderingContext2D, mutations: MutationId[]): void {
  const key = mutations.filter(m => ['curl', 'heavy-horn', 'branch', 'ram-horn', 'crown'].includes(m)).sort().join();
  paint(c, `horn-${key}`, () => hornArt(mutations), -260, -220, 520, 325);
}

export function drawJaw(c: CanvasRenderingContext2D, mutations: MutationId[], opening: number): void {
  const shape = jawShape(mutations), w = shape[1].x * -1, crusher = mutations.includes('crusher');
  c.save(); c.translate(0, -opening);
  const path = `M${shape.map(p => `${p.x} ${p.y}`).join('L')}Z`;
  let markup = `<path d="${path}" transform="translate(0 6)" fill="#102a32"/>
    <path d="${path}" fill="url(#brow)" stroke="#233e45" stroke-width="${crusher ? 4 : 2}" stroke-linejoin="round"/>
    <path d="M${-w + 8}-33Q0-56 ${w - 8}-33" fill="none" stroke="#b2c6aa" opacity=".6" stroke-width="2"/>
    <path d="M${-w + 5} 4Q0 20 ${w - 5} 4" stroke="#102a32" fill="none" stroke-width="3"/>`;
  for (let x = -w + 10; x < w; x += crusher ? 26 : 20) {
    markup += `<path d="M${x}-35l${crusher ? 15 : 9} 0 -5 -10Z" fill="url(#bone)" stroke="#34514e" stroke-width="1"/>`;
  }
  markup += `<path d="M-27-21l9-4m36 0 9 4" stroke="#8ba596" stroke-width="2"/>`;
  paint(c, `jaw-${w}-${crusher}`, markup, -150, -65, 300, 100);
  c.restore();
}
