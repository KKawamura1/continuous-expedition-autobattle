import test from 'node:test';
import assert from 'node:assert/strict';
import { buy, createGame, pause, refundAtCamp, resume, retreat, step, CAMP_INTERVAL, DOWNED_RETREAT_DISTANCE, ENEMY_ATTACK_RANGE, ENEMY_NOTICE_RANGE, ENEMY_KIND_SHARES, INJURY_RETREAT_DISTANCE, MAX_RANGE_RETREAT_SPEED, MAX_SQUAD_RETREAT_SPEED, NAGI_GUARD_RADIUS, PASSIVE_RECOVERY_PER_SECOND, RECOVERY_SECONDS, RETREAT_DECAY_RATE, RETREAT_RISE_RATE, REVIVE_HP_RATIO, SPAWN_LEAD_UNITS, STEP, UNALERTED_ENEMY_SPEED_RATIO, advanceEncounterField, calculateFrontline, enemyDensity, updateFrontline, WORLD_ORIGIN_Y, METRES_PER_UNIT, CAMERA_FRONT_Y } from '../src/simulation.ts';
import { decodeSave, encodeSave, validateSave } from '../src/save.ts';
import type { AllyState, EnemyState, GameState } from '../src/types.ts';
import { ENEMY_KINDS } from '../src/content.ts';

const ENEMY_KIND_IDS = ['stray', 'runner', 'heavy', 'swarm'] as const;

function disableSpawning(s: GameState): void {
  s.enemies = [];
  for (const id of ENEMY_KIND_IDS) s.nextSpawnExposure[id] = Number.MAX_VALUE / 4;
}

function run(s: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP) && !s.paused; i++) step(s, STEP);
}

function runUntilCamp(s: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    if (s.pauseReason === 'danger') resume(s);
    if (s.paused) return;
    step(s, STEP);
    if (s.pauseReason === 'camp' || s.pauseReason === 'collapse') return;
  }
}

function runAutonomously(s: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    if (s.paused) {
      if (s.pauseReason === 'danger' || s.pauseReason === 'camp') resume(s);
      else return;
    }
    step(s, STEP);
  }
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

test('the squad reaches its first camp and upgrades help handle the denser next region', () => {
  const baseline = createGame(194);
  resume(baseline); runUntilCamp(baseline, 300);
  assert.equal(baseline.pauseReason, 'camp');
  assert.ok(baseline.distance >= CAMP_INTERVAL && baseline.distance < CAMP_INTERVAL + 1);

  const modified = createGame(194);
  resume(modified); run(modified, 45);
  pause(modified);
  modified.coins += 500;
  const before = modified.coins;
  assert.equal(buy(modified, 'cleave'), true);
  assert.ok(modified.coins < before);
  resume(modified); runUntilCamp(modified, 300);
  assert.equal(modified.pauseReason, 'camp');
  assert.ok(modified.distance >= CAMP_INTERVAL && modified.distance < CAMP_INTERVAL + 1);

  const defensive = createGame(194);
  resume(defensive); run(defensive, 45); pause(defensive);
  defensive.coins += 500;
  assert.equal(buy(defensive, 'counter'), true);
  assert.equal(buy(defensive, 'barrier'), true);
  resume(defensive); runUntilCamp(defensive, 300);
  assert.equal(defensive.pauseReason, 'camp');
  assert.equal(defensive.upgrades.counter, 1);
});

test('a first-camp damage package extends distance across several seeds', () => {
  for (const seed of [1, 2, 3]) {
    const baseline = createGame(seed);
    resume(baseline); runAutonomously(baseline, 1200);

    const upgraded = createGame(seed);
    resume(upgraded); runUntilCamp(upgraded, 500);
    assert.equal(upgraded.pauseReason, 'camp');
    for (const id of ['cleave', 'chain', 'arc', 'rapid', 'rapid', 'rapid']) {
      assert.equal(buy(upgraded, id), true, `seed ${seed} can afford the staged ${id} package at its first camp`);
    }
    resume(upgraded); runAutonomously(upgraded, 1200 - upgraded.time);
    assert.ok(upgraded.best > baseline.best + 100,
      `seed ${seed}: first-camp damage upgrades extend best distance by more than 100m`);
  }
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
  disableSpawning(s);
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
  disableSpawning(loaded);
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
  disableSpawning(moving);
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
  disableSpawning(holding);
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

test('frontliners keep their ground near an enemy while a downed teammate slowly raises squad retreat pressure', () => {
  const steady = createGame();
  const recovering = createGame();
  const wounded = createGame();
  for (const s of [steady, recovering, wounded]) {
    disableSpawning(s);
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
  assert.ok(steadyGou.y < .72, 'Gou closes to his usual preferred range');
  assert.ok(retreatingGou.y < .72, 'a nearby enemy does not make Gou flee, even while Nagi recovers');
  assert.ok(woundedGou.y < .72, 'low health alone does not make a frontliner kite away');
  assert.ok(recovering.retreatBias > steady.retreatBias, 'a casualty gradually raises team-level pressure');
  assert.ok(retreatingGou.y > steadyGou.y, 'team-level pressure slightly checks Gou’s forward movement');
  assert.equal(DOWNED_RETREAT_DISTANCE, .08);
  assert.equal(INJURY_RETREAT_DISTANCE, .18);
});

test('actual time-based recovery offsets damage and affects front movement', () => {
  const recovering = createGame();
  disableSpawning(recovering);
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
  disableSpawning(pressured);
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
    disableSpawning(state);
    state.rates = { kills: 0, damage: 2, recovery: .5, income: 0 };
    resume(state);
  }
  sameBalanceWithKills.rates.kills = 10;
  step(nonlethalPressure, STEP); step(sameBalanceWithKills, STEP);
  assert.equal(sameBalanceWithKills.velocity, nonlethalPressure.velocity, 'kills do not directly affect front speed');

  const sustainedLoss = createGame();
  disableSpawning(sustainedLoss);
  sustainedLoss.rates = { kills: 10, damage: 20, recovery: 0, income: 0 };
  resume(sustainedLoss);
  run(sustainedLoss, 2.1);
  assert.ok(sustainedLoss.velocity < 0, 'sustained net loss turns the front backward');

  const safeAdvance = createGame();
  disableSpawning(safeAdvance);
  resume(safeAdvance);
  step(safeAdvance, STEP);
  assert.ok(safeAdvance.velocity > 0, 'the squad advances while it takes no damage');
});

test('enemies attack only allies in range and Nagi guards only a nearby front-side ally', () => {
  const s = createGame();
  disableSpawning(s);
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
  disableSpawning(s);
  s.enemies = [staticEnemy(.52, .48)];
  const gou = s.allies.find(ally => ally.id === 'gou')!;
  down(gou, 50);
  for (const ally of s.allies) if (ally !== gou) ally.cooldown = 100;
  const enemyHp = s.enemies[0].hp;
  resume(s);
  run(s, .25);
  assert.equal(s.enemies[0].hp, enemyHp);

  const recovery = createGame();
  disableSpawning(recovery);
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
  disableSpawning(holdingFront);
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
  disableSpawning(s);
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
  disableSpawning(s);
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
  assert.equal(migrated?.version, 5);
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
  assert.equal(migratedV2?.version, 5);
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
  disableSpawning(s);
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
  disableSpawning(s);
  s.enemies = [];
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
  const s = createGame(); disableSpawning(s);
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

test('the opening visible field follows spatial density and relative movement drives new encounters', () => {
  const samples = Array.from({ length: 250 }, (_, seed) => createGame(seed + 1));
  const averageOpeningCount = samples.reduce((sum, s) => sum + s.enemies.length, 0) / samples.length;
  assert.ok(averageOpeningCount > 2.7 && averageOpeningCount < 3.8,
    '16m × 0.20 enemies/m produces about 3.2 visible enemies on average');
  for (const s of samples) {
    assert.ok(s.enemies.every(e => e.y <= s.frontline && e.y >= s.frontline - CAMERA_FRONT_Y),
      'the initial Poisson field occupies only the visible forward region');
  }

  const stopped = createGame(194);
  const totalExposure = () => ENEMY_KIND_IDS.reduce((sum, id) => sum + stopped.spawnExposure[id], 0);
  const spawnY = stopped.allies.reduce((front, a) => Math.min(front, a.y), Infinity) - CAMERA_FRONT_Y - SPAWN_LEAD_UNITS;
  const density = enemyDensity((WORLD_ORIGIN_Y - spawnY) * METRES_PER_UNIT);
  const expectedHazardRate = (forwardMps: number) => density * ENEMY_KINDS.reduce((sum, kind) =>
    sum + ENEMY_KIND_SHARES[kind.id] * Math.max(0,
      forwardMps + kind.speed * UNALERTED_ENEMY_SPEED_RATIO * METRES_PER_UNIT), 0);
  const beforeStop = totalExposure();
  advanceEncounterField(stopped, 1, 0);
  const stoppedExposure = totalExposure() - beforeStop;
  assert.ok(Math.abs(stoppedExposure - expectedHazardRate(0)) < 1e-9,
    'stationary flow is density multiplied by the enemies’ own weighted approach speed');

  const beforeAdvance = totalExposure();
  advanceEncounterField(stopped, 1, 1.4);
  const advanceExposure = totalExposure() - beforeAdvance;
  assert.ok(Math.abs(advanceExposure - expectedHazardRate(1.4)) < 1e-9,
    'forward flow adds allied movement to each enemy type’s approach speed');

  const beforeRetreat = totalExposure();
  advanceEncounterField(stopped, 1, -1.0);
  const retreatExposure = totalExposure() - beforeRetreat;
  assert.ok(retreatExposure < stoppedExposure, 'retreat reduces new encounter flow while faster runners can still arrive');
  assert.ok(ENEMY_KIND_IDS.every(id => stopped.spawnExposure[id] >= 0), 'cumulative exposure never reverses');

  const existing = stopped.enemies[0];
  const saved = { id: existing.id, hp: existing.hp, y: existing.y };
  for (const ally of stopped.allies) ally.y += .5;
  advanceEncounterField(stopped, 2, -1.4);
  assert.ok(stopped.enemies.some(e => e.id === saved.id && e.hp === saved.hp),
    'backing away does not erase an already materialized enemy');
  const ids = stopped.enemies.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'retreat and renewed movement never duplicate enemy IDs');
});

test('new enemies materialize beyond the screen and enter it by moving at their own speed', () => {
  const s = createGame(7);
  disableSpawning(s);
  s.nextSpawnExposure.stray = s.spawnExposure.stray + .0001;
  advanceEncounterField(s, STEP, 0);
  const e = s.enemies[s.enemies.length - 1];
  assert.equal(e.kind, 'stray');
  assert.ok(e.y < s.cameraY - SPAWN_LEAD_UNITS + .001);
  assert.ok(e.y < s.cameraY - .1, 'the materialized enemy starts outside the visible top edge');
  const from = e.y;
  e.y += e.speed * UNALERTED_ENEMY_SPEED_RATIO * 5;
  assert.ok(e.y > from && e.y > s.cameraY - .1, 'the enemy moves into the viewport after materialization');
});

test('density, kind mix, base HP and smooth depth scaling use the requested starting values', () => {
  assert.equal(enemyDensity(0), .20);
  assert.ok(Math.abs(enemyDensity(300) - .2201) < 1e-9);
  assert.ok(Math.abs(enemyDensity(600) - .2402) < 1e-9);
  assert.ok(Math.abs(enemyDensity(900) - .2603) < 1e-9);
  assert.equal(enemyDensity(1200), .28);
  assert.deepEqual(ENEMY_KIND_SHARES, { stray: .5, runner: .2, heavy: .1, swarm: .2 });
  assert.deepEqual(ENEMY_KINDS.map(kind => [kind.id, kind.hp]), [
    ['stray', 70], ['runner', 45], ['heavy', 180], ['swarm', 40]
  ]);

  const s = createGame(194);
  disableSpawning(s);
  for (const ally of s.allies) ally.y -= 600 / METRES_PER_UNIT;
  s.nextSpawnExposure.stray = s.spawnExposure.stray + .0001;
  advanceEncounterField(s, STEP, 0);
  const spawned = s.enemies[s.enemies.length - 1];
  const depth = (WORLD_ORIGIN_Y - spawned.y) * METRES_PER_UNIT;
  assert.ok(Math.abs(spawned.maxHp - 70 * (1 + depth / 1200)) < 1e-8);
  assert.ok(Math.abs(spawned.damage - 5 * (1 + depth / 1300)) < 1e-8,
    'enemy attack scaling remains unchanged');
});

test('maximum collective retreat is independent of normal movement speed', () => {
  const s = createGame(); disableSpawning(s);
  s.rates.damage = 6;
  for (const [i, ally] of s.allies.entries()) { ally.x = .3 + i * .1; ally.y = .7; }
  s.retreatBias = 1;
  const positions = s.allies.map(a => a.y);
  resume(s); step(s);
  for (const [i, ally] of s.allies.entries()) {
    const backwardSpeed = (ally.y - positions[i]) / STEP;
    assert.ok(backwardSpeed > 0 && backwardSpeed <= MAX_SQUAD_RETREAT_SPEED + .001,
      'the shared retreat push stays near its dedicated speed cap');
  }
  assert.equal(MAX_SQUAD_RETREAT_SPEED, .035);
  assert.equal(RETREAT_RISE_RATE, 1.5);
  assert.equal(RETREAT_DECAY_RATE, .5);

  const marching = createGame(); disableSpawning(marching);
  resume(marching); run(marching, 40);
  const spread = Math.max(...marching.allies.map(a => a.y)) - Math.min(...marching.allies.map(a => a.y));
  assert.ok(spread < .6, 'the fastest ally cannot leave the backline far behind');
});

test('a pressured frontliner retreats slower than a heavy and faster enemies close the gap', () => {
  const separationAfter = (enemySpeed: number): number => {
    const s = createGame(); disableSpawning(s);
    const gou = s.allies.find(a => a.id === 'gou')!;
    gou.x = .5; gou.y = .7; gou.cooldown = 100;
    for (const ally of s.allies) if (ally !== gou) down(ally, 100);
    s.enemies = [{ ...staticEnemy(.5, -.1), speed: enemySpeed, alerted: true }];
    s.rates.damage = 6;
    s.retreatBias = 1;
    resume(s); run(s, .5);
    return Math.hypot(gou.x - s.enemies[0].x, gou.y - s.enemies[0].y);
  };
  const initialGap = .8;
  assert.ok(separationAfter(.031) > initialGap, 'heavy falls slightly farther behind the retreat');
  const strayGap = separationAfter(.048);
  const swarmGap = separationAfter(.056);
  const runnerGap = separationAfter(.081);
  assert.ok(strayGap < initialGap && swarmGap < strayGap && runnerGap < swarmGap,
    'stray, swarm, and runner catch the squad at progressively higher speeds');
});

test('an enemy behind the squad raises persistent retreat pressure and remains on the frontline', () => {
  const s = createGame(); disableSpawning(s);
  const intruder = staticEnemy(.5, 1.0);
  const ahead = { ...staticEnemy(.5, .2), id: 2 };
  s.enemies = [intruder, ahead];
  for (const a of s.allies) a.cooldown = 100;
  resume(s); run(s, 3);
  assert.ok(s.retreatBias > .5, 'an enemy behind the squad gradually raises the penetration response');
  assert.equal(s.frontline, intruder.y);
});

test('frontliners hold too-close enemies, ranged allies keep range and Hibana retreats at half strength', () => {
  const centerMember = (s: GameState, id: AllyState['id']): AllyState => {
    const target = s.allies.find(a => a.id === id)!;
    const otherX = [.32, .41, .59, .68];
    let otherIndex = 0;
    s.allies.forEach(ally => {
      ally.x = ally === target ? .5 : otherX[otherIndex++];
      ally.y = .7;
      ally.cooldown = 100;
    });
    return target;
  };
  const stationaryFrontliner = (id: 'gou' | 'nagi') => {
    const s = createGame(); disableSpawning(s);
    const ally = centerMember(s, id);
    s.enemies = [staticEnemy(.5, .65)];
    const before = ally.y;
    resume(s); step(s);
    return ally.y - before;
  };
  assert.ok(stationaryFrontliner('gou') < .0001, 'Gou does not backpedal inside preferred range');
  assert.ok(stationaryFrontliner('nagi') < .0001, 'Nagi does not backpedal inside preferred range');

  const rangedRetreatSpeed = (id: 'tsugumi' | 'genzou') => {
    const s = createGame(); disableSpawning(s);
    const ally = centerMember(s, id);
    s.enemies = [staticEnemy(.5, .65)];
    const before = ally.y;
    resume(s); step(s);
    return (ally.y - before) / STEP;
  };
  for (const id of ['tsugumi', 'genzou'] as const) {
    const retreatSpeed = rangedRetreatSpeed(id);
    assert.ok(retreatSpeed > 0, `${id} backs away to restore preferred range`);
    assert.ok(retreatSpeed <= MAX_RANGE_RETREAT_SPEED + .001, `${id} cannot kite at normal movement speed`);
  }

  const hibana = createGame(); disableSpawning(hibana);
  const fast = centerMember(hibana, 'hibana');
  hibana.enemies = [staticEnemy(.5, .55)];
  const before = fast.y;
  resume(hibana); step(hibana);
  const retreatSpeed = (fast.y - before) / STEP;
  assert.ok(retreatSpeed > .08 && retreatSpeed < .10,
    'Hibana retreats at about half of the former .18 units/second response');
});

test('enemy inflow retains unalerted approach speed and alerted pursuit at the notice threshold', () => {
  const s = createGame(); disableSpawning(s);
  const enemy = { ...staticEnemy(.5, -.5), speed: .048, alerted: false };
  s.enemies = [enemy];
  const before = enemy.y;
  resume(s); run(s, .5);
  assert.ok(enemy.y > before, 'unalerted enemies advance toward the squad through the world');
  assert.ok(Math.abs((enemy.y - before) / .5 - enemy.speed * UNALERTED_ENEMY_SPEED_RATIO) < .002);
  assert.equal(ENEMY_NOTICE_RANGE, .70);
  assert.equal(enemy.alerted, false, 'an enemy beyond notice range remains unalerted while advancing');

  const noticed = createGame(); disableSpawning(noticed);
  const pursuing = { ...staticEnemy(.5, .1), speed: .048, alerted: false };
  noticed.enemies = [pursuing];
  resume(noticed); run(noticed, 3);
  assert.equal(pursuing.alerted, true, 'the enemy switches to sticky two-dimensional pursuit inside notice range');
});

test('local protection and counterattack still work at arbitrary world depth', () => {
  const s = createGame(); disableSpawning(s); s.camp = 300; s.peakSinceCamp = 300;
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
  assert.equal(restored.version, 5);
  assert.equal(restored.distance, 145);
  assert.ok(Math.abs(restored.allies[0].y - restored.enemies[0].y - .17) < 1e-8);
  assert.ok(Math.abs((WORLD_ORIGIN_Y - calculateFrontline(restored)) * METRES_PER_UNIT - 145) < 1e-8);
  const saved = decodeSave(encodeSave(restored))!;
  assert.deepEqual(saved.spawnExposure, restored.spawnExposure);
  assert.deepEqual(saved.nextSpawnExposure, restored.nextSpawnExposure);
  assert.equal(saved.frontline, restored.frontline);
  assert.deepEqual(saved.enemies, restored.enemies);
});

test('v4 migration discards untouched regional pre-generation and keeps the nearest combatants', () => {
  const old = JSON.parse(encodeSave(createGame(42))) as Record<string, unknown>;
  old.version = 4;
  delete old.spawnExposure;
  delete old.nextSpawnExposure;
  old.generatedTo = -1;
  const template = { ...staticEnemy(.5, .7), speed: .048, alerted: false };
  old.enemies = Array.from({ length: 200 }, (_, i) => ({ ...template, id: i + 1, y: .7 - i * .004 }));
  const restored = validateSave(old)!;
  assert.ok(restored);
  assert.equal(restored.version, 5);
  assert.equal(restored.enemies.length, 16);
  assert.ok(restored.enemies.every(e => Number.isFinite(e.hp)));
  assert.ok(restored.nextSpawnExposure.stray > restored.spawnExposure.stray);
});


test('a whole squad knocked out in one frame collapses with a loadable finite world', () => {
  const s = createGame(); disableSpawning(s);
  for (const [i, a] of s.allies.entries()) {
    a.x = .1 + i * .18; a.y = .8; a.hp = 1;
    s.enemies.push({ ...staticEnemy(a.x, .75, 1000, 0), id: i + 1 });
  }
  s.enemies.sort((a, b) => Math.abs(a.x - s.allies[1].x) - Math.abs(b.x - s.allies[1].x));
  resume(s); step(s);
  assert.equal(s.pauseReason, 'collapse');
  assert.ok(s.allies.every(a => a.status === 'downed'));
  assert.ok(Number.isFinite(s.retreatBias));
  assert.ok(decodeSave(encodeSave(s)));
});


test('an unupgraded expedition measures spatial movement, retreats and re-encounters persistent enemies', () => {
  const s = createGame(194); resume(s);
  let advances = 0, retreats = 0;
  for (let i = 0; i < 1200 / STEP; i++) {
    const previousDistance = s.distance;
    step(s);
    assert.ok(Math.abs(s.distance - (WORLD_ORIGIN_Y - calculateFrontline(s)) * METRES_PER_UNIT) < 1e-8);
    if (!s.paused) assert.ok(Math.abs(s.velocity - (s.distance - previousDistance) / STEP) < 1e-8);
    if (s.velocity > .5) advances++;
    if (s.velocity < -.5) retreats++;
    if (s.paused && (s.pauseReason === 'camp' || s.pauseReason === 'danger')) resume(s);
    else if (s.paused) break;
  }
  assert.ok(advances > 100 && retreats > 100);
  assert.ok(s.best >= CAMP_INTERVAL && s.best < CAMP_INTERVAL * 3,
    'the unupgraded seed reaches the first camp and slows after entering the denser territory');
  const restored = decodeSave(encodeSave(s))!;
  assert.ok(restored);
  assert.deepEqual(restored.enemies, s.enemies);

  const persistent = createGame(100);
  disableSpawning(persistent);
  for (const ally of persistent.allies) ally.cooldown = 100;
  const enemy = { ...staticEnemy(.5, .2), id: 999, alerted: true };
  persistent.enemies = [enemy];
  resume(persistent);
  run(persistent, 4);
  const nearestDistance = () => Math.min(...persistent.allies.map(a => Math.hypot(a.x - enemy.x, a.y - enemy.y)));
  const approached = nearestDistance();
  for (let i = 0; i < 4 / STEP; i++) { persistent.retreatBias = 1; step(persistent); }
  const separated = nearestDistance();
  assert.ok(separated > approached, 'the team can move away from an existing enemy');
  assert.ok(persistent.enemies.some(e => e.id === enemy.id), 'the enemy remains in world state while offscreen');
  persistent.retreatBias = 0;
  run(persistent, 6);
  assert.ok(nearestDistance() < separated, 'the team can encounter that same enemy again after advancing');
});

test('several long no-upgrade runs stall in the intended range without hundreds of enemies', () => {
  const results: Array<{ best: number; maxEnemies: number; maxNear: number; reachedAt: number | null }> = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = createGame(seed); resume(s);
    let maxEnemies = s.enemies.length, maxNear = 0, reachedAt: number | null = null;
    for (let i = 0; i < 3600 / STEP; i++) {
      if (s.paused) {
        if (s.pauseReason === 'camp' || s.pauseReason === 'danger') resume(s);
        else break;
      }
      step(s, STEP);
      maxEnemies = Math.max(maxEnemies, s.enemies.length);
      const near = s.enemies.filter(e => s.allies.some(a => a.status === 'active' && Math.hypot(a.x - e.x, a.y - e.y) < .5)).length;
      maxNear = Math.max(maxNear, near);
      if (reachedAt === null && s.best >= CAMP_INTERVAL) reachedAt = s.time;
    }
    results.push({ best: s.best, maxEnemies, maxNear, reachedAt });
  }
  assert.ok(results.every(result => result.reachedAt !== null && result.reachedAt < 360),
    'all five seeds reach 300m within six simulated minutes');
  assert.ok(results.every(result => result.best >= 600 && result.best < 1200),
    'after 3600s, every unupgraded seed has entered the denser bands but none reaches the density cap');
  assert.ok(Math.max(...results.map(result => result.maxEnemies)) < 40,
    'pressure develops without large pre-generated crowds');
  assert.ok(Math.max(...results.map(result => result.maxNear)) >= 8,
    'overloaded periods are visible as a larger nearby crowd');
});
