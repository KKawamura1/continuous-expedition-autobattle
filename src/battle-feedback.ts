import { WORLD_SCALE } from './content';
import type { Effect, Enemy, State } from './types';
export const EFFECT_COLOR = { bite: '#fff0b2', sweep: '#f2af58', pull: '#81e0d1', collision: '#ffe9d5', rebound: '#95e0af', scrape: '#e6a4a0', hook: '#aecddb', dust: '#e8d2aa' };
const histories = new Map<number, { x: number; y: number; t: number }[]>();
let previousTime = 0;
function stroke(c: CanvasRenderingContext2D, pts: number[][], color: string, width: number): void {
  c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();
}
function circle(c: CanvasRenderingContext2D,x:number,y:number,r:number,color:string,width=1.5):void {c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
export function motionTrails(c: CanvasRenderingContext2D, s: State, head: number, reducedMotion: boolean): void {
  if (s.time < previousTime || s.mode !== 'running') histories.clear();
  const newTick = s.time !== previousTime; previousTime=s.time;
  const live = new Set(s.enemies.map(e=>e.id));
  for (const id of histories.keys()) if(!live.has(id))histories.delete(id);
  for(const e of s.enemies){
    const h=histories.get(e.id)??[];
    if(newTick){h.push({x:e.x,y:e.y,t:s.time});while(h.length>8||h[0]?.t<s.time-.18)h.shift();histories.set(e.id,h);}
    const event=s.effects.find(f=>f.targetId===e.id&&['pull','sweep','rebound','collision'].includes(f.type));
    if(!event||h.length<2||reducedMotion)continue;
    const points=h.map(p=>[195+p.x,head-(p.y-s.distance)*WORLD_SCALE]);
    c.save();c.globalAlpha=.55;stroke(c,points,EFFECT_COLOR[event.type],event.type==='pull'?3:2);c.restore();
  }
}
export function enemyHealth(c: CanvasRenderingContext2D,e:Enemy,x:number,y:number,s:State):void {
  const active=s.effects.find(f=>f.targetId===e.id&&f.type!=='dust'||f.otherId===e.id);
  if(e.hpTime<=0&&e.hp>=e.maxHp&&e.kind!=='boar')return;
  const width=Math.max(20,e.radius*2.4),ratio=Math.max(0,Math.min(1,e.hp/e.maxHp));
  c.save();c.globalAlpha=e.hpTime>0?1:.5;
  c.fillStyle='#17313be6';c.beginPath();c.roundRect(x-width/2-1,y-e.radius-12,width+2,5,2);c.fill();
  c.fillStyle=ratio<.3?'#ef9972':'#f2d392';c.fillRect(x-width/2,y-e.radius-11,width*ratio,3);
  if(active&&active.type!=='pull'&&active.type!=='hook'){
    const color=EFFECT_COLOR[active.type];
    stroke(c,[[x-e.radius-4,y-2],[x-e.radius-4,y+4],[x-e.radius+1,y+4]],color,1.4);
    stroke(c,[[x+e.radius+4,y-2],[x+e.radius+4,y+4],[x+e.radius-1,y+4]],color,1.4);
  }
  c.restore();
}
export function battleEffects(c: CanvasRenderingContext2D,s:State,head:number,reducedMotion:boolean):void {
  for(const f of s.effects){
    const p=1-f.life/f.maxLife, x=195+f.x,y=head-(f.y-s.distance)*WORLD_SCALE;
    const target=s.enemies.find(e=>e.id===f.targetId);
    const tx=195+(target?.x??f.targetX??f.x),ty=head-((target?.y??f.targetY??f.y)-s.distance)*WORLD_SCALE;
    const color=EFFECT_COLOR[f.type];
    c.save();c.globalAlpha=(1-p)*.9;
    if(f.type==='pull'){
      // Tongue is an organ extending from the jaw; horns and tentacles pull sideways.
      if(f.source==='tongue'){
        const extension=p<.35?p/.35:1;
        const ey=head+(ty-head)*extension,ex=195+(tx-195)*extension;
        c.beginPath();c.moveTo(195,head+13);c.quadraticCurveTo(195+(tx-195)*.25,head-25,ex,ey);
        c.strokeStyle='#29373c';c.lineWidth=6;c.stroke();c.strokeStyle='#c78576';c.lineWidth=3;c.stroke();
        circle(c,ex,ey,5,'#e8bb92',2);
      }else{
        const originX=f.source==='tentacle'?195+Math.sign(f.x)*92:195+Math.sign(f.x)*145;
        const originY=f.source==='tentacle'?head+92:head-16;
        c.beginPath();c.moveTo(originX,originY);c.quadraticCurveTo((originX+tx)/2,ty+28,tx,ty);c.strokeStyle=color;c.lineWidth=f.source==='tentacle'?3:1.2;c.stroke();
        circle(c,tx,ty,(target?.radius??8)+3,color);
      }
      // Directional hooks point toward the receiving organ, even with reduced motion.
      const dx=f.source==='tongue'?195-tx:-Math.sign(tx-195)*18,dy=f.source==='tongue'?head-ty:0;
      const a=Math.atan2(dy,dx);
      c.translate(tx,ty);c.rotate(a);stroke(c,[[11,-4],[16,0],[11,4]],color,2);
    }else if(f.type==='bite'){
      // Paired closing arcs follow the width of the actual jaw, rather than a floating icon.
      const wide=s.mutations.includes('wide-jaw')?135:65,close=Math.max(0,1-p*3);
      for(const side of [-1,1]){
        c.beginPath();c.moveTo(195-wide,head-4-side*close*12);c.quadraticCurveTo(195,head-15-side*close*20,195+wide,head-4-side*close*12);c.strokeStyle=color;c.lineWidth=2;c.stroke();
      }
      stroke(c,[[x-9,y-7],[x,y],[x+7,y-6]],color,2.5);
      for(let i=0;i<4;i++){const a=i*Math.PI/2;c.fillStyle='#d5ba80';c.beginPath();c.ellipse(x+Math.cos(a)*p*18,y+Math.sin(a)*p*9,3,1.5,a,0,Math.PI*2);c.fill();}
    }else if(f.type==='sweep'||f.type==='rebound'){
      const dx=f.dx??0,dy=-(f.dy??8)*WORLD_SCALE,a=Math.atan2(dy,dx),r=12+p*20;
      c.translate(x,y);c.rotate(a);
      stroke(c,[[-7,-7],[r,0],[-7,7]],color,f.type==='rebound'?3:2);
      stroke(c,[[r-6,-5],[r+1,0],[r-6,5]],color,2);
      if(f.type==='rebound')circle(c,0,0,9+p*16,color,2);
      else{c.beginPath();c.arc(-16,0,23,-.8,.8);c.strokeStyle=color;c.lineWidth=f.strength&&f.strength>1.5?4:2;c.stroke();}
    }else if(f.type==='collision'){
      // Two opposing ripples originate at the contact point of the two bodies.
      for(const side of [-1,1]){c.beginPath();c.arc(x+side*p*10,y,5+p*12,side<0?Math.PI/2:-Math.PI/2,side<0?Math.PI*1.5:Math.PI/2);c.strokeStyle=color;c.lineWidth=2;c.stroke();}
      for(let i=0;i<6;i++){const a=i*Math.PI/3;stroke(c,[[x+Math.cos(a)*4,y+Math.sin(a)*4],[x+Math.cos(a)*(9+p*17),y+Math.sin(a)*(9+p*17)]],i%2?color:'#eab278',1.6);}
    }else if(f.type==='scrape'){
      for(let i=-1;i<=1;i++)stroke(c,[[tx-6+i*4,ty-7],[tx+i*4,ty+6]],color,1.4);
    }else if(f.type==='hook'){
      c.beginPath();c.arc(tx,ty,(target?.radius??9)+4,.2,Math.PI*1.7);c.strokeStyle=color;c.lineWidth=1.8;c.stroke();
      stroke(c,[[tx+8,ty+6],[tx+3,ty+13],[tx-2,ty+10]],color,2);
    }else if(f.type==='dust'){
      for(let i=0;i<5;i++){const a=i*2.4;c.fillStyle='#dac293';c.beginPath();c.ellipse(x+Math.cos(a)*p*20,y+Math.sin(a)*p*13,3+p*3,2+p*2,a,0,Math.PI*2);c.fill();}
    }
    c.restore();
  }
  void reducedMotion;
}
export function newest(s:State,type:Effect['type']):Effect|undefined {return s.effects.filter(e=>e.type===type).sort((a,b)=>b.life/b.maxLife-a.life/a.maxLife)[0];}
