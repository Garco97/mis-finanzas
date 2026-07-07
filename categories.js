export const CATEGORIES = [
  { id: 'casa', label: 'Casa', icon: '🏠', color: '#f59e0b' },
  { id: 'comida', label: 'Comida', icon: '🍔', color: '#ef4444' },
  { id: 'ocio', label: 'Ocio', icon: '🎉', color: '#8b5cf6' },
  { id: 'juegos', label: 'Juegos', icon: '🎮', color: '#3b82f6' },
  { id: 'transporte', label: 'Transporte', icon: '🚌', color: '#06b6d4' },
  { id: 'salud', label: 'Salud', icon: '💊', color: '#22c55e' },
  { id: 'compras', label: 'Compras', icon: '🛍️', color: '#ec4899' },
  { id: 'suscripciones', label: 'Suscripciones', icon: '🔁', color: '#a855f7' },
  { id: 'otros', label: 'Otros', icon: '📦', color: '#94a3b8' },
];

export const DEFAULT_CATEGORY_ID = 'otros';

const CATEGORY_MAP = new Map(CATEGORIES.map((cat) => [cat.id, cat]));

export function getCategory(id) {
  return CATEGORY_MAP.get(id) || null;
}

export function getCategoryOrDefault(id) {
  return getCategory(id) || getCategory(DEFAULT_CATEGORY_ID);
}

export function isValidCategory(id) {
  return CATEGORY_MAP.has(id);
}
