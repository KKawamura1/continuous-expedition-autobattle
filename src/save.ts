import { ENEMIES, INITIAL_UNLOCKS, MAX_HEALTH, MUTATIONS, SEGMENT } from './content';
import { createState } from './simulation';
import type { EnemyKind, MutationId, State } from './types';
export const SAVE_KEY = 'giant-creature-v2';
const number = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const ids = (value: unknown): value is MutationId[] => Array.isArray(value) && value.length <= MUTATIONS.length && new Set(value).size === value.length && value.every(id => MUTATIONS.some(m => m.id === id));
export function encode(s: State): string { return JSON.stringify({ ...s, effects: [], reaction: '', reactionTime: 0 }); }
export function decode(raw: string | null): State | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if(v.version!==2||!['title','running','body','camp','fallen'].includes(String(v.mode)))return null;
    const bounds: Record<string,[number,number]> = {distance:[0,1e8],checkpoint:[0,1e8],best:[0,1e8],health:[0,MAX_HEALTH],speed:[-4,4],time:[0,1e9],growth:[0,1e9],fossils:[0,1e6],seed:[0,4294967295],nextId:[1,1e9],spawn:[0,2],bite:[-1,10],sweep:[-1,10],organ:[-1,10],pressure:[0,500],kills:[0,1e9]};
    for(const [k,[lo,hi]] of Object.entries(bounds))if(!number(v[k],lo,hi))return null;
    const checkpoint=v.checkpoint as number, distance=v.distance as number;
    if(checkpoint%SEGMENT!==0||distance<checkpoint||distance>checkpoint+SEGMENT||v.best as number<distance)return null;
    if(!ids(v.unlocked)||!ids(v.mutations)||!v.mutations.every(id=>(v.unlocked as MutationId[]).includes(id)))return null;
    if(!Array.isArray(v.enemies)||v.enemies.length>110)return null;
    const seen=new Set<number>();
    for(const e of v.enemies){
      if(!e||typeof e!=='object'||!(e.kind in ENEMIES))return null;
      if(!number(e.id,1,1e9)||seen.has(e.id))return null;seen.add(e.id);
      const b: Record<string,[number,number]>={x:[-250,250],y:[checkpoint-100,checkpoint+600],vx:[-5000,5000],vy:[-1000,1000],hp:[.001,500],contact:[0,1e8],flash:[0,1],collisionCooldown:[-1e9,1]};
      for(const [k,[lo,hi]]of Object.entries(b))if(!number(e[k],lo,hi))return null;
      const spec=ENEMIES[e.kind as EnemyKind];
      const maxHp = spec.hp * (1 + Math.min(checkpoint / SEGMENT, 6) * .06);
      if (e.maxHp !== undefined && e.maxHp !== maxHp || e.hp > maxHp) return null;
      if (e.hpTime !== undefined && !number(e.hpTime, 0, 2.2)) return null;
      e.maxHp = maxHp; e.hpTime ??= 0;
      if(e.mass!==spec.mass||e.radius!==spec.radius||e.speed!==spec.speed)return null;
    }
    if((v.nextId as number)<=Math.max(0,...seen))return null;
    const s={...createState(),...v,unlocked:[...new Set([...v.unlocked,...INITIAL_UNLOCKS])],effects:[],reaction:'',reactionTime:0,reactionCooldown:0} as State;
    if(s.mode==='running')s.mode='body';
    return s;
  } catch { return null; }
}
