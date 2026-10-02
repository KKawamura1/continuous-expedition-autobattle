import { WORLD_SCALE, has } from './content';
import type { Enemy, State } from './types';
import { drawBody, drawHorns, drawJaw } from './creature-art';
import { drawGirl } from './girl-art';
import { drawSand } from './terrain-art';
import { battleHead, bodyOffset } from './body-layout';
import { battleEffects, enemyHealth, newest } from './battle-feedback';
import { hornMotion, jawWidth, skinEdge } from './body-physics';
const INK = '#263a3b', BONE = '#dfd8b6';
function poly(c: CanvasRenderingContext2D, points: number[][], fill: string, stroke = INK, width = 2): void {
  c.beginPath(); points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath();
  c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string | CanvasGradient, stroke = ''): void {
  c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2); c.fillStyle=color; c.fill(); if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}
}
function line(c: CanvasRenderingContext2D, pts: number[][], color: string, width: number): void {
  c.beginPath(); pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();
}
function hash(i: number): number { return ((Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1; }
function ground(c: CanvasRenderingContext2D, s: State, h: number): void {
  const travel=s.distance*WORLD_SCALE;
  drawSand(c, travel, h);
  const from=Math.floor(travel/160)-1,to=Math.ceil((travel+h)/160)+1;
  for(let row=from;row<=to;row++){
    const y=row*160-travel;
    // The landscape moves down when progressing north; world row is rendered inverted.
    const sy=h-y;
    for(let i=0;i<12;i++){
      const n=row*19+i, x=hash(n)*390, yy=sy+hash(n+14)*140;
      c.globalAlpha=.24;
      if(i%4===0)line(c,[[x-14,yy+5],[x,yy],[x+6,yy-10],[x+20,yy-13]],'#6b614d',1);
      else if(i%5===0)poly(c,[[x-5,yy],[x-2,yy-4],[x+5,yy-2],[x+6,yy+3],[x,yy+5]],'#766f5b','');
      else oval(c,x,yy,1.5,1,'#e8d3a9');
      c.globalAlpha=1;
    }
    if(row%4===0){
      const x=hash(row+3)*340+25;
      oval(c,x+2,sy+5,16,6,'#9d8e70');
      poly(c,[[x-13,sy],[x-5,sy-11],[x+8,sy-9],[x+15,sy+2],[x+3,sy+5]],'#a09070','#918367',1);
      line(c,[[x-5,sy-11],[x,sy-2],[x+15,sy+2]],'#b4a17b',1.5);
    }
    if(s.checkpoint>=300&&row%7===0){
      c.save();c.translate(310,sy);c.rotate(-.35);
      line(c,[[-18,0],[20,0]],BONE,5);
      for(let i=-2;i<=2;i++)line(c,[[i*7,0],[i*7+1,-11],[i*7+5,-16]],BONE,3);
      c.restore();
    }
  }
  // Sparse tracks are a stable reference for direction, without a drawn frontline.
  for(let j=0;j<2;j++)for(let i=0;i<18;i++){
    const y=((i*65+travel)% (h+80))-40;
    line(c,[[j?360:30,y],[j?355:35,y+14]],'#ad9673',2);
  }
}
function enemy(c: CanvasRenderingContext2D, e: Enemy, x: number, y: number, t: number): void {
  c.save(); c.translate(x, y); c.scale(e.flash>0?1.10:1,e.flash>0?.90:1); c.rotate(Math.atan2(e.vx, Math.max(2, -e.vy * 4)) * .35);
  const r = e.radius, stride = Math.sin(t * (e.kind === 'wolf' ? 20 : 12) + e.id) * 2;
  oval(c, 2, 5, r * 1.05, r * .8, '#574e3a30');
  const fill = c.createLinearGradient(-r, -r, r, r);
  if (e.flash > 0) { fill.addColorStop(0, '#fff0cc'); fill.addColorStop(1, '#cbb67a'); }
  else if (e.kind === 'beetle') { fill.addColorStop(0, '#79816a'); fill.addColorStop(.4, '#4c5b4e'); fill.addColorStop(1, '#253f3c'); }
  else { fill.addColorStop(0, e.kind === 'wolf' ? '#aaa392' : '#93806b'); fill.addColorStop(.5, e.kind === 'wolf' ? '#777a70' : '#69554a'); fill.addColorStop(1, '#3d403a'); }
  const outline = '#384239';
  if (e.kind === 'beetle') {
    for (const side of [-1, 1]) for (let i = -1; i <= 1; i++) {
      line(c, [[side * 4, i * 5], [side * (r + 3), i * 5 + stride], [side * (r + 5), i * 6 + 3]], '#41493d', 1.6);
      line(c, [[side * (r + 2), i * 5 + stride], [side * (r + 4), i * 6 + 3]], '#88886b', .6);
    }
    oval(c, 0, 0, r * .8, r * 1.1, fill, outline);
    c.beginPath(); c.moveTo(0, -r); c.quadraticCurveTo(-2, 0, 0, r); c.strokeStyle = '#263c34'; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.moveTo(-4, -r + 2); c.quadraticCurveTo(-7, 0, -4, 4); c.strokeStyle = '#c1bea0'; c.lineWidth = .8; c.stroke();
    oval(c, 0, r * .8, 4.5, 4, fill, outline);
    line(c, [[-3, r + 1], [-5, r + 5], [-3, r + 6]], '#444a3b', 1.2);
    line(c, [[3, r + 1], [5, r + 5], [3, r + 6]], '#444a3b', 1.2);
  } else {
    for (const side of [-1, 1]) for (const yy of [-6, 5]) {
      line(c, [[side * r * .5, yy], [side * (r + 1), yy + stride], [side * (r + 3), yy + 3 + stride]], '#4c5045', 3.4);
      line(c, [[side * r * .5, yy], [side * (r + 1), yy + stride]], e.kind === 'wolf' ? '#969786' : '#847363', 2);
    }
    if (e.kind === 'wolf') {
      c.beginPath(); c.moveTo(0, -r); c.bezierCurveTo(-2, -r * 2.1, 6, -r * 2.3, 2, -r * 2.7);
      c.strokeStyle = '#555e54'; c.lineWidth = 4; c.lineCap = 'round'; c.stroke();
    }
    oval(c, 0, -3, r * .78, r * 1.3, fill, outline);
    c.lineWidth = .8; c.strokeStyle = '#c1bd9e';
    c.beginPath(); c.moveTo(-2, -r); c.bezierCurveTo(-4, -5, -2, 0, -3, 5); c.stroke();
    c.beginPath(); c.moveTo(-r * .65, 3); c.quadraticCurveTo(-r, 8, -r * .4, 12);
    c.quadraticCurveTo(0, e.kind === 'wolf' ? 19 : 17, r * .4, 12);
    c.quadraticCurveTo(r, 8, r * .65, 3); c.closePath();
    c.fillStyle = fill; c.fill(); c.strokeStyle = outline; c.lineWidth = 1.2; c.stroke();
    for (const side of [-1, 1]) {
      poly(c, [[side * r * .6, 6], [side * r * .82, -1], [side * r * .15, 4]], '#686d5d', outline, .8);
      line(c, [[side * r * .6, 4], [side * r * .67, 1]], '#b5a88c', .7);
      oval(c, side * r * .35, 9, 1.1, .8, '#d0bb75');
    }
    oval(c, 0, e.kind === 'wolf' ? 15 : 14, e.kind === 'wolf' ? 2.5 : 4, 2, '#343d35');
    if (e.kind === 'boar') {
      line(c, [[-9, 12], [-12, 17], [-8, 15]], '#e7dabb', 2);
      line(c, [[9, 12], [12, 17], [8, 15]], '#e7dabb', 2);
      for (let i = -1; i <= 1; i++) line(c, [[i * 3, -18], [i * 3 + 1, -9]], '#4e473e', 1.2);
    }
  }
  c.restore();
}
function creature(c: CanvasRenderingContext2D, s: State, head: number, h: number, idle: number, reducedMotion=false): void {
  const m = s.mutations;
  const ready = s.mode === 'running' && s.bite < .13 && s.enemies.some(e => e.y - s.distance < 18 && Math.abs(e.x) < jawWidth(m));
  const opening = ready ? (1 - s.bite / .13) * 19 : 0;
  c.save(); c.translate(195, head);
  drawBody(c);
  // Anatomical additions share the art's shaded, rounded surface language.
  if (has(m, 'heavy-neck')) {
    for (const side of [-1, 1]) {
      c.save(); c.scale(side * (has(m, 'anchor-neck') ? 1.18 : 1), has(m, 'anchor-neck') ? 1.1 : 1);
      const g = c.createLinearGradient(45, 100, 145, 186);
      g.addColorStop(0, '#96aa98'); g.addColorStop(.35, '#618780'); g.addColorStop(1, '#253f4d');
      c.beginPath(); c.moveTo(59, 113); c.bezierCurveTo(89, 140, 146, 118, 167, 147);
      c.bezierCurveTo(169, 171, 127, 199, 82, 193); c.quadraticCurveTo(91, 151, 59, 113);
      c.fillStyle = g; c.fill(); c.strokeStyle = '#203b48'; c.lineWidth = 2; c.stroke();
      line(c, [[83, 137], [123, 141], [146, 153]], '#a1b69f', 1.5);
      c.restore();
    }
  }
  for (const side of [-1, 1]) {
    c.save(); c.scale(side, 1);
    for (let yy = 184; yy < h + 100; yy += 68) {
      if (has(m, 'thorn')) {
        c.beginPath(); c.moveTo(148, yy + 27); c.quadraticCurveTo(165, yy + 4, 178, yy - (has(m, 'razor-scale') ? 22 : 10));
        c.quadraticCurveTo(174, yy + 20, 181, yy + 29); c.closePath();
        const g = c.createLinearGradient(148, yy, 178, yy + 20);
        g.addColorStop(0, '#e7dfbe'); g.addColorStop(1, '#839184');
        c.fillStyle = g; c.fill(); c.strokeStyle = '#314d50'; c.lineWidth = 1.2; c.stroke();
      }
      if (has(m, 'hook-scale')) {
        c.beginPath(); c.moveTo(190, yy + 10); c.bezierCurveTo(202, yy - 8, 222, yy + 7, 204, yy + 24);
        c.bezierCurveTo(216, yy + 8, 200, yy + 6, 190, yy + 10);
        c.fillStyle = '#c2c2a2'; c.fill(); c.strokeStyle = '#284650'; c.lineWidth = 1; c.stroke();
      }
      if (has(m, 'elastic-scale')) {
        const g = c.createRadialGradient(176, yy + 4, 2, 184, yy + 13, 24);
        g.addColorStop(0, '#a0bda8'); g.addColorStop(.4, '#6d9e91'); g.addColorStop(1, '#244b5a');
        oval(c, 184, yy + 13, 25, has(m, 'rebound-scale') ? 21 : 16, g, '#2c535a');
        line(c, [[168, yy + 7], [179, yy + 2], [192, yy + 5]], '#bdd3b4', 1);
      }
    }
    if (has(m, 'fast')) {
      for (let i = 0; i < 3; i++) {
        const y = 112 + i * 13;
        c.beginPath(); c.moveTo(62, y); c.quadraticCurveTo(77, y + 13, 98, y + 11);
        c.strokeStyle = '#c4b98b'; c.lineWidth = 2 - i * .3; c.stroke();
      }
    }
    c.restore();
  }
  if (opening>0) oval(c, 0, 11, has(m, 'wide-jaw') ? 112 : 86, 9+opening*.65, '#11262f');
  drawJaw(c, m, reducedMotion ? 0 : opening);
  // Material plates at the actual collision edge, plus the same additions down the flank.
  for (let x = -176; x <= 176; x += 22) {
    const y = skinEdge(x, m);
    if (has(m, 'elastic-scale')) {
      const hit = s.effects.find(f => f.type === 'rebound' && Math.abs(f.x - x) < 24);
      const compression = hit ? Math.sin(hit.life / hit.maxLife * Math.PI) * 4 : 0;
      oval(c, x, y + 9 + compression, 13, (has(m, 'rebound-scale') ? 14 : 11) - compression, '#6d9e91', '#244b5a');
      line(c, [[x-7, y+6+compression], [x, y+3+compression], [x+7, y+6+compression]], '#bdd3b4', 1);
    }
    if (has(m, 'thorn')) poly(c, [[x-7,y+18], [x,y], [x+7,y+18]], BONE, '#314d50', 1);
    if (has(m, 'hook-scale')) {
      c.beginPath(); c.moveTo(x-6,y+16); c.quadraticCurveTo(x+12,y-5,x+7,y+3); c.quadraticCurveTo(x+5,y+12,x,y+9);
      c.strokeStyle=BONE; c.lineWidth=3; c.stroke();
    }
  }
  if (has(m, 'spring-jaw')) {
    c.beginPath(); c.moveTo(-80, 16); c.quadraticCurveTo(0, 55, 80, 16);
    c.strokeStyle = '#c4c6a6'; c.lineWidth = 3; c.stroke();
  }
  if (has(m, 'tongue')) {
    c.beginPath(); c.moveTo(-4, 17); c.bezierCurveTo(-8, 31, 13, 41, 14, 23);
    c.strokeStyle = '#2d3a3c'; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#b16f62'; c.lineWidth = 3; c.stroke();
  }
  c.save(); c.translate(hornMotion(s).x, 0); drawHorns(c, m); c.restore();
  drawGirl(c, s, 123, idle);
  if (s.reactionTime > 0) {
    c.font = '600 11px system-ui, sans-serif';
    const textWidth = c.measureText(s.reaction).width;
    c.fillStyle = '#f4ecd8'; c.strokeStyle = '#687b75'; c.lineWidth = .8;
    c.beginPath(); c.roundRect(25, 101, textWidth + 20, 27, 10); c.fill(); c.stroke();
    poly(c, [[29, 122], [18, 128], [35, 126]], '#f4ecd8', '');
    c.fillStyle = '#314548'; c.fillText(s.reaction, 35, 118);
  }
  c.restore();
}
export interface View { height: number; reveal: number; idle: number; reducedMotion?: boolean }
export function draw(c: CanvasRenderingContext2D, s: State, view: View): void {
  const {height:h,reveal,idle}=view;
  c.clearRect(0,0,390,h);
  const reducedMotion=!!view.reducedMotion;
  const baseHead=battleHead(h,s.speed), offset=bodyOffset(h)*reveal;
  const heavyBite=newest(s,'bite');
  const shake=!reducedMotion&&reveal<.05&&heavyBite&&(heavyBite.strength??0)>55 ? Math.sin(heavyBite.life*95)*2*heavyBite.life/heavyBite.maxLife : 0;
  c.save();c.translate(shake,offset);
  ground(c,s,h*1.5);
  creature(c,s,baseHead,h,idle,reducedMotion);
  // The HP and contact effects share exactly the same world coordinates as physics.
  for(const e of s.enemies){const y=baseHead-(e.y-s.distance)*WORLD_SCALE;if(y+offset>-40&&y+offset<h+40){enemy(c,e,195+e.x,y,s.time);enemyHealth(c,e,195+e.x,y);}}
  battleEffects(c,s,baseHead,reducedMotion);
  c.restore();
  if(s.health<75){const g=c.createRadialGradient(195,h*.6,120,195,h*.6,h*.7);g.addColorStop(0,'#8e3c2900');g.addColorStop(1,`rgba(112,40,25,${(75-s.health)/125})`);c.fillStyle=g;c.fillRect(0,0,390,h);}
  if(reveal>0){c.fillStyle=`rgba(21,38,35,${reveal*.15})`;c.fillRect(0,0,390,h);}
}
