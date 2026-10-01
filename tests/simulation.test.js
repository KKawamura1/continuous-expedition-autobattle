import test from 'node:test';
import assert from 'node:assert/strict';
import { buy, createGame, pause, refundAtCamp, resume, retreat, step, validateSave, CAMP_INTERVAL, STEP } from '../src/simulation.js';

function run(s, seconds) {
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
  const loaded = validateSave(JSON.parse(JSON.stringify(s)));
  assert.ok(loaded.paused);
  assert.equal(loaded.distance, s.distance);
  assert.equal(loaded.coins, s.coins);
  const before = loaded.time; step(loaded);
  assert.equal(loaded.time, before);
  assert.equal(validateSave({ version: 1, distance: 9 }), null);
});
