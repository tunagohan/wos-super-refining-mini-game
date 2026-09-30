import {
  WEEKDAYS, MAX_DAILY, MAX_WEEKLY, RESOURCE_COST, TIER_LABELS, TIER_COSTS,
  DISTRIBUTIONS, CRYSTAL_DISTRIBUTION, tierIndex, remainingInTier,
  sample, batchCost, plannedCost, simulateQuick,
} from './engine.mjs';

const STORAGE_KEY = 'super-refining-simulator-v2';
const RESOURCE_NAMES = ['肉', '木', '石炭', '鉄'];
const app = document.querySelector('#app');
let state = loadState();
let modal = null;
let quantity = 1;
let formError = '';
let toastTimer;

function newDay() { return { basicCount: 0, basicGained: 0, superCount: 0, superGained: 0, spent: 0 }; }
function initialState() {
  return {
    started: false, mode: null, initialCrystals: 0, crystals: 0, refined: 0,
    resources: [2800000, 2800000, 2800000, 2800000],
    dayIndex: 0, dailyCount: 0, weeklyCount: 0, firstSuperDay: -1,
    days: WEEKDAYS.map(newDay), history: [], quickCounts: Array(7).fill(0), quickResult: null,
  };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.days) || saved.days.length !== 7) return initialState();
    return { ...initialState(), ...saved };
  } catch { return initialState(); }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function number(value) { return value.toLocaleString('ja-JP'); }
function crystalIcon(size = 42) { return `<img class="crystal-icon item-icon" src="./assets/fire-crystal.png" width="${size}" height="${size}" alt="">`; }
function refinedIcon(size = 42) { return `<img class="refined-icon item-icon" src="./assets/refined-crystal.png" width="${size}" height="${size}" alt="">`; }
function resourceCard(index) {
  return `<div class="resource-card"><span class="resource-glyph resource-glyph-${index}" aria-hidden="true"></span><span class="resource-name">${RESOURCE_NAMES[index]}</span><strong>${number(state.resources[index])}</strong><small>必要 ${number(RESOURCE_COST)}</small></div>`;
}
function probabilityText(index) { return DISTRIBUTIONS[index].map(([value, chance]) => `${value}個 ${chance}%`).join(' ・ '); }
function renderShell(content) {
  app.innerHTML = `${content}<div id="overlay"></div><div id="toast" role="status"></div>`;
  renderModal();
}
function render() {
  if (!state.started) renderStart();
  else if (state.mode === 'quick') renderQuick();
  else renderDaily();
}
function renderStart() {
  renderShell(`<main class="game-shell start-shell">
    <header class="topbar"><div><div class="eyebrow">FIRE CRYSTAL WORKSHOP</div><h1>スーパー精錬<br><span>シミュレーター</span></h1></div><button class="icon-button" data-action="help" aria-label="遊び方">?</button></header>
    <div class="start-hero"><div class="start-crystal">${crystalIcon(100)}<span>➜</span>${refinedIcon(100)}</div><p>月曜日から日曜日まで。<br>手持ちの火晶で、どれだけ精錬火晶を作れるか試そう。</p></div>
    <section class="start-panel"><label for="initial-crystals">開始時に持っている火晶</label><div class="start-input">${crystalIcon(38)}<input id="initial-crystals" type="number" min="0" step="1" inputmode="numeric" value="${state.initialCrystals}" aria-label="開始火晶の数"><span>個</span></div><p>最初の火晶数を入力してからモードを選んでください。</p></section>
    <div class="mode-cards"><button class="mode-card" data-action="start-daily"><span class="mode-mark">01</span><b>日次モード</b><small>火晶の精錬とスーパー精錬を操作し、ボタンで翌日に進める</small><strong>月曜日から始める →</strong></button><button class="mode-card" data-action="start-quick"><span class="mode-mark">02</span><b>省略モード</b><small>各曜日のスーパー精錬回数を入力し、1週間の結果を見る</small><strong>回数を入力する →</strong></button></div>
    <p class="start-note">スーパー精錬の消費数・確率は固定です。結果は端末に保存されます。</p>
  </main>`);
}
function dailyTimeline() {
  return `<div class="weekday-strip" aria-label="曜日の進行">${WEEKDAYS.map((day,index) => `<span class="${index === state.dayIndex ? 'current' : ''} ${index < state.dayIndex ? 'past' : ''}">${day.slice(0,1)}</span>`).join('')}</div>`;
}
function daySummaryRows(days, quick = false) {
  return `<div class="day-results">${days.map((day,index) => `<div class="day-result ${!quick && index === state.dayIndex ? 'today' : ''}"><div class="day-result-name"><b>${WEEKDAYS[index]}</b>${!quick && index > state.dayIndex ? '<small>未到達</small>' : ''}</div><div class="day-result-details">${quick ? '' : `<span>火晶 +${day.basicGained} (${day.basicCount}回)</span>`}<span>スーパー精錬 ${day.superCount ?? day.count}回</span><span>火晶 −${number(day.spent)}</span><strong>精錬火晶 +${number(day.superGained ?? day.gained)}</strong></div></div>`).join('')}</div>`;
}
function renderDaily() {
  const tier = tierIndex(state.weeklyCount);
  const complete = state.weeklyCount >= MAX_WEEKLY;
  const canRefine = state.dailyCount < MAX_DAILY && state.resources.every(value => value >= RESOURCE_COST);
  const totalSpent = state.days.reduce((sum, day) => sum + day.spent, 0);
  const totalBasic = state.days.reduce((sum, day) => sum + day.basicGained, 0);
  renderShell(`<main class="game-shell">
    <header class="topbar"><div><div class="eyebrow">DAILY SIMULATION · ${state.dayIndex + 1} / 7</div><h1>スーパー精錬<br><span>シミュレーター</span></h1></div><button class="icon-button" data-action="help" aria-label="遊び方">?</button></header>
    <div class="day-banner"><div><small>現在の曜日</small><strong>${WEEKDAYS[state.dayIndex]}</strong></div>${dailyTimeline()}</div>
    <div class="inventory"><div class="inventory-chip">${crystalIcon(28)}<span>火晶</span><strong>${number(state.crystals)}</strong></div><div class="inventory-chip">${refinedIcon(28)}<span>精錬火晶</span><strong>${number(state.refined)}</strong></div></div>
    <section class="workshop upper" aria-labelledby="basic-title"><div class="section-head"><span class="step">01</span><div><p class="section-kicker">素材から火晶へ</p><h2 id="basic-title">火晶の精錬</h2></div><span class="daily-counter">本日の残り <b>${MAX_DAILY - state.dailyCount} / ${MAX_DAILY}</b></span></div>
      <div class="furnace upper-furnace"><div class="resource-grid">${[0,1].map(resourceCard).join('')}</div><div class="forge-center"><span class="pipe pipe-left"></span><div class="reactor"><div class="reactor-inner">${crystalIcon(76)}</div></div><span class="pipe pipe-right"></span></div><div class="resource-grid">${[2,3].map(resourceCard).join('')}</div></div>
      <div class="action-row"><button class="primary-button" data-action="refine" ${canRefine ? '' : 'disabled'}>火晶を精錬する <span>1〜5個</span></button></div><p class="hint">1回につき各素材50,000を消費 ・ 1日8回まで</p></section>
    <div class="flow-divider"><span>↓</span></div>
    <section class="workshop lower" aria-labelledby="super-title"><div class="section-head"><span class="step">02</span><div><p class="section-kicker">火晶から精錬火晶へ</p><h2 id="super-title">スーパー精錬 <em>${TIER_LABELS[tier]}</em></h2></div></div>
      <div class="conversion"><div class="conversion-item">${crystalIcon(58)}<span>火晶</span><strong>${complete ? '—' : number(TIER_COSTS[tier])}</strong><small>1回の消費</small></div><div class="conversion-arrow">➜</div><div class="conversion-item">${refinedIcon(58)}<span>精錬火晶</span><strong>${complete ? '—' : `${DISTRIBUTIONS[tier][0][0]}〜${DISTRIBUTIONS[tier].at(-1)[0]}`}</strong><small>1回の獲得</small></div></div>
      <div class="progress-top"><span>今週のスーパー精錬回数</span><strong>${state.weeklyCount} / ${MAX_WEEKLY}</strong></div><div class="progress-track"><div style="width:${state.weeklyCount}%"></div></div><div class="tier-track">${TIER_LABELS.map((label,index) => `<span class="${index === tier && !complete ? 'active' : ''}">${label}</span>`).join('')}</div>
      <div class="super-actions"><button class="secondary-button" data-action="multi" ${complete ? 'disabled' : ''}>スーパー精錬複数回</button><button class="primary-button" data-action="single" ${complete ? 'disabled' : ''}>スーパー精錬1回</button></div><p class="hint">毎日最初の1回は火晶消費が半分 ・ 週100回まで</p></section>
    <section class="week-report"><div class="report-heading"><span>WEEKLY RECORD</span><h2>曜日別の結果</h2></div><div class="report-totals"><div><small>火晶の獲得</small><b>+${number(totalBasic)}</b></div><div><small>火晶の消費</small><b>−${number(totalSpent)}</b></div><div><small>精錬火晶</small><b>+${number(state.refined)}</b></div></div>${daySummaryRows(state.days)}
      ${state.dayIndex < 6 ? `<button class="next-day-button" data-action="next-day">${WEEKDAYS[state.dayIndex + 1]}へ進む →</button>` : '<div class="week-finished">日曜日までのシミュレーションが完了しました</div><button class="next-day-button restart-week-button" data-action="reset">新しく始める</button>'}
    </section>
    <footer class="footer"><span>月曜〜日曜の1週間をシミュレーション中</span><div><button data-action="probabilities">確率表</button><button data-action="settings">設定</button><button data-action="history">履歴</button></div></footer>
  </main>`);
}
function renderQuick() {
  const counts = state.quickCounts;
  const total = counts.reduce((sum, count) => sum + count, 0);
  const required = total <= MAX_WEEKLY ? plannedCost(counts).total : null;
  const result = state.quickResult;
  renderShell(`<main class="game-shell quick-shell"><header class="topbar"><div><div class="eyebrow">QUICK SIMULATION</div><h1>省略モード<br><span>1週間の結果</span></h1></div><button class="icon-button" data-action="help" aria-label="遊び方">?</button></header>
    <div class="quick-intro">${crystalIcon(38)}<div><small>開始時の火晶</small><strong>${number(state.initialCrystals)} 個</strong></div><button data-action="reset">変更</button></div>
    ${result ? `<section class="quick-result"><div class="result-hero">${refinedIcon(70)}<small>獲得した精錬火晶</small><strong>+${number(result.refined)} 個</strong></div><div class="result-stats"><div><small>スーパー精錬</small><b>${result.weeklyCount} 回</b></div><div><small>火晶の消費</small><b>${number(result.spent)} 個</b></div><div><small>残りの火晶</small><b>${number(result.crystals)} 個</b></div></div><div class="report-heading"><span>DAY BY DAY</span><h2>曜日別の結果</h2></div>${daySummaryRows(result.days,true)}<button class="secondary-button wide-button" data-action="edit-quick">回数を変更する</button><button class="text-button reroll-button" data-action="simulate-quick">同じ条件でもう一度試す</button></section>` : `<section class="quick-form"><div class="report-heading"><span>PLAN YOUR WEEK</span><h2>曜日ごとのスーパー精錬回数</h2></div><p>各曜日に行う回数を入力してください。1週間で合計100回までです。</p><div class="quick-fields">${WEEKDAYS.map((day,index) => `<label><span>${day}</span><input type="number" min="0" max="100" step="1" inputmode="numeric" data-quick-day="${index}" value="${counts[index]}" aria-label="${day}のスーパー精錬回数"><small>回</small></label>`).join('')}</div><div class="quick-calculation"><div><span>合計回数</span><b id="quick-total">${total} / 100</b></div><div><span>必要な火晶</span><b id="quick-required">${required == null ? '—' : `${number(required)} 個`}</b></div></div>${formError ? `<p class="form-error" role="alert">${formError}</p>` : ''}<button class="confirm-button" data-action="simulate-quick">1週間をシミュレーション</button><p class="hint">火晶の精錬は行わず、開始時の火晶からスーパー精錬します。</p></section>`}
    <footer class="footer"><div><button data-action="probabilities">確率表</button><button data-action="settings">設定</button><button data-action="reset">新しく始める</button></div></footer>
  </main>`);
}
function showToast(message) {
  const element = document.querySelector('#toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), 3500);
}
function addHistory(text) {
  state.history.unshift({ dayIndex: state.dayIndex, text });
  state.history = state.history.slice(0, 100);
}
function start(mode) {
  const amount = Number(document.querySelector('#initial-crystals')?.value);
  if (!Number.isSafeInteger(amount) || amount < 0) return showToast('開始火晶は0以上の整数で入力してください');
  const previousQuickCounts = [...state.quickCounts];
  state = initialState();
  state.quickCounts = previousQuickCounts;
  state.started = true;
  state.mode = mode;
  state.initialCrystals = amount;
  state.crystals = amount;
  save(); render();
}
function refineCrystal() {
  if (state.dailyCount >= MAX_DAILY) return showToast('本日の精錬回数は上限です');
  if (state.resources.some(value => value < RESOURCE_COST)) return showToast('素材が足りません');
  const gained = sample(CRYSTAL_DISTRIBUTION);
  state.resources = state.resources.map(value => value - RESOURCE_COST);
  state.crystals += gained;
  state.dailyCount++;
  state.days[state.dayIndex].basicCount++;
  state.days[state.dayIndex].basicGained += gained;
  addHistory(`火晶の精錬：火晶 +${gained}`);
  save(); render(); showToast(`火晶を ${gained} 個獲得しました！`);
}
function superCost(count) { return batchCost(state.weeklyCount, count, state.firstSuperDay !== state.dayIndex); }
function superRefine(count) {
  if (state.weeklyCount >= MAX_WEEKLY) return showToast('今週の上限に達しました');
  if (!Number.isInteger(count) || count < 1 || count > remainingInTier(state.weeklyCount)) return showToast('選択できる回数を超えています');
  const cost = superCost(count);
  if (state.crystals < cost) return showToast(`火晶が ${number(cost - state.crystals)} 個足りません`);
  const tier = tierIndex(state.weeklyCount);
  const results = Array.from({ length: count }, () => sample(DISTRIBUTIONS[tier]));
  const gained = results.reduce((sum, value) => sum + value, 0);
  state.crystals -= cost;
  state.refined += gained;
  state.weeklyCount += count;
  state.firstSuperDay = state.dayIndex;
  state.days[state.dayIndex].superCount += count;
  state.days[state.dayIndex].superGained += gained;
  state.days[state.dayIndex].spent += cost;
  addHistory(`スーパー精錬${TIER_LABELS[tier]} ×${count}：火晶 -${cost} / 精錬火晶 +${gained}`);
  save(); modal = null; render(); showToast(`精錬火晶を ${gained} 個獲得しました！`);
}
function nextDay() {
  if (state.dayIndex >= 6) return;
  state.dayIndex++;
  state.dailyCount = 0;
  addHistory(`${WEEKDAYS[state.dayIndex]}に進みました`);
  save(); render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function runQuick() {
  const inputs = [...document.querySelectorAll('[data-quick-day]')];
  if (inputs.length) state.quickCounts = inputs.map(input => input.value.trim() === '' ? 0 : Number(input.value));
  const result = simulateQuick(state.initialCrystals, state.quickCounts);
  if (result.error) { formError = result.error; render(); return; }
  formError = '';
  state.quickResult = result;
  save(); render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function modalFrame(title, content) {
  return `<div class="backdrop" data-action="close"></div><section class="dialog" role="dialog" aria-modal="true" aria-label="${title}"><div class="dialog-title"><h2>${title}</h2><button class="close-button" data-action="close" aria-label="閉じる">×</button></div><div class="dialog-body">${content}</div></section>`;
}
function renderModal() {
  const overlay = document.querySelector('#overlay');
  if (!modal) { overlay.innerHTML = ''; overlay.classList.remove('open'); return; }
  if (modal === 'multi') {
    const tier = tierIndex(state.weeklyCount);
    const max = remainingInTier(state.weeklyCount);
    const cost = superCost(quantity);
    overlay.innerHTML = modalFrame('スーパー精錬', `<div class="modal-conversion"><div>${crystalIcon(43)}<b>${TIER_COSTS[tier]}</b></div><span>➜</span><div>${refinedIcon(43)}<b>${DISTRIBUTIONS[tier][0][0]}〜${DISTRIBUTIONS[tier].at(-1)[0]}</b></div></div><p class="modal-tier">スーパー精錬${TIER_LABELS[tier]}　<span>今回 ${state.weeklyCount + 1}〜${state.weeklyCount + quantity} 回目 / 20回枠</span></p><div class="quantity-control"><button data-action="decrease" aria-label="回数を減らす">−</button><input type="range" id="quantity-range" min="1" max="${max}" value="${quantity}" aria-label="スーパー精錬回数"><button data-action="increase" aria-label="回数を増やす">＋</button><select id="quantity-number" aria-label="スーパー精錬回数">${Array.from({length:max},(_,index) => `<option value="${index+1}" ${quantity === index+1 ? 'selected' : ''}>${index+1}</option>`).join('')}</select><button data-action="max" aria-label="最大回数">MAX</button></div><p class="modal-limit">このテーブルであと <b>${max}回</b> 選択できます</p><button class="confirm-button" data-action="confirm-multi" ${state.crystals < cost ? 'disabled' : ''}>${crystalIcon(30)} 火晶 ${number(cost)} 個で精錬</button>${state.crystals < cost ? `<p class="shortage">火晶が ${number(cost - state.crystals)} 個足りません</p>` : ''}`);
  } else if (modal === 'probabilities') {
    overlay.innerHTML = modalFrame('確率と消費数', `<div class="probability-list">${DISTRIBUTIONS.map((table,index) => `<div><b>スーパー精錬${TIER_LABELS[index]}</b><small>${index*20+1}〜${index*20+20}回目 · 火晶${TIER_COSTS[index]}個</small><p>${probabilityText(index)}</p></div>`).join('')}<div><b>火晶の精錬</b><small>1日8回</small><p>${CRYSTAL_DISTRIBUTION.map(([n,p]) => `${n}個 ${p}%`).join(' ・ ')}</p></div></div>`);
  } else if (modal === 'settings') {
    overlay.innerHTML = modalFrame('設定', `<p class="settings-intro">スーパー精錬1回の消費数は固定です。</p><div class="fixed-costs">${TIER_LABELS.map((label,index) => `<div><span>スーパー精錬${label}</span><b>火晶 ${TIER_COSTS[index]} 個</b></div>`).join('')}</div><button class="text-button restart-link" data-action="reset">新しく始める</button>`);
  } else if (modal === 'history') {
    overlay.innerHTML = modalFrame('精錬の履歴', state.history.length ? `<div class="history-list">${state.history.map(item => `<div><time>${WEEKDAYS[item.dayIndex]}</time><p>${escapeHtml(item.text)}</p></div>`).join('')}</div>` : '<p class="empty-message">まだ精錬していません。</p>');
  } else if (modal === 'help') {
    overlay.innerHTML = modalFrame('遊び方', `<div class="help-copy"><p>日次モードでは月曜から日曜まで1日ずつ進めます。火晶の精錬は1日8回まで。肉・木・石炭・鉄を各50,000消費します。</p><p>スーパー精錬は週100回まで。毎日最初の1回は火晶の消費が半分になり、20回ごとに確率が切り替わります。</p><p>省略モードでは曜日ごとのスーパー精錬回数を入力すると、1週間の結果を一度に計算します。火晶そのものの精錬は省略します。</p><p>このシミュレーターの日付はボタンで進み、実際の日付には連動しません。</p></div>`);
  } else if (modal === 'reset') {
    overlay.innerHTML = modalFrame('新しく始める', `<p class="empty-message">現在のシミュレーション結果を消して、開始画面に戻ります。前回入力した開始火晶数と曜日別回数は残ります。</p><button class="danger-button" data-action="confirm-reset">開始画面に戻る</button>`);
  }
  overlay.classList.add('open');
}
function escapeHtml(value) { return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
app.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'start-daily') start('daily');
  if (action === 'start-quick') start('quick');
  if (action === 'refine') refineCrystal();
  if (action === 'single') superRefine(1);
  if (action === 'multi') { quantity = 1; modal = 'multi'; renderModal(); }
  if (action === 'next-day') nextDay();
  if (action === 'simulate-quick') runQuick();
  if (action === 'edit-quick') { state.quickResult = null; save(); render(); }
  if (['probabilities','settings','history','help','reset'].includes(action)) { modal = action; renderModal(); }
  if (action === 'close') { modal = null; renderModal(); }
  if (action === 'decrease') { quantity = Math.max(1, quantity - 1); renderModal(); }
  if (action === 'increase') { quantity = Math.min(remainingInTier(state.weeklyCount), quantity + 1); renderModal(); }
  if (action === 'max') { quantity = remainingInTier(state.weeklyCount); renderModal(); }
  if (action === 'confirm-multi') superRefine(quantity);
  if (action === 'confirm-reset') { const { initialCrystals, quickCounts } = state; state = initialState(); state.initialCrystals = initialCrystals; state.quickCounts = [...quickCounts]; formError = ''; modal = null; save(); render(); }
});
app.addEventListener('input', event => {
  if (event.target.id === 'initial-crystals') {
    const amount = event.target.value.trim() === '' ? 0 : Number(event.target.value);
    if (Number.isSafeInteger(amount) && amount >= 0) { state.initialCrystals = amount; save(); }
  }
  if (event.target.id === 'quantity-range') { quantity = Number(event.target.value); renderModal(); }
  if (event.target.matches('[data-quick-day]')) {
    const inputs = [...document.querySelectorAll('[data-quick-day]')];
    const counts = inputs.map(input => input.value.trim() === '' ? 0 : Number(input.value));
    if (counts.every(count => Number.isSafeInteger(count) && count >= 0 && count <= 100)) { state.quickCounts = counts; save(); }
    const total = counts.reduce((sum, count) => sum + count, 0);
    document.querySelector('#quick-total').textContent = `${total} / 100`;
    document.querySelector('#quick-required').textContent = counts.every(count => Number.isSafeInteger(count) && count >= 0 && count <= 100) && total <= 100 ? `${number(plannedCost(counts).total)} 個` : '—';
  }
});
app.addEventListener('change', event => {
  if (event.target.id === 'quantity-number') { quantity = Number(event.target.value); renderModal(); }
  if (event.target.matches('[data-quick-day]')) {
    const inputs = [...document.querySelectorAll('[data-quick-day]')];
    state.quickCounts = inputs.map(input => input.value.trim() === '' ? 0 : Number(input.value));
    formError = '';
    save();
  }
});
render();
