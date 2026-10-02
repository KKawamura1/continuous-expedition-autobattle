import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, collide, cost, createState, depart, mutate, spawnEnemy, start, step, unlock } from '../src/simulation.ts';
import { decode, encode } from '../src/save.ts';
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
test('curled horns pull light enemies toward the jaw more than heavy ones',()=>{
  const a=running(),b=running();a.mutations=['curl'];b.mutations=['curl'];a.sweep=b.sweep=10;spawnEnemy(a,'beetle',130,20);spawnEnemy(b,'boar',130,20);advance(a,.5);advance(b,.5);assert(a.enemies[0].x<b.enemies[0].x);
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
