import { WORLD_SCALE, has } from './content';
import type { Enemy, State } from './types';
import { drawBody, drawHorns, drawJaw } from './creature-art';
import { drawGirl } from './girl-art';
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
  c.fillStyle='#b9a079'; c.fillRect(0,0,390,h);
  const travel=s.distance*WORLD_SCALE;
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
  c.save();c.translate(x,y);c.rotate(Math.atan2(e.vx,Math.max(2,-e.vy*4))*.35);
  const r=e.radius, stride=Math.sin(t*(e.kind==='wolf'?20:12)+e.id)*2;
  oval(c,2,5,r*1.1,r*.75,'#877d61');
  const fill=e.flash>0?'#f4e4bc':e.kind==='beetle'?'#545246':e.kind==='wolf'?'#776653':'#6c5140';
  if(e.kind==='beetle'){
    for(const side of [-1,1])for(let i=-1;i<=1;i++)line(c,[[side*4,i*5],[side*(r+3),i*5+stride],[side*(r+5),i*6+3]],'#45473d',1.8);
    oval(c,0,0,r*.8,r*1.2,fill,INK);line(c,[[0,-r],[0,r]],'#b3a17d',1);oval(c,0,7,4,4,'#353e37');
  }else{
    for(const side of [-1,1])for(const yy of [-6,5])line(c,[[side*r*.5,yy],[side*(r+3),yy+stride]],fill,4);
    oval(c,0,-3,r*.8,r*1.25,fill,INK);
    poly(c,[[-r*.65,4],[-r*.8,11],[0,17],[r*.8,11],[r*.65,4]],fill);
    poly(c,[[-r*.7,6],[-r,1],[-r*.3,2]],fill);poly(c,[[r*.7,6],[r,1],[r*.3,2]],fill);
    if(e.kind==='boar'){line(c,[[-9,12],[-12,17],[-7,15]],BONE,3);line(c,[[9,12],[12,17],[7,15]],BONE,3);}
    else line(c,[[0,-r*1.5],[3,-r*2]],fill,4);
    oval(c,-4,10,1.3,1.3,'#d8ba7c');oval(c,4,10,1.3,1.3,'#d8ba7c');
  }
  c.restore();
}
function creature(c: CanvasRenderingContext2D, s: State, head: number, h: number, idle: number): void {
  const m = s.mutations;
  const sweep = s.effects.find(e => e.type === 'sweep');
  const bite = s.effects.find(e => e.type === 'bite');
  const impact = sweep ? Math.sin(sweep.life / sweep.maxLife * Math.PI) : 0;
  const wave = Math.sin(s.time * (has(m, 'fast') ? 5 : 2.2)) * (has(m, 'heavy-neck') ? 1.5 : 3);
  c.save(); c.translate(195 + wave + impact * 3, head + Math.sin(idle * 1.3) * 1.2);
  c.scale(1 + Math.sin(idle * 1.3) * .002, 1);
  drawBody(c);
  // Anatomical additions share the art's shaded, rounded surface language.
  if (has(m, 'heavy-neck')) {
    for (const side of [-1, 1]) {
      c.save(); c.scale(side, 1);
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
        c.beginPath(); c.moveTo(148, yy + 27); c.quadraticCurveTo(165, yy + 4, 178, yy - 10);
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
        oval(c, 184, yy + 13, 25, 16, g, '#2c535a');
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
    if (has(m, 'tentacle')) {
      const swing = Math.sin(s.time * 2) * 13;
      c.beginPath(); c.moveTo(76, 220); c.bezierCurveTo(174, 207, 170 + swing, 121, 147, 90);
      c.strokeStyle = '#122e3a'; c.lineWidth = 11; c.lineCap = 'round'; c.stroke();
      c.strokeStyle = '#758f7e'; c.lineWidth = 7; c.stroke();
      c.strokeStyle = '#c4c4a1'; c.lineWidth = 2; c.stroke();
    }
    c.restore();
  }
  if (bite) oval(c, 0, 9, has(m, 'wide-jaw') ? 114 : 86, 18, '#122930');
  drawJaw(c, has(m, 'wide-jaw'), bite ? Math.sin(bite.life / bite.maxLife * Math.PI) * 12 : 0);
  if (has(m, 'spring-jaw')) {
    c.beginPath(); c.moveTo(-80, 16); c.quadraticCurveTo(0, 55, 80, 16);
    c.strokeStyle = '#c4c6a6'; c.lineWidth = 3; c.stroke();
  }
  if (has(m, 'tongue')) {
    c.beginPath(); c.moveTo(-4, 17); c.bezierCurveTo(-8, 31, 13, 41, 14, 23);
    c.strokeStyle = '#2d3a3c'; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#b16f62'; c.lineWidth = 3; c.stroke();
  }
  drawHorns(c, m);
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
export interface View { height: number; reveal: number; idle: number }
export function draw(c: CanvasRenderingContext2D, s: State, view: View): void {
  const {height:h,reveal,idle}=view;
  c.clearRect(0,0,390,h);
  c.save(); c.translate(0,-reveal*h*.34);
  ground(c,s,h*1.5);
  const head=h*.60+(s.speed<0?Math.min(15,-s.speed*4):0);
  creature(c,s,head,h,idle);
  // Enemies use the same surface as physics; rendering cannot invent a separate front line.
  for(const e of s.enemies){const y=head-(e.y-s.distance)*WORLD_SCALE;if(y>-40&&y<h+40)enemy(c,e,195+e.x,y,s.time);}
  for(const e of s.effects){
    const y=head-(e.y-s.distance)*WORLD_SCALE, x=195+e.x, p=1-e.life/e.maxLife;
    c.globalAlpha=1-p;
    if(e.type==='pull'){
      line(c,[[x,y],[x+(e.targetX??0)*.2,y-22],[195+(e.targetX??0),head-((e.targetY??s.distance)-s.distance)*WORLD_SCALE]],'#c79c7b',4);
    }else if(e.type==='dust'){
      for(let i=0;i<4;i++)oval(c,x+Math.cos(i*2)*p*14,y+Math.sin(i*2)*p*14,2,2,'#e5ce9e');
    }else{
      const r=e.type==='impact'?8:12;
      line(c,[[x-r-p*5,y-3],[x,y-8-p*4],[x+r+p*5,y-3]],e.type==='bite'?'#f5ddaa':'#d5d9b7',2);
    }
    c.globalAlpha=1;
  }
  c.restore();
  if(s.health<75){const g=c.createRadialGradient(195,h*.6,120,195,h*.6,h*.7);g.addColorStop(0,'#8e3c2900');g.addColorStop(1,`rgba(112,40,25,${(75-s.health)/125})`);c.fillStyle=g;c.fillRect(0,0,390,h);}
  if(reveal>0){c.fillStyle=`rgba(21,38,35,${reveal*.15})`;c.fillRect(0,0,390,h);}
}
