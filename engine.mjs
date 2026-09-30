export const WEEKDAYS = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'];
export const MAX_DAILY = 8;
export const MAX_WEEKLY = 100;
export const RESOURCE_COST = 50000;
export const TIER_LABELS = ['I', 'II', 'III', 'IV', 'V'];
export const TIER_COSTS = [20, 50, 100, 130, 160];
export const DISTRIBUTIONS = [
  [[1, 65], [2, 25], [3, 10]],
  [[2, 85], [3, 15]],
  [[3, 85], [4, 12.5], [5, 2], [6, 0.5]],
  [[3, 75], [4, 15], [5, 5], [6, 3], [7, 1], [8, 0.5], [9, 0.5]],
  [[3, 70], [4, 12], [5, 9], [6, 4], [7, 1.5], [8, 1], [9, 1], [10, 0.5], [11, 0.5], [12, 0.5]],
];
export const CRYSTAL_DISTRIBUTION = [[1, 40], [2, 30], [3, 15], [4, 10], [5, 5]];

export function tierIndex(weeklyCount) {
  return Math.min(4, Math.floor(weeklyCount / 20));
}
export function remainingInTier(weeklyCount) {
  return Math.min(20 - (weeklyCount % 20), MAX_WEEKLY - weeklyCount);
}
export function sample(table, random = Math.random) {
  const roll = random() * 100;
  let cumulative = 0;
  for (const [value, chance] of table) {
    cumulative += chance;
    if (roll < cumulative) return value;
  }
  return table.at(-1)[0];
}
export function batchCost(weeklyCount, count, firstToday) {
  const cost = TIER_COSTS[tierIndex(weeklyCount)];
  return cost * count - (firstToday ? cost / 2 : 0);
}
export function plannedCost(counts) {
  let weeklyCount = 0;
  let total = 0;
  const days = [];
  for (const count of counts) {
    let dailyCost = 0;
    for (let i = 0; i < count; i++) {
      const cost = TIER_COSTS[tierIndex(weeklyCount)];
      dailyCost += i === 0 ? cost / 2 : cost;
      weeklyCount++;
    }
    days.push(dailyCost);
    total += dailyCost;
  }
  return { total, days };
}
export function simulateQuick(initialCrystals, counts, random = Math.random) {
  if (!Number.isSafeInteger(initialCrystals) || initialCrystals < 0) return { error: '開始火晶は0以上の整数で入力してください' };
  if (counts.length !== 7 || counts.some(count => !Number.isSafeInteger(count) || count < 0 || count > 100)) return { error: '各曜日の回数は0〜100の整数で入力してください' };
  if (counts.reduce((sum, count) => sum + count, 0) > MAX_WEEKLY) return { error: 'スーパー精錬は週100回までです' };
  const required = plannedCost(counts);
  if (initialCrystals < required.total) return { error: `火晶が${(required.total - initialCrystals).toLocaleString('ja-JP')}個足りません`, required: required.total };
  let crystals = initialCrystals;
  let refined = 0;
  let weeklyCount = 0;
  const days = counts.map((count, dayIndex) => {
    let spent = 0;
    let gained = 0;
    const rewards = [];
    for (let i = 0; i < count; i++) {
      const tier = tierIndex(weeklyCount);
      const cost = TIER_COSTS[tier] / (i === 0 ? 2 : 1);
      const reward = sample(DISTRIBUTIONS[tier], random);
      crystals -= cost;
      refined += reward;
      spent += cost;
      gained += reward;
      rewards.push(reward);
      weeklyCount++;
    }
    return { dayIndex, count, spent, gained, crystals, refined, rewards };
  });
  return { days, crystals, refined, weeklyCount, spent: required.total, initialCrystals };
}
