import { WORLD_SCALE, has } from './content';
import type { Enemy, State } from './types';
const INK = '#263a3b', BONE = '#dfd8b6';
function poly(c: CanvasRenderingContext2D, points: number[][], fill: string, stroke = INK, width = 2): void {
  c.beginPath(); points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath();
  c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, stroke = ''): void {
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
function girl(c: CanvasRenderingContext2D, s: State, y: number, idle: number): void {
  c.save();c.translate(5,y);
  const alarm=s.pressure>4, cheer=s.reactionTime>0&&!alarm;
  const f=Math.sin(idle*3), foot=Math.sin(idle*5)*2;
  oval(c,0,12,13,7,'#263b3c');
  line(c,[[-5,10],[-8,19+foot]],'#ac9370',4);line(c,[[5,10],[9,19-foot]],'#ac9370',4);
  line(c,[[-8,19+foot],[-12,20+foot]],'#343a35',4);line(c,[[9,19-foot],[13,20-foot]],'#343a35',4);
  poly(c,[[-8,-4],[-7,11],[7,11],[8,-4]],'#c75e38',INK,1.5);
  line(c,[[-7,0],[-12,cheer?-8:alarm?7:4+f]],'#bd9c75',3);line(c,[[7,0],[12,cheer?-10:alarm?7:4-f]],'#bd9c75',3);
  oval(c,0,-8,7,8,'#cba57c',INK);poly(c,[[-7,-8],[-7,-15],[2,-18],[7,-13],[7,-6],[2,-10],[-2,-8]],'#453c32',INK,1);
  poly(c,[[-6,-1],[6,-1],[8,2],[1,4],[-2,1],[-11,4-f]],'#e6bd59','',0);
  c.restore();
}
function creature(c: CanvasRenderingContext2D, s: State, head: number, h: number, idle: number): void {
  const m=s.mutations;
  const wave=Math.sin(s.time*(has(m,'fast')?6:3))*(has(m,'heavy-neck')?2:5);
  const bite=Math.max(0,1-s.bite/.18)*7;
  c.save();c.translate(195+wave,head+Math.sin(idle*1.2)*1.4);
  // A continuous mass wider than the screen: body, neck and head have no pinched join.
  c.beginPath();c.moveTo(-238,h);c.lineTo(-236,130);c.bezierCurveTo(-248,75,-218,23,-166,16);c.bezierCurveTo(-111,1,-66,-6,0,-4);c.bezierCurveTo(66,-6,111,1,166,16);c.bezierCurveTo(218,23,248,75,236,130);c.lineTo(238,h);c.closePath();
  c.fillStyle='#526967';c.fill();c.strokeStyle=INK;c.lineWidth=4;c.stroke();
  // Broad lateral armour plates make the width readable even when clipped.
  for(const side of [-1,1]){
    c.save();c.scale(side,1);
    poly(c,[[125,34],[182,24],[222,49],[226,101],[187,125],[147,95]],'#687b70');
    poly(c,[[154,125],[214,110],[233,157],[214,209],[153,204],[126,164]],'#61766d');
    poly(c,[[147,212],[222,205],[239,259],[209,300],[148,287],[119,249]],'#5d736b');
    line(c,[[169,40],[199,51],[205,81]],'#9aab8c',3);
    for(let yy=95;yy<h;yy+=90){
      if(has(m,'thorn'))poly(c,[[190,yy],[221,yy-20],[213,yy+20]],BONE);
      if(has(m,'hook-scale'))line(c,[[184,yy],[208,yy+12],[202,yy+23]],BONE,4);
      if(has(m,'elastic-scale'))oval(c,190,yy,27,18,'#95a595',INK);
    }
    // Ivory horns follow the surface, with visible shape mutations.
    const thick=has(m,'heavy-horn')?24:13, bend=has(m,'curl')?58:128;
    poly(c,[[100,56],[100+thick,23],[125,-20],[bend,-69],[has(m,'curl')?91:145,-30],[142,13],[151,68]],BONE,INK,3);
    poly(c,[[111,44],[125,8],[125,-20],[bend,-69],[118,-24],[109,11]],'#f2e8c6','');
    if(has(m,'branch')){
      poly(c,[[128,-8],[164,-28],[174,-51],[165,-15],[143,13]],BONE);
      poly(c,[[111,16],[82,-6],[74,-29],[82,14],[104,37]],BONE);
    }
    // Eyes remain small and remote on a giant head.
    poly(c,[[163,53],[190,51],[183,58],[166,59]],INK,'');line(c,[[173,55],[180,55]],'#e4bf60',2);
    c.restore();
  }
  const jaw=has(m,'wide-jaw')?134:97;
  poly(c,[[-jaw,16],[-jaw+16,-2],[0,-13],[jaw-16,-2],[jaw,16],[jaw-13,34],[0,42],[-jaw+13,34]],'#71857a');
  line(c,[[-jaw+8,14],[0,22+bite],[jaw-8,14]],INK,4);
  for(const side of [-1,1])poly(c,[[side*(jaw-28),16],[side*(jaw-14),16],[side*(jaw-21),29+bite]],BONE,INK,1);
  if(has(m,'spring-jaw'))line(c,[[-jaw,30],[-jaw+18,46],[0,53],[jaw-18,46],[jaw,30]],BONE,4);
  if(has(m,'tongue'))poly(c,[[-6,19],[0,37],[11,33],[6,44],[0,44],[-8,25]],'#af715d',INK,1);
  poly(c,[[-53,46],[0,30],[53,46],[72,115],[43,153],[-43,153],[-72,115]],'#425d5b');
  for(let yy=72;yy<h;yy+=68){
    const yy2=yy+Math.sin(idle+yy)*1;
    poly(c,[[0,yy2-15],[36,yy2+8],[29,yy2+38],[0,yy2+50],[-29,yy2+38],[-36,yy2+8]],yy<155?'#87998a':'#738b7e');
    poly(c,[[0,yy2-12],[10,yy2+5],[0,yy2+28],[-10,yy2+5]],BONE,INK,1.5);
  }
  if(has(m,'heavy-neck')){
    for(const side of [-1,1])poly(c,[[side*76,115],[side*139,128],[side*139,179],[side*88,196],[side*59,147]],'#849181',INK,3);
  }
  if(has(m,'fast'))for(const side of [-1,1])line(c,[[side*70,95],[side*96,143],[side*73,188]],'#b6b693',3);
  if(has(m,'tentacle'))for(const side of [-1,1]){
    const swing=Math.sin(s.time*2)*12;
    line(c,[[side*56,210],[side*143,184],[side*(171+swing),108],[side*145,86]],INK,11);
    line(c,[[side*56,210],[side*143,184],[side*(171+swing),108],[side*145,86]],'#aab395',7);
  }
  girl(c,s,111,idle);
  if(s.reactionTime>0){
    c.font='bold 12px sans-serif';const textWidth=c.measureText(s.reaction).width;
    c.fillStyle='#efe6ca';c.strokeStyle=INK;c.lineWidth=1.5;
    c.beginPath();c.roundRect(20,88,textWidth+18,27,7);c.fill();c.stroke();
    poly(c,[[21,107],[16,116],[31,112]],'#efe6ca','');c.fillStyle=INK;c.fillText(s.reaction,29,106);
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
