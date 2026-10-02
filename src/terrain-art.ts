let sand: HTMLCanvasElement | undefined;
function noise(n: number): number { return ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1; }

export function drawSand(c: CanvasRenderingContext2D, travel: number, height: number): void {
  if (!sand) {
    sand = document.createElement('canvas'); sand.width = 780; sand.height = 640;
    const t = sand.getContext('2d')!; t.scale(2, 2);
    t.fillStyle = '#c3ae87'; t.fillRect(0, 0, 390, 320);
    for (let i = 0; i < 12; i++) {
      const x = noise(i) * 480 - 45, y = noise(i + 40) * 320;
      const g = t.createRadialGradient(x, y, 0, x, y, 68);
      g.addColorStop(0, i % 2 ? '#eee1bd20' : '#736b5920'); g.addColorStop(1, '#b9a37d00');
      t.fillStyle = g; t.fillRect(x - 68, y - 68, 136, 136);
      for (let j = 0; j < 5; j++) {
        t.beginPath(); t.moveTo(x - 20, y + j * 4);
        t.bezierCurveTo(x, y + 9 + j * 4, x + 24, y + 11 + j * 4, x + 47, y + 6 + j * 4);
        t.strokeStyle = j % 2 ? '#e8d7ad18' : '#8b795919'; t.lineWidth = .7; t.stroke();
      }
    }
    for (let i = 0; i < 1500; i++) {
      const x = noise(i + 115) * 390, y = noise(i + 2634) * 320;
      t.fillStyle = i % 3 ? '#695d4820' : '#fff2c833';
      t.fillRect(x, y, noise(i + 174) * 1.1 + .2, .5);
    }
    for (let i = 0; i < 28; i++) {
      const x = noise(i + 71) * 390, y = noise(i + 514) * 320, size = 1 + noise(i + 122) * 2;
      t.beginPath(); t.ellipse(x + 1, y + 1, size + 1, size * .5, .3, 0, Math.PI * 2);
      t.fillStyle = '#655e4b26'; t.fill();
      t.beginPath(); t.ellipse(x, y, size, size * .7, -.3, 0, Math.PI * 2);
      t.fillStyle = '#918774'; t.fill();
      t.strokeStyle = '#e4d2a655'; t.lineWidth = .5; t.stroke();
    }
  }
  // World travel moves the cached tile downward; reversing travel reverses it.
  for (let y = ((travel % 320) + 320) % 320 - 320; y < height; y += 320) c.drawImage(sand, 0, y, 390, 320);
}
