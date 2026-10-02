import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, collide, cost, createState, depart, mutate, spawnEnemy, start, step, unlock } from '../src/simulation.ts';
import { decode, encode } from '../src/save.ts';
import { hornShapes, jawShape, organTip, shapeContact } from '../src/body-physics.ts';
import { MAX_HEALTH, MUTATIONS } from '../src/content.ts';
import type { MutationId } from '../src/types.ts';
function running(){const s=createState();start(s);return s;}
test('title and body inspection freeze movement, enemies, resources and attack timers',()=>{
  const s=createState();advance(s,30);assert.equal(s.distance,0);start(s);advance(s,10);s.mode='body';const before=encode(s);advance(s,30);assert.equal(encode(s),before);
});
test('mutation purchase is permanent for a segment and rejects duplicate, locked, unaffordable and running purchases',()=>{
  const s=running();assert.equal(mutate(s,'curl'),false);s.mode='body';assert.equal(mutate(s,'tentacle'),false);const price=cost(s,'curl');assert.equal(mutate(s,'curl'),true);assert.equal(s.growth,12-price);assert.equal(mutate(s,'curl'),false);assert.equal(mutate(s,'heavy-horn'),false);
});
test('empty battlefield advances; spatial density creates new enemies without pregeneration',()=>{
  const s=running();assert.equal(s.enemies.length,0);advance(s,10);assert(s.distance>25);assert(s.enemies.length>=10);
});
test('enemies keep approaching a retreating creature',()=>{
  const s=running();s.distance=50;s.speed=-3;const e=spawnEnemy(s,'wolf',100,100);advance(s,.5);assert(e.y<100);
});
test('heavy contact makes actual progress retreat and sustained pressure can stop the expedition',()=>{
  const s=running();s.distance=100;s.bite=10;s.sweep=10;for(let i=0;i<16;i++)spawnEnemy(s,'boar',-170+i*22,100);advance(s,3);assert(s.distance<100);assert(s.health<MAX_HEALTH);assert(s.speed<0);
  s.health=.01;step(s,.05);assert.equal(s.mode,'fallen');assert.equal(s.speed,0);
});
test('horns exert no attraction before contact, then slide bodies inward along both diagonal faces',()=>{
  for(const side of [-1,1]) {
    const s=running();s.mutations=['heavy-horn'];s.bite=s.sweep=10;
    const e=spawnEnemy(s,'boar',side*130,60);step(s,.05);assert.equal(e.vx,0);assert.equal(e.x,side*130);
    e.y=28;e.vy=-12;advance(s,.2);assert(Math.abs(e.x)<130);assert(e.vx*side<0);
    assert(!s.effects.some(f=>f.type==='pull'));assert(s.effects.some(f=>f.type==='sweep'&&f.targetId===e.id));
  }
});
test('identical contact transfers less momentum to heavier bodies',()=>{
  const a=running(),b=running();a.mutations=b.mutations=['heavy-horn'];a.bite=b.bite=a.sweep=b.sweep=10;
  const ea=spawnEnemy(a,'boar',130,28),eb=spawnEnemy(b,'boar',130,28);ea.mass=.65;ea.vy=eb.vy=-12;
  advance(a,.15);advance(b,.15);assert(ea.vx<eb.vx);assert(ea.x<eb.x);
});
test('wide jaw bites enemies outside the normal jaw',()=>{
  const a=running(),b=running();b.mutations=['wide-jaw'];a.bite=b.bite=0;a.sweep=b.sweep=10;const ea=spawnEnemy(a,'boar',105,8),eb=spawnEnemy(b,'boar',105,8);step(a,.05);step(b,.05);assert(eb.hp<ea.hp);
});
test('pulling velocity increases spring-jaw damage through shared relative speed',()=>{
  const a=running(),b=running();a.mutations=b.mutations=['spring-jaw'];a.bite=b.bite=0;a.sweep=b.sweep=10;const ea=spawnEnemy(a,'boar',0,8),eb=spawnEnemy(b,'boar',0,8);eb.vy=-25;step(a,.05);step(b,.05);assert(eb.hp<ea.hp);
});
test('high speed enemy collision transfers momentum and deals damage; resting overlap does not',()=>{
  const s=running();const a=spawnEnemy(s,'boar',0,10),b=spawnEnemy(s,'beetle',0,15);a.vy=30;b.vy=-4;const damage=collide(a,b);assert(damage>0);assert(b.vy>-4);assert(b.hp<22);
  const c=spawnEnemy(s,'beetle',0,30),d=spawnEnemy(s,'beetle',1,30);c.vx=d.vx=0;c.vy=d.vy=0;assert.equal(collide(c,d),0);
});
test('elastic scales bounce fast enemies and thorn scales scrape moving contact',()=>{
  const a=running(),b=running();a.mutations=['elastic-scale'];b.mutations=['thorn'];a.bite=b.bite=10;a.sweep=b.sweep=10;const ea=spawnEnemy(a,'wolf',100,0),eb=spawnEnemy(b,'wolf',100,0);ea.vy=eb.vy=-20;eb.vx=30;step(a,.05);step(b,.05);assert(ea.vy>0);assert(eb.hp<32);
});
test('camp awards memory once, unlocks choices and resets segment body on departure',()=>{
  const s=running();s.distance=299.99;s.speed=3;s.mutations=['curl'];advance(s,.1);assert.equal(s.mode,'camp');assert.equal(s.checkpoint,300);assert.equal(s.fossils,1);advance(s,20);assert.equal(s.fossils,1);assert(unlock(s,'tentacle'));assert.equal(s.fossils,0);assert(!unlock(s,'tentacle'));assert(depart(s));assert.equal(s.mode,'body');assert.equal(s.mutations.length,0);assert(s.unlocked.includes('tentacle'));assert.equal(s.distance,300);assert.equal(s.health,MAX_HEALTH);
});
test('failure recovery clears hostile field and preserves permanent unlocks',()=>{
  const s=running();s.mode='fallen';s.checkpoint=300;s.distance=340;s.unlocked.push('tentacle');s.mutations=['curl'];spawnEnemy(s);assert(depart(s));assert.equal(s.distance,300);assert.equal(s.enemies.length,0);assert(s.unlocked.includes('tentacle'));assert.equal(s.growth,12);
});
test('save round trip pauses safely and preserves physical state',()=>{
  const s=running();advance(s,30);s.mode='body';s.growth=40;mutate(s,'curl');s.mode='running';const restored=decode(encode(s));assert(restored);assert.equal(restored.mode,'body');assert.deepEqual(restored.enemies,s.enemies);assert.equal(restored.distance,s.distance);assert.deepEqual(restored.mutations,s.mutations);
});
test('invalid, old and corrupted saves are rejected',()=>{
  assert.equal(decode('bad'),null);assert.equal(decode('{"version":1}'),null);
  for(const patch of [{health:-1},{growth:-2},{distance:999},{mode:'unknown'},{mutations:['unknown']},{unlocked:['curl','curl']},{enemies:[{kind:'wolf'}]},{seed:null}])assert.equal(decode(JSON.stringify({...createState(),...patch})),null);
});
test('all three intended builds can reach a camp; seeded long runs remain bounded',()=>{
  const builds: MutationId[][]=[['curl','wide-jaw','tentacle'],['tongue','spring-jaw','heavy-neck'],['heavy-horn','heavy-neck','elastic-scale']];
  for(const mutations of builds){const s=running();s.mutations=mutations;s.unlocked=MUTATIONS.map(m=>m.id);advance(s,450);assert.equal(s.mode,'camp',`${mutations.join(',')} reached ${s.distance} m (${s.mode})`);assert.equal(s.checkpoint,300);assert(s.enemies.length<=110);assert(Number.isFinite(s.health));}
});

test('branches reject incompatible purchases and deep mutations require their parent',()=>{
  const s=running();s.mode='body';s.growth=200;
  assert(!mutate(s,'ram-horn'));assert(mutate(s,'heavy-horn'));assert(!mutate(s,'branch'));assert(mutate(s,'ram-horn'));
  assert(!mutate(s,'spring-jaw'));assert(mutate(s,'tongue'));assert(mutate(s,'barbed-tongue'));
  assert(mutate(s,'fast'));assert(!mutate(s,'heavy-neck'));
  const reverse=running();reverse.mode='body';reverse.growth=100;assert(mutate(reverse,'branch'));assert(!mutate(reverse,'heavy-horn'));
});
test('battle feedback describes real targets and distinguishes collision from scale rebound',()=>{
  const horn=running();horn.mutations=['heavy-horn'];horn.bite=horn.sweep=10;const victim=spawnEnemy(horn,'boar',130,28);victim.vy=-12;advance(horn,.2);
  assert(horn.effects.some(e=>e.type==='sweep'&&e.source==='heavy-horn'&&e.targetId===victim.id));
  assert(!horn.effects.some(e=>e.type==='pull'));
  const bite=running();bite.bite=0;bite.sweep=10;const target=spawnEnemy(bite,'boar',0,8);step(bite,.05);
  assert(bite.effects.some(e=>e.type==='bite'&&e.targetId===target.id&&e.strength===39));assert.equal(target.maxHp,88);assert(target.hpTime>0);
  const rebound=running();rebound.mutations=['elastic-scale'];rebound.bite=rebound.sweep=10;const fast=spawnEnemy(rebound,'wolf',100,0);fast.vy=-20;step(rebound,.05);
  assert(rebound.effects.some(e=>e.type==='rebound'&&e.source==='elastic-scale'));assert(!rebound.effects.some(e=>e.type==='collision'));
  const collision=running();collision.bite=collision.sweep=10;const a=spawnEnemy(collision,'boar',0,30),b=spawnEnemy(collision,'boar',0,35);a.vy=30;b.vy=-4;step(collision,.05);
  assert(collision.effects.some(e=>e.type==='collision'&&e.targetId&&e.otherId&&e.strength!>0));
});
test('expensive deep mutations change damage, reach and push rather than only their labels',()=>{
  const base=running(),deep=running();base.mutations=['wide-jaw'];deep.mutations=['wide-jaw','crusher'];base.bite=deep.bite=0;base.sweep=deep.sweep=10;
  const a=spawnEnemy(base,'boar',0,8),b=spawnEnemy(deep,'boar',0,8);step(base,.05);step(deep,.05);assert.equal(a.hp-b.hp,20);assert(deep.bite>base.bite);
  const short=running(),long=running();short.mutations=['tentacle'];long.mutations=['tentacle','long-tentacle'];short.bite=long.bite=short.sweep=long.sweep=10;
  const ea=spawnEnemy(short,'boar',140,70),eb=spawnEnemy(long,'boar',140,70);step(short,.05);step(long,.05);assert.equal(eb.vx,ea.vx);assert.equal(eb.vx,0);assert(long.effects.some(f=>f.source==='tentacle'&&!f.attached));advance(short,.8);advance(long,.8);assert(eb.vx<ea.vx);assert(eb.y<ea.y);
  const light=running(),heavy=running();light.mutations=['heavy-horn'];heavy.mutations=['heavy-horn','ram-horn'];light.bite=heavy.bite=10;light.sweep=heavy.sweep=10;
  const el=spawnEnemy(light,'boar',160,39),eh=spawnEnemy(heavy,'boar',160,39);el.vy=eh.vy=-20;step(light,.05);step(heavy,.05);assert(eh.hp<el.hp);assert(eh.vy>el.vy);
});
test('previous v2 saves migrate enemy HP capacity without changing current HP or legacy builds',()=>{
  const s=running();s.mutations=['heavy-horn','branch'];spawnEnemy(s,'boar',0,20);
  const legacy=JSON.parse(encode(s));delete legacy.enemies[0].maxHp;delete legacy.enemies[0].hpTime;
  const restored=decode(JSON.stringify(legacy));assert(restored);assert.equal(restored.enemies[0].maxHp,88);assert.equal(restored.enemies[0].hp,88);assert.deepEqual(restored.mutations,s.mutations);
  const bad=JSON.parse(encode(s));bad.enemies[0].maxHp=900;assert.equal(decode(JSON.stringify(bad)),null);
});


test('horn shapes, extra branches and jaw outlines determine contact rather than a target count or rectangular aura',()=>{
  assert(!hornShapes([]).some(shape=>shapeContact({x:0,y:-70},8,shape)));
  assert(!shapeContact({x:128,y:-46},2,jawShape(['wide-jaw'])));
  assert(shapeContact({x:105,y:-32},10,jawShape(['wide-jaw'])));
  assert(!shapeContact({x:105,y:-32},10,jawShape([])));
  const s=running();s.mutations=['branch'];s.bite=s.sweep=10;
  const e=spawnEnemy(s,'boar',0,24);step(s,.05);assert.equal(e.hp,e.maxHp);assert.equal(e.vx,0);
  assert.equal(hornShapes(['branch','crown']).length,6);
});
test('organs extend without remote force, catch with a physical tip, and keep the hook on the captured body',()=>{
  for(const mutations of [['tongue'],['tentacle']] as MutationId[][]) {
    const s=running();s.mutations=mutations;s.bite=s.sweep=10;s.organ=0;
    const e=spawnEnemy(s,'boar',mutations[0]==='tongue'?0:140,50);
    step(s,.05);assert.equal(e.vx,0);assert.equal(e.vy,-e.speed);
    assert(s.effects.some(f=>f.type==='pull'&&!f.attached));
    advance(s,.9);const f=s.effects.find(f=>f.type==='pull'&&f.attached);assert(f);
    const tip=organTip(f,s);assert.equal(tip.x,e.x);assert.equal(tip.y,-(e.y-s.distance)*4);assert(e.y<45);
  }
});
test('an organ tip that misses a moving target never pulls it',()=>{
  const s=running();s.mutations=['tongue'];s.organ=0;s.bite=s.sweep=10;
  const e=spawnEnemy(s,'boar',0,70);e.vx=350;advance(s,.65);
  assert(s.effects.some(f=>f.type==='pull'&&!f.attached));assert.equal(e.vy,-e.speed);
});
test('extra tentacles are distinct material arms with at most one capture per arm',()=>{
  const s=running();s.mutations=['tentacle','long-tentacle','double-tentacle'];s.bite=s.sweep=10;
  for(const side of [-1,1])for(const x of [110,160])spawnEnemy(s,'boar',side*x,60);
  step(s,.05);const arms=s.effects.filter(f=>f.type==='pull');assert.equal(arms.length,4);
  // A cast reserves its target so two physical arms cannot aim for the same body.
  assert.equal(new Set(arms.map(f=>f.targetId)).size,4);
  s.mode='body';const before=JSON.stringify(s.effects);advance(s,10);assert.equal(JSON.stringify(s.effects),before);
});
