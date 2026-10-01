import test from 'node:test';
import assert from 'node:assert/strict';
import { buy, createGame, pause, refundAtCamp, resume, retreat, step, CAMP_INTERVAL, DOWNED_RETREAT_DISTANCE, ENEMY_ATTACK_RANGE, INJURY_RETREAT_DISTANCE, NAGI_GUARD_RADIUS, PASSIVE_RECOVERY_PER_SECOND, RECOVERY_SECONDS, REVIVE_HP_RATIO, STEP, calculateFrontline, updateFrontline, generateAhead, WORLD_ORIGIN_Y, METRES_PER_UNIT, CAMERA_FRONT_Y } from '../src/simulation.ts';
import { decodeSave, encodeSave, validateSave } from '../src/save.ts';
import type { AllyState, EnemyState, GameState } from '../src/types.ts';

function run(s: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP) && !s.paused; i++) step(s, STEP);
}

function setProgress(s: GameState, distance: number): void {
  const shift = WORLD_ORIGIN_Y - distance / METRES_PER_UNIT - calculateFrontline(s);
  for (const a of s.allies) a.y += shift;
  for (const e of s.enemies) e.y += shift;
  s.frontline = calculateFrontline(s);
  s.distance = distance;
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

test('the autonomous squad reaches a camp, while an observed crowd can still be answered with cleave', () => {
  const baseline = createGame(194);
  resume(baseline); run(baseline, 140);
  assert.equal(baseline.pauseReason, 'camp');
  assert.ok(baseline.distance >= CAMP_INTERVAL && baseline.distance < CAMP_INTERVAL + 1);

  const modified = createGame(194);
  resume(modified); run(modified, 45);
  const before = modified.coins;
  pause(modified);
  assert.equal(buy(modified, 'cleave'), true);
  assert.ok(modified.coins < before);
  resume(modified); run(modified, 100);
  assert.equal(modified.pauseReason, 'camp');
  assert.ok(modified.distance >= CAMP_INTERVAL && modified.distance < CAMP_INTERVAL + 1);

  const defensive = createGame(194);
  resume(defensive); run(defensive, 45); pause(defensive);
  assert.equal(buy(defensive, 'counter'), true);
  assert.equal(buy(defensive, 'barrier'), true);
  resume(defensive); run(defensive, 100);
  assert.equal(defensive.pauseReason, 'camp');
  assert.equal(defensive.upgrades.counter, 1);
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
  s.comparison = { kills: 1, damage: 2, recovery: 0, income: 3, velocity: 4, time: 5, name: 'test' };
  const serialized = encodeSave(s);
  const persisted = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal(Object.hasOwn(persisted, 'effects'), false);
  assert.equal(Object.hasOwn(persisted, 'comparison'), false);

  const loaded = decodeSave(serialized);
  if (!loaded) throw new Error('Expected the saved state to be valid.');
  assert.ok(loaded.paused);
  assert.equal(loaded.distance, s.distance);
  assert.equal(loaded.coins, s.coins);
  assert.equal(loaded.rates.recovery, s.rates.recovery);
  assert.deepEqual(loaded.effects, []);
  assert.equal(loaded.comparison, null);
  const before = loaded.time; step(loaded);
  assert.equal(loaded.time, before);
  assert.equal(decodeSave('{invalid json'), null);
  assert.equal(validateSave({ version: 1, distance: 9 }), null);
});

test('resuming from danger continues through the same danger episode', () => {
  const s = createGame(194);
  s.distance = 66;
  s.best = 66;
  s.peakSinceCamp = 66;
  s.generatedTo = -1e6;
  const exposed = s.allies.find(ally => ally.id === 'hibana')!;
  exposed.hp = 1;
  s.enemies = [staticEnemy(exposed.x, exposed.y - .09, 10, 0)];
  resume(s);
  step(s);
  assert.equal(s.pauseReason, 'danger');

  // Older saves do not carry the acknowledgement flag; infer it from the saved danger stop.
  const oldSave = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  delete oldSave.dangerAcknowledged;
  const loaded = validateSave(oldSave);
  if (!loaded) throw new Error('Expected the danger save to be valid.');
  assert.equal(loaded.dangerAcknowledged, true);

  // Keep this acknowledgement test focused on the pause state, without the old run's crowded front.
  loaded.enemies = [];
  loaded.generatedTo = -1e6;
  setProgress(loaded, loaded.camp + 10);
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
  setProgress(loaded, loaded.camp + 20);
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
  moving.generatedTo = -1e6;
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
  holding.generatedTo = -1e6;
  holding.enemies = [staticEnemy(.42, .54)];
  const holdingGou = holding.allies.find(ally => ally.id === 'gou')!;
  holdingGou.y = .69;
  holding.allies = [holdingGou];
  const before = { x: holdingGou.x, y: holdingGou.y };
  resume(holding);
  run(holding, 4);
  assert.ok(Math.hypot(holdingGou.x - before.x, holdingGou.y - before.y) < .002,
    'an ally at its preferred range should not oscillate in and out');
});

test('a downed teammate makes survivors hold a wider distance and retreat from nearby enemies', () => {
  const steady = createGame();
  const recovering = createGame();
  const wounded = createGame();
  for (const s of [steady, recovering, wounded]) {
    s.generatedTo = -1e6;
    s.enemies = [staticEnemy(.05, .53, 0, 100)];
    const gou = s.allies.find(ally => ally.id === 'gou')!;
    gou.x = .05;
    gou.y = .72;
    for (const ally of s.allies) {
      if (ally.id === 'gou') continue;
      ally.x = .92;
      ally.y = .94;
    }
  }
  down(recovering.allies.find(ally => ally.id === 'nagi')!, 20);
  const woundedGou = wounded.allies.find(ally => ally.id === 'gou')!;
  woundedGou.hp = woundedGou.maxHp * REVIVE_HP_RATIO;
  resume(steady); resume(recovering); resume(wounded);
  run(steady, .25); run(recovering, .25); run(wounded, .25);

  const steadyGou = steady.allies.find(ally => ally.id === 'gou')!;
  const retreatingGou = recovering.allies.find(ally => ally.id === 'gou')!;
  assert.ok(steadyGou.y < .72, 'without a casualty, Gou closes to his usual preferred range');
  assert.ok(retreatingGou.y > .72, 'while Nagi recovers, Gou backs away to buy time');
  assert.ok(woundedGou.y > .72, 'a low-health ally holds a safer range after returning');
  assert.ok(Math.hypot(retreatingGou.x - .05, retreatingGou.y - .53)
    > Math.hypot(steadyGou.x - .05, steadyGou.y - .53));
  assert.equal(DOWNED_RETREAT_DISTANCE, .08);
  assert.equal(INJURY_RETREAT_DISTANCE, .18);
});

test('actual time-based recovery offsets damage and affects front movement', () => {
  const recovering = createGame();
  recovering.generatedTo = -1e6;
  const wounded = recovering.allies.find(ally => ally.id === 'gou')!;
  wounded.hp = 50;
  resume(recovering);
  run(recovering, 6);
  assert.ok(wounded.hp > 50, 'active allies recover HP over time');
  assert.ok(wounded.hp <= wounded.maxHp);
  assert.ok(recovering.rates.recovery > 0, 'the observed rate includes actual HP restored');
  assert.ok(recovering.rates.recovery > recovering.rates.damage);
  assert.ok(recovering.velocity > 0, 'a net recovery period nudges the front forward');
  assert.equal(PASSIVE_RECOVERY_PER_SECOND, .45);

  const pressured = createGame();
  pressured.generatedTo = -1e6;
  pressured.enemies = [staticEnemy(.42, .72, 30, 0)];
  const gou = pressured.allies.find(ally => ally.id === 'gou')!;
  for (const ally of pressured.allies) if (ally.id !== 'gou') down(ally, 100);
  gou.x = .42; gou.y = .8;
  resume(pressured);
  run(pressured, 2.1);
  assert.ok(pressured.rates.damage > pressured.rates.recovery, 'HP loss can outpace automatic recovery');
  assert.ok(pressured.velocity < recovering.velocity, 'net HP loss slows the front relative to net recovery');

  const nonlethalPressure = createGame();
  const sameBalanceWithKills = createGame();
  for (const state of [nonlethalPressure, sameBalanceWithKills]) {
    state.generatedTo = -1e6;
    state.rates = { kills: 0, damage: 2, recovery: .5, income: 0 };
    resume(state);
  }
  sameBalanceWithKills.rates.kills = 10;
  step(nonlethalPressure, STEP); step(sameBalanceWithKills, STEP);
  assert.equal(sameBalanceWithKills.velocity, nonlethalPressure.velocity, 'kills do not directly affect front speed');

  const sustainedLoss = createGame();
  sustainedLoss.generatedTo = -1e6;
  sustainedLoss.rates = { kills: 10, damage: 20, recovery: 0, income: 0 };
  resume(sustainedLoss);
  run(sustainedLoss, 2.1);
  assert.ok(sustainedLoss.velocity < 0, 'sustained net loss turns the front backward');

  const safeAdvance = createGame();
  safeAdvance.generatedTo = -1e6;
  resume(safeAdvance);
  step(safeAdvance, STEP);
  assert.ok(safeAdvance.velocity > 0, 'the squad advances while it takes no damage');
});

test('enemies attack only allies in range and Nagi guards only a nearby front-side ally', () => {
  const s = createGame();
  s.generatedTo = -1e6;
  s.enemies = [staticEnemy(.42, .72, 10, 0)];
  const gou = s.allies.find(ally => ally.id === 'gou')!;
  for (const ally of s.allies) if (ally.id !== 'gou') down(ally, 100);
  gou.x = .92; gou.y = .94;
  resume(s);
  step(s, STEP);
  assert.equal(gou.hp, gou.maxHp, 'a distant ally is not a valid attack target');
  assert.equal(s.enemies[0].attackCd, .12, 'an enemy retries soon when nobody is in reach');

  gou.x = .42; gou.y = .8;
  s.enemies[0].attackCd = 0;
  step(s, STEP);
  assert.equal(gou.hp, gou.maxHp - 10, 'an ally inside the attack radius can be hit');
  assert.equal(ENEMY_ATTACK_RANGE, .19);

  const guarded = createGame();
  guarded.spawnIn = 100;
  guarded.enemies = [staticEnemy(.42, .72, 10, 0)];
  const guardedGou = guarded.allies.find(ally => ally.id === 'gou')!;
  const guardedNagi = guarded.allies.find(ally => ally.id === 'nagi')!;
  for (const ally of guarded.allies) if (ally.id !== 'gou' && ally.id !== 'nagi') down(ally, 100);
  guardedGou.x = .42; guardedGou.y = .8;
  guardedNagi.x = .67; guardedNagi.y = .79;
  resume(guarded); step(guarded, STEP);
  assert.equal(guardedGou.hp, guardedGou.maxHp, 'Nagi intercepts from within the local guard link');
  assert.equal(guardedNagi.hp, guardedNagi.maxHp - 10);
  assert.ok(Math.hypot(guardedNagi.x - .42, guardedNagi.y - .72) <= NAGI_GUARD_RADIUS);
  assert.ok(Math.hypot(guardedNagi.x - guardedGou.x, guardedNagi.y - guardedGou.y) <= NAGI_GUARD_RADIUS);

  const uncovered = createGame();
  uncovered.spawnIn = 100;
  uncovered.enemies = [staticEnemy(.42, .72, 10, 0)];
  const exposedGou = uncovered.allies.find(ally => ally.id === 'gou')!;
  const farNagi = uncovered.allies.find(ally => ally.id === 'nagi')!;
  for (const ally of uncovered.allies) if (ally.id !== 'gou' && ally.id !== 'nagi') down(ally, 100);
  exposedGou.x = .42; exposedGou.y = .8;
  farNagi.x = .9; farNagi.y = .94;
  resume(uncovered); step(uncovered, STEP);
  assert.equal(exposedGou.hp, exposedGou.maxHp - 10, 'distant Nagi cannot redirect the attack');
  assert.equal(farNagi.hp, farNagi.maxHp);
});

test('a downed ally cannot attack and returns after the recovery timer', () => {
  const s = createGame();
  s.generatedTo = -1e6;
  s.enemies = [staticEnemy(.52, .48)];
  const gou = s.allies.find(ally => ally.id === 'gou')!;
  down(gou, 50);
  for (const ally of s.allies) if (ally !== gou) ally.cooldown = 100;
  const enemyHp = s.enemies[0].hp;
  resume(s);
  run(s, .25);
  assert.equal(s.enemies[0].hp, enemyHp);

  const recovery = createGame();
  recovery.generatedTo = -1e6;
  const recovering = recovery.allies.find(ally => ally.id === 'hibana')!;
  down(recovering);
  resume(recovery);
  run(recovery, RECOVERY_SECONDS - .2);
  assert.equal(recovering.status, 'downed');
  assert.ok(recovering.reviveIn > 0 && recovering.reviveIn <= .25);
  run(recovery, .3);
  assert.equal(recovering.status, 'active');
  assert.equal(recovering.reviveIn, 0);
  assert.ok(recovering.hp >= recovering.maxHp * REVIVE_HP_RATIO);
  assert.ok(recovering.hp < recovering.maxHp * (REVIVE_HP_RATIO + .01));
  assert.ok(recovering.y > Math.min(...recovery.allies.filter(a => a !== recovering).map(a => a.y)), 'a returning teammate enters behind the active squad');

  const holdingFront = createGame();
  holdingFront.generatedTo = -1e6;
  holdingFront.enemies = [
    staticEnemy(.37, .72, 3, 0), staticEnemy(.47, .72, 3, .2), staticEnemy(.57, .72, 3, .4),
    staticEnemy(.67, .72, 3, .6), staticEnemy(.77, .72, 3, .8)
  ];
  const returning = holdingFront.allies.find(ally => ally.id === 'genzou')!;
  down(returning);
  resume(holdingFront);
  run(holdingFront, RECOVERY_SECONDS + .2);
  assert.equal(returning.status, 'active', 'the remaining four should hold the line until a teammate returns');
  assert.ok(returning.hp >= returning.maxHp * REVIVE_HP_RATIO);
  assert.ok(returning.hp < returning.maxHp * (REVIVE_HP_RATIO + .01));
  assert.ok(holdingFront.allies.filter(ally => ally.status === 'active').length >= 4);
});

test('an attack starts the visible 9.5 second recovery timer', () => {
  const s = createGame();
  s.generatedTo = -1e6;
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
  s.generatedTo = -1e6;
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
  assert.equal(migrated?.version, 4);
  assert.equal(migrated?.allies[1].status, 'downed');
  assert.equal(migrated?.allies[1].reviveIn, RECOVERY_SECONDS);

  const preRecoveryRates = JSON.parse(JSON.stringify(createGame())) as Record<string, unknown>;
  delete (preRecoveryRates.rates as Record<string, unknown>).recovery;
  delete (preRecoveryRates.stats as Record<string, unknown>).recovery;
  const migratedRates = validateSave(preRecoveryRates);
  assert.equal(migratedRates?.rates.recovery, 0);
  assert.equal(migratedRates?.stats.recovery, 0);

  const versionTwo = JSON.parse(JSON.stringify(createGame())) as Record<string, unknown>;
  versionTwo.version = 2;
  delete versionTwo.peakSinceCamp;
  versionTwo.distance = 74;
  versionTwo.best = 160;
  const migratedV2 = validateSave(versionTwo);
  assert.equal(migratedV2?.version, 4);
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


test('world frontline is the rearward of the leading ally and the deepest surviving enemy', () => {
  const s = createGame();
  s.generatedTo = -1e6;
  s.allies[0].y = -2;
  s.enemies = [staticEnemy(.1, -1), { ...staticEnemy(.9, -3), id: 2 }];
  assert.equal(calculateFrontline(s), -1);
  s.enemies[0].hp = 0;
  assert.equal(calculateFrontline(s), -2);
  s.enemies = [];
  assert.equal(calculateFrontline(s), -2);
  down(s.allies[0]);
  assert.equal(calculateFrontline(s), .79);
});

test('progress and measured speed come only from world displacement and camera follows with lag', () => {
  const s = createGame();
  s.generatedTo = -1e6;
  const before = s.frontline;
  for (const a of s.allies) a.y -= .1;
  const camera = s.cameraY;
  updateFrontline(s, .5);
  assert.ok(Math.abs(s.distance - 4) < 1e-8);
  assert.ok(Math.abs(s.velocity - 8) < 1e-8);
  assert.ok(s.cameraY < camera && s.cameraY > s.frontline - CAMERA_FRONT_Y);
  assert.equal(s.frontline, before - .1);
  for (const a of s.allies) a.y += .2;
  updateFrontline(s, .5);
  assert.ok(s.velocity < 0 && s.distance < 0);
});

test('edge enemies pursue in two dimensions, retarget casualties and can cross the old screen limits', () => {
  const s = createGame(); s.generatedTo = -1e6;
  const e = { ...staticEnemy(.05, .9), speed: .08, alerted: true };
  s.enemies = [e];
  for (const a of s.allies) { a.x = .7; a.y = 1.15; a.cooldown = 100; }
  resume(s); run(s, 1);
  assert.ok(e.x > .05 && e.y > .9);
  const nearest = s.allies.reduce((a, b) => Math.hypot(a.x - e.x, a.y - e.y) < Math.hypot(b.x - e.x, b.y - e.y) ? a : b);
  down(nearest, 100);
  const beforeX = e.x; run(s, .5);
  assert.ok(e.x > beforeX, 'pursuit continues toward another active ally');
  assert.ok(s.allies.filter(a => a.status === 'active').every(a => a.y > .94));
});

test('an untouched region waits offscreen, waiting adds no enemies and retreat retains their IDs and HP', () => {
  const s = createGame(); generateAhead(s);
  const original = s.enemies.map(e => ({ id: e.id, hp: e.hp, y: e.y }));
  const frontier = s.generatedTo;
  assert.ok(s.enemies.some(e => e.y - s.cameraY < 0 && !e.alerted));
  for (let i = 0; i < 100; i++) generateAhead(s);
  assert.deepEqual(s.enemies.map(e => ({ id: e.id, hp: e.hp, y: e.y })), original);
  s.frontline += .5; s.cameraY += .5; generateAhead(s);
  assert.equal(s.generatedTo, frontier);
  assert.deepEqual(s.enemies.map(e => ({ id: e.id, hp: e.hp, y: e.y })), original);
  s.frontline -= 2; s.cameraY -= 2; generateAhead(s);
  assert.ok(s.generatedTo < frontier && s.enemies.length > original.length);
  assert.deepEqual(s.enemies.slice(0, original.length).map(e => ({ id: e.id, hp: e.hp, y: e.y })), original);
});

test('collective pressure retreats every active ally and cohesion bounds a long unopposed march', () => {
  const s = createGame(); s.generatedTo = -1e6;
  s.rates.damage = 24;
  s.retreatBias = 1;
  const positions = s.allies.map(a => a.y);
  resume(s); run(s, .5);
  assert.ok(s.allies.every((a, i) => a.y > positions[i]));
  assert.ok(s.velocity < 0);
  const marching = createGame(); marching.generatedTo = -1e6;
  resume(marching); run(marching, 40);
  const spread = Math.max(...marching.allies.map(a => a.y)) - Math.min(...marching.allies.map(a => a.y));
  assert.ok(spread < .6, 'the fastest ally cannot leave the backline far behind');
});

test('a rearward intruder is intercepted rather than left behind while marching forward', () => {
  const s = createGame(); s.generatedTo = -1e6;
  const intruder = staticEnemy(.5, 1.0);
  const ahead = { ...staticEnemy(.5, .2), id: 2 };
  s.enemies = [intruder, ahead];
  for (const a of s.allies) a.cooldown = 100;
  const before = s.allies.map(a => a.y);
  resume(s); run(s, 1);
  assert.ok(s.allies.every((a, i) => a.y > before[i]));
  assert.equal(s.frontline, intruder.y);
});

test('local protection and counterattack still work at arbitrary world depth', () => {
  const s = createGame(); s.generatedTo = -1e6; s.camp = 300; s.peakSinceCamp = 300;
  const gou = s.allies[0], nagi = s.allies[1];
  gou.x = .42; gou.y = -10;
  nagi.x = .52; nagi.y = -10.04;
  for (const a of s.allies.slice(2)) { a.y = -9.5; a.cooldown = 100; }
  s.enemies = [staticEnemy(.42, -10.1, 10, 0)];
  s.upgrades.counter = 1;
  resume(s); step(s);
  assert.equal(gou.hp, gou.maxHp);
  assert.equal(nagi.hp, nagi.maxHp - 10);
  assert.equal(s.stats.counter, 1);
});

test('v3 migration translates the battle without changing relative spacing or saved distance', () => {
  const old = JSON.parse(encodeSave(createGame()));
  old.version = 3; old.distance = 145; old.best = 145; old.peakSinceCamp = 145;
  old.enemies = [staticEnemy(.3, .6)];
  const restored = validateSave(old)!;
  assert.ok(restored);
  assert.equal(restored.version, 4);
  assert.equal(restored.distance, 145);
  assert.ok(Math.abs(restored.allies[0].y - restored.enemies[0].y - .17) < 1e-8);
  assert.ok(Math.abs((WORLD_ORIGIN_Y - calculateFrontline(restored)) * METRES_PER_UNIT - 145) < 1e-8);
  const saved = decodeSave(encodeSave(restored))!;
  assert.equal(saved.generatedTo, restored.generatedTo);
  assert.equal(saved.frontline, restored.frontline);
  assert.deepEqual(saved.enemies, restored.enemies);
});
