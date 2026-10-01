import test from 'node:test';
import assert from 'node:assert/strict';
import { buy, createGame, pause, refundAtCamp, resume, retreat, step, validateSave, CAMP_INTERVAL, RECOVERY_SECONDS, REVIVE_HP_RATIO, STEP } from '../src/simulation.ts';
import type { AllyState, EnemyState, GameState } from '../src/types.ts';

function run(s: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP) && !s.paused; i++) step(s, STEP);
}

function staticEnemy(x: number, y: number, damage = 0, attackCd = 100): EnemyState {
  return {
    id: 1, kind: 'stray', name: '徘徊体', hp: 1000, maxHp: 1000, speed: 0, damage, mass: 1,
    pressure: 1, bounty: 13, radius: .026, color: '#d49c82', x, y, vy: 0, attackCd, flash: 0, impactCd: 0
  };
}

function down(ally: AllyState, reviveIn = RECOVERY_SECONDS): void {
  ally.hp = 0;
  ally.status = 'downed';
  ally.reviveIn = reviveIn;
  ally.shield = 0;
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
  if (!loaded) throw new Error('Expected the saved state to be valid.');
  assert.ok(loaded.paused);
  assert.equal(loaded.distance, s.distance);
  assert.equal(loaded.coins, s.coins);
  const before = loaded.time; step(loaded);
  assert.equal(loaded.time, before);
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

  // Keep this acknowledgement test focused on the pause state, without the old run's crowded front.
  loaded.enemies = [];
  loaded.spawnIn = 100;
  loaded.distance = loaded.camp + 10;
  loaded.best = loaded.camp + 100;
  loaded.velocity = 0;
  for (const ally of loaded.allies) { ally.hp = ally.maxHp; ally.status = 'active'; ally.reviveIn = 0; }

  const previousTime = loaded.time;
  resume(loaded);
  run(loaded, 1);
  assert.equal(loaded.paused, false);
  assert.equal(loaded.pauseReason, null);
  assert.ok(loaded.time > previousTime);

  // Once the party and front leave the danger condition, a later danger can pause again.
  loaded.distance = loaded.camp + 20;
  for (const ally of loaded.allies) { ally.hp = ally.maxHp; ally.status = 'active'; ally.reviveIn = 0; }
  step(loaded);
  assert.equal(loaded.dangerAcknowledged, false);
  for (const ally of loaded.allies) down(ally);
  loaded.paused = false;
  loaded.pauseReason = null;
  loaded.dangerAcknowledged = true;
  step(loaded);
  assert.equal(loaded.paused, true);
  assert.equal(loaded.pauseReason, 'collapse');
  assert.equal(resume(loaded), false);
  assert.equal(loaded.pauseReason, 'collapse');
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

test('allies move toward targets while close range preferences hold formation', () => {
  const moving = createGame();
  moving.spawnIn = 100;
  moving.enemies = [staticEnemy(.88, .48)];
  resume(moving);
  run(moving, 2);

  const gou = moving.allies.find(ally => ally.id === 'gou')!;
  const tsugumi = moving.allies.find(ally => ally.id === 'tsugumi')!;
  assert.ok(gou.x > .5, 'Gou should follow a target to the right');
  assert.ok(gou.y < .7, 'Gou should move forward toward a target');
  assert.ok(Math.hypot(gou.x - .88, gou.y - .48) < Math.hypot(tsugumi.x - .88, tsugumi.y - .48) - .2,
    'the melee frontliner should close more than the ranged supporter');
  for (let i = 0; i < moving.allies.length; i++) for (let j = i + 1; j < moving.allies.length; j++) {
    assert.ok(Math.hypot(moving.allies[i].x - moving.allies[j].x, moving.allies[i].y - moving.allies[j].y) > .06,
      'allies should stay visibly separated');
  }

  const holding = createGame();
  holding.spawnIn = 100;
  holding.enemies = [staticEnemy(.42, .62)];
  const holdingGou = holding.allies.find(ally => ally.id === 'gou')!;
  for (const ally of holding.allies) if (ally.id !== 'gou') down(ally, 50);
  const before = { x: holdingGou.x, y: holdingGou.y };
  resume(holding);
  run(holding, 4);
  assert.ok(Math.hypot(holdingGou.x - before.x, holdingGou.y - before.y) < .002,
    'an ally at its preferred range should not oscillate in and out');
});

test('a downed ally cannot attack and returns after the recovery timer', () => {
  const s = createGame();
  s.spawnIn = 100;
  s.enemies = [staticEnemy(.52, .48)];
  const gou = s.allies.find(ally => ally.id === 'gou')!;
  down(gou, 50);
  for (const ally of s.allies) if (ally !== gou) ally.cooldown = 100;
  const enemyHp = s.enemies[0].hp;
  resume(s);
  run(s, .25);
  assert.equal(s.enemies[0].hp, enemyHp);

  const recovery = createGame();
  recovery.spawnIn = 100;
  const recovering = recovery.allies.find(ally => ally.id === 'hibana')!;
  down(recovering);
  resume(recovery);
  run(recovery, RECOVERY_SECONDS - .2);
  assert.equal(recovering.status, 'downed');
  assert.ok(recovering.reviveIn > 0 && recovering.reviveIn <= .25);
  run(recovery, .3);
  assert.equal(recovering.status, 'active');
  assert.equal(recovering.reviveIn, 0);
  assert.equal(recovering.hp, recovering.maxHp * REVIVE_HP_RATIO);
  assert.equal(recovering.x, .23);
  assert.equal(recovering.y, .8);

  const holdingFront = createGame();
  holdingFront.spawnIn = 100;
  holdingFront.enemies = [
    staticEnemy(.37, .72, 3, 0), staticEnemy(.47, .72, 3, .2), staticEnemy(.57, .72, 3, .4),
    staticEnemy(.67, .72, 3, .6), staticEnemy(.77, .72, 3, .8)
  ];
  const returning = holdingFront.allies.find(ally => ally.id === 'genzou')!;
  down(returning);
  resume(holdingFront);
  run(holdingFront, RECOVERY_SECONDS + .2);
  assert.equal(returning.status, 'active', 'the remaining four should hold the line until a teammate returns');
  assert.equal(returning.hp, returning.maxHp * REVIVE_HP_RATIO);
  assert.ok(holdingFront.allies.filter(ally => ally.status === 'active').length >= 4);
});

test('an attack starts the visible 9.5 second recovery timer', () => {
  const s = createGame();
  s.spawnIn = 100;
  const hibana = s.allies.find(ally => ally.id === 'hibana')!;
  hibana.hp = 1;
  s.enemies = [staticEnemy(.23, .71, 10, 0)];
  resume(s);
  step(s, STEP);
  assert.equal(hibana.status, 'downed');
  assert.equal(hibana.hp, 0);
  assert.equal(hibana.reviveIn, RECOVERY_SECONDS);
});

test('the first knockout pauses a proven run early enough to adjust, then resumes normally', () => {
  const s = createGame();
  s.distance = 66;
  s.best = 66;
  s.peakSinceCamp = 66;
  s.enemies = [staticEnemy(.23, .71, 10, 0)];
  const hibana = s.allies.find(ally => ally.id === 'hibana')!;
  hibana.hp = 1;
  resume(s);
  step(s, STEP);

  assert.equal(hibana.status, 'downed');
  assert.equal(s.pauseReason, 'danger');
  assert.equal(s.paused, true);
  assert.equal(s.allies.filter(ally => ally.status === 'downed').length, 1);

  resume(s);
  run(s, 1);
  assert.equal(s.paused, false, 'one knockout should not cause repeated pauses in the same danger episode');
  assert.equal(s.pauseReason, null);
  assert.ok(hibana.reviveIn < RECOVERY_SECONDS);
});

test('collapse ignores danger acknowledgement and retreat restores the saved camp state', () => {
  for (const acknowledged of [false, true]) {
    const s = createGame();
    s.paused = false;
    s.pauseReason = null;
    s.dangerAcknowledged = acknowledged;
    for (const ally of s.allies) down(ally);
    const before = s.time;
    step(s, STEP);
    assert.equal(s.pauseReason, 'collapse');
    assert.equal(s.paused, true);
    assert.equal(s.time, before);
    assert.equal(resume(s), false);
    step(s, STEP);
    assert.equal(s.time, before, 'simulation must stay frozen until retreat');
  }

  const s = createGame();
  s.camp = 90;
  s.distance = 160;
  s.best = 180;
  s.peakSinceCamp = 160;
  s.coins = 90;
  s.spent = 35;
  s.upgrades.hook = 1;
  s.campSnapshot = { camp: 90, coins: 70, spent: 20, upgrades: { hook: 1 }, earnings: 120, kills: 8 };
  for (const ally of s.allies) down(ally);
  s.paused = true;
  s.pauseReason = 'collapse';
  assert.equal(retreat(s), true);
  assert.equal(s.pauseReason, 'camp');
  assert.equal(s.distance, 90);
  assert.equal(s.peakSinceCamp, 90);
  assert.equal(s.best, 180, 'retreat preserves the all-time high distance');
  assert.equal(s.coins, 70);
  assert.equal(s.spent, 20);
  assert.deepEqual(s.upgrades, { hook: 1 });
  assert.ok(s.allies.every(ally => ally.status === 'active' && ally.hp === ally.maxHp));
  s.spawnIn = 100;
  resume(s);
  step(s, STEP);
  assert.equal(s.pauseReason, null, 'old high-water progress must not immediately stop a new attempt');
  assert.equal(s.paused, false);
});

test('manual pause and resume still freeze and restart the simulation', () => {
  const s = createGame();
  resume(s);
  run(s, 2);
  pause(s);
  const pausedAt = s.time;
  assert.equal(s.pauseReason, 'manual');
  assert.equal(resume(s), true);
  run(s, 1);
  assert.ok(s.time > pausedAt);
  assert.equal(s.pauseReason, null);
});

test('save validation migrates older saves and preserves recovery, collapse, and current-run peak', () => {
  const legacy = JSON.parse(JSON.stringify(createGame())) as Record<string, unknown>;
  legacy.version = 1;
  const oldAllies = legacy.allies as Array<Record<string, unknown>>;
  oldAllies[1].hp = 0;
  for (const ally of oldAllies) { delete ally.status; delete ally.reviveIn; }
  const migrated = validateSave(legacy);
  assert.equal(migrated?.version, 3);
  assert.equal(migrated?.allies[1].status, 'downed');
  assert.equal(migrated?.allies[1].reviveIn, RECOVERY_SECONDS);

  const versionTwo = JSON.parse(JSON.stringify(createGame())) as Record<string, unknown>;
  versionTwo.version = 2;
  delete versionTwo.peakSinceCamp;
  versionTwo.distance = 74;
  versionTwo.best = 160;
  const migratedV2 = validateSave(versionTwo);
  assert.equal(migratedV2?.version, 3);
  assert.equal(migratedV2?.peakSinceCamp, 74);

  const downedSave = createGame();
  down(downedSave.allies[0], 3.25);
  const loaded = validateSave(JSON.parse(JSON.stringify(downedSave)));
  assert.equal(loaded?.allies[0].status, 'downed');
  assert.equal(loaded?.allies[0].reviveIn, 3.25);

  for (const ally of downedSave.allies) down(ally, 7);
  downedSave.paused = true;
  downedSave.pauseReason = 'collapse';
  const collapsed = validateSave(JSON.parse(JSON.stringify(downedSave)));
  assert.equal(collapsed?.pauseReason, 'collapse');
  assert.equal(collapsed?.paused, true);
  assert.equal(collapsed?.peakSinceCamp, 0);
  const invalid = JSON.parse(JSON.stringify(downedSave)) as GameState;
  invalid.allies[0].reviveIn = -1;
  assert.equal(validateSave(invalid), null);
});
