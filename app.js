import * as storage from './storage.js';
import * as notifications from './notifications.js';
import { ensureValidToken } from './google-auth.js';
import {
  CATEGORIES,
  DEFAULT_CATEGORY_ID,
  getCategoryOrDefault,
  isValidCategory,
  guessCategoryByKeywords,
} from './categories.js';

const OPEN_THRESHOLD = 36;
const OPEN_SNAP_MIN = 72;

const balanceEl = document.getElementById('balance');
const movementsListEl = document.getElementById('movements-list');
const emptyStateEl = document.getElementById('empty-state');
const modalOverlay = document.getElementById('modal-overlay');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmText = document.getElementById('confirm-text');
const modalTitle = document.getElementById('modal-title');
const amountInput = document.getElementById('amount-input');
const noteInput = document.getElementById('note-input');
const categoryField = document.getElementById('category-field');
const categoryPicker = document.getElementById('category-picker');
const categoryBreakdown = document.getElementById('category-breakdown');
const categoryList = document.getElementById('category-list');
const btnAdd = document.getElementById('btn-add');
const btnWithdraw = document.getElementById('btn-withdraw');
const btnCancel = document.getElementById('btn-cancel');
const btnConfirm = document.getElementById('btn-confirm');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmDelete = document.getElementById('confirm-delete');
const viewWallet = document.getElementById('view-wallet');
const viewStats = document.getElementById('view-stats');
const viewCategories = document.getElementById('view-categories');
const categoryFilter = document.getElementById('category-filter');
const catFilterSummaryLabel = document.getElementById('cat-filter-summary-label');
const catFilterSummaryValue = document.getElementById('cat-filter-summary-value');
const catListTitle = document.getElementById('cat-list-title');
const catList = document.getElementById('cat-list');
const catEmpty = document.getElementById('cat-empty');
const statsLabel = document.getElementById('stats-label');
const statsListTitle = document.getElementById('stats-list-title');
const statsList = document.getElementById('stats-list');
const statsEmpty = document.getElementById('stats-empty');
const statIncome = document.getElementById('stat-income');
const statExpense = document.getElementById('stat-expense');
const statNet = document.getElementById('stat-net');
const statsPrev = document.getElementById('stats-prev');
const statsNext = document.getElementById('stats-next');
const periodTabs = document.querySelectorAll('.period-tab');
const tabbarBtns = document.querySelectorAll('.tabbar-btn');
const appShell = document.getElementById('app-shell');
const loadingScreen = document.getElementById('loading-screen');
const authScreen = document.getElementById('auth-screen');
const authGoogle = document.getElementById('auth-google');
const authError = document.getElementById('auth-error');
const authDevNote = document.getElementById('auth-dev-note');
const btnLogout = document.getElementById('btn-logout');
const btnRefreshButtons = document.querySelectorAll('.btn-refresh');
const userEmail = document.getElementById('user-email');
const toastEl = document.getElementById('toast');
const notificationsEnabled = document.getElementById('notifications-enabled');
const notificationsStatus = document.getElementById('notifications-status');
const notifPrompt = document.getElementById('notif-prompt');
const notifPromptText = document.getElementById('notif-prompt-text');
const notifPromptEnable = document.getElementById('notif-prompt-enable');
const notifPromptDismiss = document.getElementById('notif-prompt-dismiss');

let toastTimer = null;

let currentAction = 'add';
let editingId = null;
let selectedCategory = DEFAULT_CATEGORY_ID;
let categoryManual = false;
let pendingDeleteId = null;
let openSwipeRow = null;
let activeSwipeRow = null;
let swipeDrag = null;
let currentView = 'wallet';
let filterCategory = CATEGORIES[0].id;
let statsPeriod = 'day';
let statsDate = startOfDay(new Date());

const SNAP_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

function loadMovements() {
  return storage.getMovements();
}

function getBalance(movements) {
  return movements.reduce((total, m) => {
    return m.type === 'add' ? total + m.amount : total - m.amount;
  }, 0);
}

function formatMoney(amount) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatAmountInput(amount) {
  return String(amount).replace('.', ',');
}

function parseAmount(value) {
  const normalized = value.trim().replace(',', '.');
  const amount = parseFloat(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getCommitThreshold(row) {
  return Math.max(110, row.offsetWidth * 0.42);
}

const CATEGORY_RULES_KEY = 'mis-finanzas-cat-rules';

function normalizeText(text) {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function loadLearnedRules() {
  try {
    return JSON.parse(localStorage.getItem(CATEGORY_RULES_KEY)) || {};
  } catch {
    return {};
  }
}

function learnCategoryRule(note, categoryId) {
  const key = normalizeText(note);
  if (!key || !isValidCategory(categoryId)) return;
  const rules = loadLearnedRules();
  rules[key] = categoryId;
  localStorage.setItem(CATEGORY_RULES_KEY, JSON.stringify(rules));
}

function guessCategory(note) {
  const key = normalizeText(note);
  if (!key) return null;

  const rules = loadLearnedRules();
  if (rules[key]) return rules[key];

  const byKeyword = guessCategoryByKeywords(key);
  if (byKeyword) return byKeyword;

  for (const learnedKey of Object.keys(rules)) {
    if (learnedKey.length >= 3 && key.includes(learnedKey)) {
      return rules[learnedKey];
    }
  }

  return null;
}

function buildCategoryPicker() {
  categoryPicker.innerHTML = '';

  for (const category of CATEGORIES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'category-chip';
    chip.dataset.category = category.id;
    chip.style.setProperty('--cat-color', category.color);
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', 'false');
    chip.innerHTML = `<span class="chip-icon" aria-hidden="true">${category.icon}</span>${category.label}`;
    chip.addEventListener('click', () => {
      categoryManual = true;
      setSelectedCategory(category.id);
    });
    categoryPicker.appendChild(chip);
  }
}

function setSelectedCategory(id) {
  selectedCategory = id;
  categoryPicker.querySelectorAll('.category-chip').forEach((chip) => {
    const isSelected = chip.dataset.category === id;
    chip.classList.toggle('is-selected', isSelected);
    chip.setAttribute('aria-checked', String(isSelected));
  });
}

function categoryBadgeHtml(categoryId) {
  const category = getCategoryOrDefault(categoryId);
  return `
    <div class="movement-category" style="--cat-color:${category.color}">
      <span class="cat-dot" aria-hidden="true"></span>${escapeHtml(category.label)}
    </div>
  `;
}

function createMovementRow(movement) {
  const isAdd = movement.type === 'add';
  const sign = isAdd ? '+' : '−';
  const typeLabel = isAdd ? 'Ingreso' : 'Gasto';

  const li = document.createElement('li');
  li.className = 'swipe-row';
  li.dataset.id = movement.id;

  li.innerHTML = `
    <div class="swipe-action swipe-action-delete">
      <button type="button" class="swipe-action-inner" aria-label="Borrar movimiento">
        <span class="swipe-action-icon" aria-hidden="true">✕</span>
        <span class="swipe-action-text">Borrar</span>
      </button>
    </div>
    <div class="swipe-action swipe-action-edit">
      <button type="button" class="swipe-action-inner" aria-label="Editar movimiento">
        <span class="swipe-action-icon" aria-hidden="true">✎</span>
        <span class="swipe-action-text">Editar</span>
      </button>
    </div>
    <div class="swipe-content">
      <div class="movement-info">
        <div class="movement-type">${typeLabel}</div>
        ${movement.note ? `<div class="movement-note">${escapeHtml(movement.note)}</div>` : ''}
        ${!isAdd ? categoryBadgeHtml(movement.category) : ''}
        <div class="movement-date">${formatDate(movement.date)}</div>
      </div>
      <div class="movement-amount ${movement.type}">${sign}${formatMoney(movement.amount)}</div>
    </div>
  `;

  initSwipeRow(li);
  return li;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

function addToPeriod(date, period, delta) {
  const next = new Date(date);
  if (period === 'day') {
    next.setDate(next.getDate() + delta);
    return startOfDay(next);
  }
  if (period === 'month') {
    next.setMonth(next.getMonth() + delta);
    return startOfMonth(next);
  }
  next.setFullYear(next.getFullYear() + delta);
  return startOfYear(next);
}

function getPeriodBounds(period, date) {
  if (period === 'day') {
    const start = startOfDay(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (period === 'month') {
    const start = startOfMonth(date);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { start, end };
  }
  const start = startOfYear(date);
  const end = new Date(start.getFullYear() + 1, 0, 1);
  return { start, end };
}

function formatPeriodLabel(period, date) {
  let label;
  if (period === 'day') {
    label = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } else if (period === 'month') {
    label = new Intl.DateTimeFormat('es-ES', {
      month: 'long',
      year: 'numeric',
    }).format(date);
  } else {
    return String(date.getFullYear());
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getPeriodListTitle(period) {
  if (period === 'day') return 'Movimientos del día';
  if (period === 'month') return 'Movimientos del mes';
  return 'Movimientos del año';
}

function filterMovementsByPeriod(movements, period, date) {
  const { start, end } = getPeriodBounds(period, date);
  return movements.filter((movement) => {
    const movementDate = new Date(movement.date);
    return movementDate >= start && movementDate < end;
  });
}

function computePeriodStats(movements) {
  return movements.reduce(
    (stats, movement) => {
      if (movement.type === 'add') {
        stats.income += movement.amount;
      } else {
        stats.expense += movement.amount;
      }
      return stats;
    },
    { income: 0, expense: 0 }
  );
}

function switchView(view) {
  currentView = view;
  viewWallet.hidden = view !== 'wallet';
  viewStats.hidden = view !== 'stats';
  viewCategories.hidden = view !== 'categories';
  viewWallet.classList.toggle('view-active', view === 'wallet');
  viewStats.classList.toggle('view-active', view === 'stats');
  viewCategories.classList.toggle('view-active', view === 'categories');

  tabbarBtns.forEach((btn) => {
    const isActive = btn.dataset.view === view;
    btn.classList.toggle('tabbar-btn-active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  if (view === 'stats') {
    renderStats();
  } else if (view === 'categories') {
    renderCategories();
  } else {
    closeAllSwipes();
  }
}

function setStatsPeriod(period) {
  statsPeriod = period;
  statsDate = period === 'day'
    ? startOfDay(new Date())
    : period === 'month'
      ? startOfMonth(new Date())
      : startOfYear(new Date());

  periodTabs.forEach((tab) => {
    const isActive = tab.dataset.period === period;
    tab.classList.toggle('period-tab-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  renderStats();
}

function renderStats() {
  const movements = loadMovements();
  const filtered = filterMovementsByPeriod(movements, statsPeriod, statsDate);
  const { income, expense } = computePeriodStats(filtered);
  const net = income - expense;

  statsLabel.textContent = formatPeriodLabel(statsPeriod, statsDate);
  statsListTitle.textContent = getPeriodListTitle(statsPeriod);
  statIncome.textContent = formatMoney(income);
  statExpense.textContent = formatMoney(expense);
  statNet.textContent = formatMoney(net);
  statNet.classList.toggle('stat-net-positive', net > 0);
  statNet.classList.toggle('stat-net-negative', net < 0);

  renderCategoryBreakdown(filtered, expense);

  statsList.innerHTML = '';

  if (filtered.length === 0) {
    statsList.appendChild(statsEmpty);
    statsEmpty.hidden = false;
    return;
  }

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  for (const movement of sorted) {
    const isAdd = movement.type === 'add';
    const sign = isAdd ? '+' : '−';
    const typeLabel = isAdd ? 'Ingreso' : 'Gasto';

    const li = document.createElement('li');
    li.className = 'stats-item';
    li.innerHTML = `
      <div class="movement-info">
        <div class="movement-type">${typeLabel}</div>
        ${movement.note ? `<div class="movement-note">${escapeHtml(movement.note)}</div>` : ''}
        ${!isAdd ? categoryBadgeHtml(movement.category) : ''}
        <div class="movement-date">${formatDate(movement.date)}</div>
      </div>
      <div class="movement-amount ${movement.type}">${sign}${formatMoney(movement.amount)}</div>
    `;
    statsList.appendChild(li);
  }
}

function renderCategoryBreakdown(movements, totalExpense) {
  const expenses = movements.filter((m) => m.type !== 'add');

  if (expenses.length === 0 || totalExpense <= 0) {
    categoryBreakdown.hidden = true;
    categoryList.innerHTML = '';
    return;
  }

  const totals = new Map();
  for (const movement of expenses) {
    const category = getCategoryOrDefault(movement.category);
    totals.set(category.id, (totals.get(category.id) || 0) + movement.amount);
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  categoryList.innerHTML = '';

  for (const [categoryId, amount] of sorted) {
    const category = getCategoryOrDefault(categoryId);
    const pct = Math.round((amount / totalExpense) * 100);

    const li = document.createElement('li');
    li.className = 'category-row';
    li.style.setProperty('--cat-color', category.color);
    li.innerHTML = `
      <span class="cat-emoji" aria-hidden="true">${category.icon}</span>
      <div class="cat-body">
        <div class="cat-head">
          <span class="cat-name">${escapeHtml(category.label)} <span class="cat-pct">${pct}%</span></span>
          <span class="cat-amount">${formatMoney(amount)}</span>
        </div>
        <div class="cat-bar"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
      </div>
    `;
    categoryList.appendChild(li);
  }

  categoryBreakdown.hidden = false;
}

function buildCategoryFilter() {
  categoryFilter.innerHTML = '';

  for (const category of CATEGORIES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cat-filter-chip';
    chip.dataset.category = category.id;
    chip.style.setProperty('--cat-color', category.color);
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', 'false');
    chip.innerHTML = `<span class="chip-icon" aria-hidden="true">${category.icon}</span>${category.label}`;
    chip.addEventListener('click', () => {
      filterCategory = category.id;
      renderCategories();
    });
    categoryFilter.appendChild(chip);
  }
}

function renderCategories() {
  const category = getCategoryOrDefault(filterCategory);

  categoryFilter.querySelectorAll('.cat-filter-chip').forEach((chip) => {
    const isSelected = chip.dataset.category === category.id;
    chip.classList.toggle('is-selected', isSelected);
    chip.setAttribute('aria-checked', String(isSelected));
  });

  const matching = loadMovements()
    .filter((m) => m.type !== 'add' && getCategoryOrDefault(m.category).id === category.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const total = matching.reduce((sum, m) => sum + m.amount, 0);

  catFilterSummaryLabel.textContent = `${category.icon} ${category.label}`;
  catFilterSummaryValue.textContent = formatMoney(total);
  catListTitle.textContent = `Movimientos (${matching.length})`;

  catList.innerHTML = '';

  if (matching.length === 0) {
    catList.appendChild(catEmpty);
    catEmpty.hidden = false;
    return;
  }

  for (const movement of matching) {
    const li = document.createElement('li');
    li.className = 'stats-item';
    li.innerHTML = `
      <div class="movement-info">
        <div class="movement-type">Gasto</div>
        ${movement.note ? `<div class="movement-note">${escapeHtml(movement.note)}</div>` : ''}
        <div class="movement-date">${formatDate(movement.date)}</div>
      </div>
      <div class="movement-amount withdraw">−${formatMoney(movement.amount)}</div>
    `;
    catList.appendChild(li);
  }
}

function renderAll() {
  updateNotificationsUI();
  renderWallet();
  renderStats();
  if (currentView === 'categories') renderCategories();
}

function renderWallet() {
  const movements = loadMovements();
  const balance = getBalance(movements);

  balanceEl.textContent = formatMoney(balance);
  balanceEl.classList.toggle('positive', balance > 0);
  balanceEl.classList.toggle('negative', balance < 0);

  openSwipeRow = null;
  movementsListEl.innerHTML = '';

  if (movements.length === 0) {
    movementsListEl.appendChild(emptyStateEl);
    emptyStateEl.hidden = false;
    return;
  }

  const sorted = [...movements].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  for (const movement of sorted) {
    movementsListEl.appendChild(createMovementRow(movement));
  }
}

function getMovementById(id) {
  return loadMovements().find((m) => m.id === id);
}

function deleteMovement(id) {
  if (storage.isSyncing()) return;

  const movements = loadMovements().filter((m) => m.id !== id);
  storage.applyMovements(movements);
  renderAll();

  storage.syncRemote().then((result) => {
    if (!result.ok) {
      showToast(`Borrado en el móvil. Error en Sheets: ${result.error}`);
    }
  });
}

function editMovement(id) {
  const movement = getMovementById(id);
  if (movement) openModal(movement.type, movement);
}

function applySwipe(row, offset, animate = true) {
  const content = row.querySelector('.swipe-content');
  const deleteAction = row.querySelector('.swipe-action-delete');
  const editAction = row.querySelector('.swipe-action-edit');
  const deleteWidth = Math.max(0, offset);
  const editWidth = Math.max(0, -offset);
  const commit = getCommitThreshold(row);
  const transition = animate ? `0.38s ${SNAP_EASE}` : 'none';

  row.classList.toggle('is-dragging', !animate);
  content.style.transition = animate ? `transform ${transition}` : 'none';
  deleteAction.style.transition = animate ? `width ${transition}` : 'none';
  editAction.style.transition = animate ? `width ${transition}` : 'none';

  deleteAction.style.width = `${deleteWidth}px`;
  editAction.style.width = `${editWidth}px`;
  content.style.transform = `translateX(${offset}px)`;
  row.dataset.offset = String(offset);

  row.classList.toggle('swipe-will-delete', offset >= commit);
  row.classList.toggle('swipe-will-edit', offset <= -commit);

  updateActionVisual(deleteAction, deleteWidth, commit);
  updateActionVisual(editAction, editWidth, commit);

  if (offset === 0) {
    if (openSwipeRow === row) openSwipeRow = null;
  } else {
    openSwipeRow = row;
  }
}

function updateActionVisual(action, width, commit) {
  const inner = action.querySelector('.swipe-action-inner');
  const reveal = Math.min(1, width / OPEN_SNAP_MIN);
  const ready = Math.min(1, width / commit);

  inner.style.opacity = String(0.35 + reveal * 0.65);
  inner.style.transform = `scale(${0.82 + reveal * 0.18})`;
  action.style.filter = ready >= 1 ? 'brightness(1.12)' : 'brightness(1)';
}

function closeAllSwipes(exceptRow = null) {
  document.querySelectorAll('.swipe-row').forEach((row) => {
    if (row !== exceptRow) applySwipe(row, 0);
  });
}

function getOpenSnap(offset) {
  if (Math.abs(offset) < OPEN_THRESHOLD) return 0;
  const sign = offset > 0 ? 1 : -1;
  return sign * Math.max(OPEN_SNAP_MIN, Math.abs(offset));
}

function initSwipeRow(row) {
  const content = row.querySelector('.swipe-content');

  content.addEventListener(
    'touchstart',
    (e) => beginSwipe(row, e.touches[0].clientX, e.touches[0].clientY),
    { passive: true }
  );

  content.addEventListener(
    'touchmove',
    (e) => {
      if (!swipeDrag || swipeDrag.row !== row) return;
      moveSwipe(e.touches[0].clientX, e.touches[0].clientY, () => e.preventDefault());
    },
    { passive: false }
  );

  content.addEventListener('touchend', () => endSwipe(row));
  content.addEventListener('touchcancel', () => endSwipe(row));

  content.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    activeSwipeRow = row;
    beginSwipe(row, e.clientX, e.clientY);
    e.preventDefault();
  });
}

function beginSwipe(row, clientX, clientY) {
  closeAllSwipes(row);
  swipeDrag = {
    row,
    startX: clientX,
    startY: clientY,
    startOffset: Number(row.dataset.offset || 0),
    currentOffset: Number(row.dataset.offset || 0),
    isHorizontal: null,
  };
  applySwipe(row, swipeDrag.currentOffset, false);
}

function moveSwipe(clientX, clientY, preventDefault) {
  if (!swipeDrag) return;

  const { row, startX, startY, startOffset } = swipeDrag;
  const dx = clientX - startX;
  const dy = clientY - startY;

  if (swipeDrag.isHorizontal === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
    swipeDrag.isHorizontal = Math.abs(dx) > Math.abs(dy);
  }

  if (!swipeDrag.isHorizontal) return;

  preventDefault();

  const max = row.offsetWidth * 0.72;
  swipeDrag.currentOffset = Math.max(-max, Math.min(max, startOffset + dx));
  applySwipe(row, swipeDrag.currentOffset, false);
}

function endSwipe(row) {
  if (!swipeDrag || swipeDrag.row !== row) return;

  const { currentOffset } = swipeDrag;
  const id = row.dataset.id;
  const commit = getCommitThreshold(row);

  swipeDrag = null;
  activeSwipeRow = null;

  if (currentOffset >= commit) {
    applySwipe(row, 0);
    requestDelete(id);
    return;
  }

  if (currentOffset <= -commit) {
    applySwipe(row, 0);
    editMovement(id);
    return;
  }

  applySwipe(row, getOpenSnap(currentOffset));
}

window.addEventListener('mousemove', (e) => {
  if (!activeSwipeRow || !swipeDrag) return;
  moveSwipe(e.clientX, e.clientY, () => e.preventDefault());
});

window.addEventListener('mouseup', () => {
  if (!activeSwipeRow || !swipeDrag) return;
  endSwipe(activeSwipeRow);
});

function openConfirmModal() {
  confirmOverlay.hidden = false;
  document.body.classList.add('modal-open');
}

function closeConfirmModal() {
  confirmOverlay.hidden = true;
  if (modalOverlay.hidden) {
    document.body.classList.remove('modal-open');
  }
  pendingDeleteId = null;
}

function requestDelete(id) {
  const movement = getMovementById(id);
  if (!movement) return;

  pendingDeleteId = id;
  const typeLabel = movement.type === 'add' ? 'ingreso' : 'gasto';
  const notePart = movement.note ? ` (${movement.note})` : '';
  confirmText.textContent = `¿Eliminar el ${typeLabel} de ${formatMoney(movement.amount)}${notePart}?`;
  closeAllSwipes();
  openConfirmModal();
}

async function executeDelete() {
  const id = pendingDeleteId;
  if (!id) return;

  pendingDeleteId = null;
  closeConfirmModal();

  const row = document.querySelector(`.swipe-row[data-id="${id}"]`);
  if (!row) {
    try {
      await deleteMovement(id);
    } catch (error) {
      showToast(error.message || 'No se pudo borrar');
    }
    return;
  }

  row.classList.add('swipe-row-removing');
  window.setTimeout(async () => {
    try {
      await deleteMovement(id);
    } catch (error) {
      row.classList.remove('swipe-row-removing');
      showToast(error.message || 'No se pudo borrar');
    }
  }, 340);
}

function openModal(action, movement = null) {
  editingId = movement ? movement.id : null;
  currentAction = movement ? movement.type : action;
  const isAdd = currentAction === 'add';

  if (movement) {
    modalTitle.textContent = 'Editar movimiento';
    amountInput.value = formatAmountInput(movement.amount);
    noteInput.value = movement.note || '';
    btnConfirm.textContent = 'Guardar';
  } else {
    modalTitle.textContent = isAdd ? 'Añadir dinero' : 'Sacar dinero';
    amountInput.value = '';
    noteInput.value = '';
    btnConfirm.textContent = 'Confirmar';
  }

  categoryField.hidden = isAdd;
  if (!isAdd) {
    // Al editar respetamos su categoría; al crear intentamos adivinarla por la nota
    categoryManual = Boolean(movement);
    const initialCategory = movement?.category
      || (movement ? DEFAULT_CATEGORY_ID : (guessCategory(noteInput.value) || DEFAULT_CATEGORY_ID));
    setSelectedCategory(initialCategory);
  }

  modalOverlay.classList.toggle('withdraw-mode', !isAdd);
  modalOverlay.hidden = false;
  document.body.classList.add('modal-open');
  closeAllSwipes();

  requestAnimationFrame(() => {
    amountInput.focus();
  });
}

function closeModal() {
  amountInput.blur();
  noteInput.blur();
  modalOverlay.hidden = true;
  if (confirmOverlay.hidden) {
    document.body.classList.remove('modal-open');
  }
  editingId = null;
  categoryField.hidden = true;
  btnConfirm.textContent = 'Confirmar';
}

async function confirmMovement() {
  if (storage.isSyncing()) return;

  const amount = parseAmount(amountInput.value);
  if (!amount) {
    amountInput.focus();
    return;
  }

  const movements = loadMovements();

  const isAdd = currentAction === 'add';
  const category = isAdd ? '' : selectedCategory;

  if (editingId) {
    const index = movements.findIndex((m) => m.id === editingId);
    if (index !== -1) {
      movements[index] = {
        ...movements[index],
        amount,
        note: noteInput.value.trim(),
        category,
      };
    }
  } else {
    movements.push({
      id: createId(),
      type: currentAction,
      amount,
      note: noteInput.value.trim(),
      category,
      date: new Date().toISOString(),
    });
  }

  // Recordar la categoría elegida para esta nota (autocategorización futura)
  if (!isAdd && noteInput.value.trim()) {
    learnCategoryRule(noteInput.value, category);
  }

  // Optimista: guardar en local, cerrar y refrescar al instante; sincronizar en segundo plano
  storage.applyMovements(movements);
  closeModal();
  renderAll();

  storage.syncRemote().then((result) => {
    if (!result.ok) {
      showToast(`Guardado en el móvil. Error en Sheets: ${result.error}`);
    }
  });
}

buildCategoryPicker();
buildCategoryFilter();

storage.subscribeSync((syncing) => {
  btnConfirm.disabled = syncing;
  confirmDelete.disabled = syncing;
  btnRefreshButtons.forEach((btn) => {
    btn.disabled = syncing;
    btn.classList.toggle('is-spinning', syncing);
  });
});

btnAdd.addEventListener('click', () => openModal('add'));
btnWithdraw.addEventListener('click', () => openModal('withdraw'));
btnCancel.addEventListener('click', closeModal);
btnConfirm.addEventListener('click', confirmMovement);
confirmCancel.addEventListener('click', closeConfirmModal);
confirmDelete.addEventListener('click', executeDelete);

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) closeConfirmModal();
});

movementsListEl.addEventListener('click', (e) => {
  const row = e.target.closest('.swipe-row');
  if (!row) return;

  if (e.target.closest('.swipe-action-delete')) {
    requestDelete(row.dataset.id);
    return;
  }

  if (e.target.closest('.swipe-action-edit')) {
    editMovement(row.dataset.id);
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.swipe-row')) {
    closeAllSwipes();
  }
});

amountInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmMovement();
  }
});

noteInput.addEventListener('input', () => {
  if (currentAction === 'add' || categoryManual) return;
  const guess = guessCategory(noteInput.value);
  if (guess) setSelectedCategory(guess);
});

noteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmMovement();
  }
});

tabbarBtns.forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

periodTabs.forEach((tab) => {
  tab.addEventListener('click', () => setStatsPeriod(tab.dataset.period));
});

statsPrev.addEventListener('click', () => {
  statsDate = addToPeriod(statsDate, statsPeriod, -1);
  renderStats();
});

statsNext.addEventListener('click', () => {
  statsDate = addToPeriod(statsDate, statsPeriod, 1);
  renderStats();
});

function updateNotificationsUI() {
  notificationsEnabled.checked = notifications.isNotificationsEnabled();
  notificationsStatus.textContent = notifications.getStatusMessage();
  updateNotificationPrompt();
}

function updateNotificationPrompt() {
  if (!storage.getUser() || authScreen.hidden === false) {
    notifPrompt.hidden = true;
    return;
  }

  if (!notifications.shouldShowPermissionPrompt()) {
    notifPrompt.hidden = true;
    return;
  }

  notifPromptText.textContent = notifications.getPromptMessage();
  notifPromptEnable.hidden = !notifications.canRequestPermissionViaPrompt();
  notifPromptEnable.textContent = Notification.permission === 'granted'
    ? 'Activar aviso'
    : 'Activar avisos';
  notifPromptDismiss.textContent = Notification.permission === 'denied'
    ? 'Entendido'
    : 'Ahora no';
  notifPrompt.hidden = false;
}

async function handlePromptEnable() {
  try {
    if (Notification.permission === 'granted' && !notifications.isNotificationsEnabled()) {
      notificationsEnabled.checked = true;
      await handleNotificationsToggle();
    } else {
      await notifications.enableNotifications();
      notificationsEnabled.checked = true;
      showToast('Aviso diario a las 21:00 activado', 'info');
    }
    updateNotificationsUI();
  } catch (error) {
    showToast(error.message || 'No se pudieron activar');
  }
}

function handlePromptDismiss() {
  notifications.snoozePermissionPrompt();
  notifPrompt.hidden = true;
}

async function handleRefresh() {
  if (storage.isSyncing()) return;

  if (!storage.getUser()) {
    renderAll();
    return;
  }

  try {
    const result = await storage.refreshFromCloud();
    renderAll();
    if (!result.ok && result.error) {
      showToast(result.error);
    }
  } catch (error) {
    showToast(error.message || 'Error al actualizar');
  }
}

async function handleNotificationsToggle() {
  if (notificationsEnabled.checked) {
    try {
      await notifications.enableNotifications();
      showToast('Aviso diario a las 21:00 activado', 'info');
    } catch (error) {
      notificationsEnabled.checked = false;
      notifications.setNotificationsEnabled(false);
      await notifications.disableDailyReminder();
      showToast(error.message || 'No se pudieron activar');
    }
  } else {
    notifications.setNotificationsEnabled(false);
    await notifications.disableDailyReminder();
  }

  updateNotificationsUI();
}

function showLoading(show) {
  loadingScreen.hidden = !show;
}

function showToast(message, type = 'error') {
  if (!message) return;

  toastEl.textContent = message;
  toastEl.classList.toggle('toast-info', type === 'info');
  toastEl.hidden = false;

  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 5000);
}

function showAuthScreen(show, { devNote = false } = {}) {
  authScreen.hidden = !show;
  appShell.hidden = show;
  authDevNote.hidden = !devNote;
}

function showAuthError(message) {
  if (!message) {
    authError.hidden = true;
    authError.textContent = '';
    return;
  }
  authError.hidden = false;
  authError.textContent = message;
}

function updateUserUI(result) {
  const user = storage.getUser();

  if (user?.email) {
    userEmail.hidden = false;
    userEmail.textContent = user.email;
    btnLogout.hidden = false;
    btnRefreshButtons.forEach((btn) => { btn.hidden = false; });
    return;
  }

  userEmail.hidden = true;
  btnLogout.hidden = !storage.isGoogleConfigured();
  btnRefreshButtons.forEach((btn) => { btn.hidden = !storage.isGoogleConfigured(); });
}

async function handleGoogleSignIn() {
  showAuthError('');
  authGoogle.disabled = true;

  try {
    const result = await storage.completeSignIn();
    if (!result) return;
    showAuthScreen(false);
    updateUserUI(result);
    renderAll();
  } catch (error) {
    showAuthError(storage.formatAuthError(error));
  } finally {
    authGoogle.disabled = false;
  }
}

authGoogle.addEventListener('click', handleGoogleSignIn);

notificationsEnabled.addEventListener('change', handleNotificationsToggle);
notifPromptEnable.addEventListener('click', handlePromptEnable);
notifPromptDismiss.addEventListener('click', handlePromptDismiss);

btnRefreshButtons.forEach((btn) => {
  btn.addEventListener('click', handleRefresh);
});

btnLogout.addEventListener('click', () => {
  storage.signOut();
  storage.clearAfterSignOut();
  showAuthScreen(true);
  showAuthError('');
  updateUserUI({});
});

function showFileProtocolWarning() {
  document.body.innerHTML = `
    <div class="auth-screen" style="display:flex">
      <div class="auth-card">
        <h1 class="auth-title">Mis Finanzas</h1>
        <p class="auth-subtitle">Para usar la app en local, ábrela con un servidor:</p>
        <p class="confirm-text" style="margin-top:1rem;font-family:monospace;font-size:0.8rem">
          cd mis-finanzas<br>
          python3 -m http.server 8765
        </p>
        <p class="confirm-text" style="margin-top:0.75rem">
          Luego visita <strong>http://localhost:8765</strong>
        </p>
      </div>
    </div>
  `;
}

async function boot() {
  if (location.protocol === 'file:') {
    showFileProtocolWarning();
    return;
  }

  showLoading(true);

  if (storage.isGoogleConfigured()) {
    try {
      const redirectUser = await storage.handleOAuthCallback();
      if (redirectUser) {
        await storage.initGoogle();
        const result = await storage.completeSignIn(redirectUser);
        showAuthScreen(false);
        updateUserUI(result);
        updateNotificationsUI();
        notifications.registerServiceWorker().then(() => {
          notifications.scheduleDailyReminder();
          notifications.checkDailyReminder();
        });
        showLoading(false);
        renderAll();
        if (result?.error) {
          showToast(`Datos locales. Error en Sheets: ${result.error}`);
        }
        return;
      }
    } catch (error) {
      showLoading(false);
      showAuthScreen(true);
      showAuthError(storage.formatAuthError(error));
      return;
    }

    await storage.initGoogle();

    const session = await storage.tryRestoreSession();

    if (session.authenticated) {
      showAuthScreen(false);
      updateUserUI(session);
      updateNotificationsUI();
      notifications.registerServiceWorker().then(() => {
        notifications.scheduleDailyReminder();
        notifications.checkDailyReminder();
      });
      showLoading(false);
      renderAll();
      if (session.error) {
        showToast(`Datos locales. Error en Sheets: ${session.error}`);
      }
      return;
    }

    showLoading(false);
    showAuthScreen(true);
    return;
  }

  await storage.tryRestoreSession();
  showLoading(false);
  showAuthScreen(false, { devNote: false });
  updateUserUI({});
  renderAll();
}

function parseQuickAddParams() {
  const params = new URLSearchParams(location.search);
  const amountRaw = params.get('amount') ?? params.get('add') ?? params.get('gasto');
  if (amountRaw == null) return null;

  const amount = parseAmount(String(amountRaw));
  if (!amount) return null;

  const typeRaw = (params.get('type') || '').toLowerCase();
  const isIncome = typeRaw === 'add' || typeRaw === 'ingreso' || params.has('ingreso');
  const type = isIncome ? 'add' : 'withdraw';

  const note = (params.get('note') || params.get('nota') || '').slice(0, 80).trim();

  let category = '';
  if (type !== 'add') {
    const requested = (params.get('cat') || params.get('categoria') || '').toLowerCase();
    category = isValidCategory(requested)
      ? requested
      : (guessCategory(note) || DEFAULT_CATEGORY_ID);
  }

  return { amount, type, note, category };
}

function processQuickAdd() {
  const data = parseQuickAddParams();
  history.replaceState({}, '', location.pathname);
  if (!data) return;

  const movements = loadMovements();
  movements.push({
    id: createId(),
    type: data.type,
    amount: data.amount,
    note: data.note,
    category: data.category,
    date: new Date().toISOString(),
  });

  if (data.type !== 'add' && data.note) {
    learnCategoryRule(data.note, data.category);
  }

  storage.applyMovements(movements);
  renderAll();

  const label = data.type === 'add' ? 'Ingreso' : 'Gasto';
  storage.syncRemote().then((result) => {
    if (!result.ok) {
      showToast(`${label} guardado en el móvil. Error en Sheets: ${result.error}`);
    } else {
      showToast(`${label} de ${formatMoney(data.amount)} añadido`, 'info');
    }
  });
}

boot().then(() => {
  if (!appShell.hidden) processQuickAdd();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !storage.getUser()) return;

  storage.refreshFromCloud().then((result) => {
    if (result.ok) renderAll();
  });

  if (storage.getUser()) {
    ensureValidToken();
  }

  notifications.scheduleDailyReminder();
  notifications.checkDailyReminder();
  updateNotificationPrompt();
});
