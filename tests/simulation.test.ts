import test from 'node:test';
import assert from 'node:assert/strict';
import { buy, createGame, pause, refundAtCamp, resume, retreat, step, CAMP_INTERVAL, STEP } from '../src/simulation.ts';
import { decodeSave, encodeSave, validateSave } from '../src/save.ts';
import type { GameState } from '../src/types.ts';

function run(s: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP) && !s.paused; i++) step(s, STEP);
}

test('unmodified expedition stalls, while an observed crowd can be answered with cleave', () => {
  const baseline = createGame(194);
  resume(baseline); run(baseline, 140);
  assert.equal(baseline.pauseReason, 'danger');
  assert.ok(baseline.distance < CAMP_INTERVAL);

  const modified = createGame(194);
  resume(modified); run(modified, 45);
  const before = modified.coins;
  pause(modified);
  assert.equal(buy(modified, 'cleave'), true);
  assert.ok(modified.coins < before);
  resume(modified); run(modified, 100);
  assert.equal(modified.pauseReason, 'camp');
  assert.equal(modified.distance, CAMP_INTERVAL);

  const defensive = createGame(194);
  resume(defensive); run(defensive, 45); pause(defensive);
  assert.equal(buy(defensive, 'counter'), true);
  assert.equal(buy(defensive, 'barrier'), true);
  resume(defensive); run(defensive, 100);
  assert.equal(defensive.pauseReason, 'camp');
  assert.ok(defensive.stats.counter > 0);
});

test('a purchase requires pause and refunds only at a reached camp', () => {
  const s = createGame(); s.coins = 500;
  assert.equal(refundAtCamp(s), false);
  resume(s);
  assert.equal(buy(s, 'hook'), false);
  pause(s);
  assert.equal(buy(s, 'hook'), true);
  assert.equal(buy(s, 'hook'), false);
  assert.equal(refundAtCamp(s), false);
  s.distance = s.camp = CAMP_INTERVAL; s.pauseReason = 'camp';
  const budget = s.coins + s.spent;
  assert.equal(refundAtCamp(s), true);
  assert.equal(s.coins, budget);
  assert.deepEqual(s.upgrades, {});
  assert.equal(buy(s, 'chain'), true);
  const saved = { coins: s.coins, spent: s.spent, upgrades: { ...s.upgrades } };
  resume(s);
  s.coins += 99; s.upgrades.shock = 1;
  pause(s);
  assert.equal(retreat(s), true);
  assert.equal(s.distance, CAMP_INTERVAL);
  assert.equal(s.coins, saved.coins);
  assert.equal(s.spent, saved.spent);
  assert.deepEqual(s.upgrades, saved.upgrades);
});

test('saved state reloads paused, preserving expedition progress', () => {
  const s = createGame(); resume(s); run(s, 20);
  s.effects.push({ x: .2, y: .3, toX: .4, toY: .5, color: '#fff', kind: 'line', life: .2 });
  s.comparison = { kills: 1, damage: 2, income: 3, velocity: 4, time: 5, name: 'test' };
  const serialized = encodeSave(s);
  const persisted = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal(Object.hasOwn(persisted, 'effects'), false);
  assert.equal(Object.hasOwn(persisted, 'comparison'), false);

  const loaded = decodeSave(serialized);
  if (!loaded) throw new Error('Expected the saved state to be valid.');
  assert.ok(loaded.paused);
  assert.equal(loaded.distance, s.distance);
  assert.equal(loaded.coins, s.coins);
  assert.deepEqual(loaded.effects, []);
  assert.equal(loaded.comparison, null);
  const before = loaded.time; step(loaded);
  assert.equal(loaded.time, before);
  assert.equal(decodeSave('{invalid json'), null);
  assert.equal(validateSave({ version: 1, distance: 9 }), null);
});

test('resuming from danger continues through the same danger episode', () => {
  const s = createGame(194);
  resume(s);
  run(s, 140);
  assert.equal(s.pauseReason, 'danger');

  // Older saves do not carry the acknowledgement flag; infer it from the saved danger stop.
  const oldSave = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  delete oldSave.dangerAcknowledged;
  const loaded = validateSave(oldSave);
  if (!loaded) throw new Error('Expected the danger save to be valid.');
  assert.equal(loaded.dangerAcknowledged, true);

  const previousTime = loaded.time;
  resume(loaded);
  run(loaded, 1);
  assert.equal(loaded.paused, false);
  assert.equal(loaded.pauseReason, null);
  assert.ok(loaded.time > previousTime);

  // Once the party and front leave the danger condition, a later danger can pause again.
  loaded.distance = loaded.camp + 20;
  for (const ally of loaded.allies) ally.hp = ally.maxHp;
  step(loaded);
  assert.equal(loaded.dangerAcknowledged, false);
  loaded.distance = loaded.camp + 17;
  for (const ally of loaded.allies) ally.hp = 0;
  step(loaded);
  assert.equal(loaded.paused, true);
  assert.equal(loaded.pauseReason, 'danger');
});

test('save validation restores enemy kinds from earlier saves and rejects broken state', () => {
  const oldSave = JSON.parse(JSON.stringify(createGame()));
  oldSave.enemies = [{
    id: 1, name: '重殻体', hp: 50, maxHp: 83, speed: .031, damage: 9, mass: 2.6, pressure: 2.3,
    bounty: 29, radius: .041, color: '#ad9dc0', x: .5, y: .1, vy: 0, attackCd: 1, flash: 0
  }];
  const restored = validateSave(oldSave);
  assert.equal(restored?.enemies[0]?.kind, 'heavy');
  assert.equal(restored?.enemies[0]?.impactCd, 0);

  oldSave.upgrades = null;
  assert.equal(validateSave(oldSave), null);
});
