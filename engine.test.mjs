import test from 'node:test';
import assert from 'node:assert/strict';
import { DISTRIBUTIONS, CRYSTAL_DISTRIBUTION, TIER_COSTS, tierIndex, remainingInTier, batchCost, plannedCost, simulateQuick } from './engine.mjs';

test('probability tables each total 100%', () => {
  for (const table of [...DISTRIBUTIONS, CRYSTAL_DISTRIBUTION]) {
    assert.equal(table.reduce((sum, [, chance]) => sum + chance, 0), 100);
  }
});
test('tier boundaries and daily half cost', () => {
  assert.equal(tierIndex(19), 0);
  assert.equal(tierIndex(20), 1);
  assert.equal(tierIndex(40), 2);
  assert.equal(remainingInTier(15), 5);
  assert.equal(remainingInTier(100), 0);
  assert.equal(batchCost(0, 3, true), TIER_COSTS[0] * 3 - 10);
  assert.equal(batchCost(0, 3, false), TIER_COSTS[0] * 3);
});
test('quick mode applies discount once each day and changes tiers', () => {
  const counts = [20, 20, 1, 1, 0, 0, 0];
  const required = plannedCost(counts);
  assert.deepEqual(required.days, [390, 975, 50, 50, 0, 0, 0]);
  const result = simulateQuick(required.total, counts, () => 0);
  assert.equal(result.error, undefined);
  assert.equal(result.weeklyCount, 42);
  assert.equal(result.crystals, 0);
  assert.equal(result.refined, 20 + 40 + 3 + 3);
  assert.equal(result.days[2].gained, 3);
});
test('quick mode validates weekly limit and stock before drawing', () => {
  assert.match(simulateQuick(0, [20,20,20,20,21,0,0]).error, /100回/);
  assert.equal(simulateQuick(0, [1,0,0,0,0,0,0]).required, 10);
});
