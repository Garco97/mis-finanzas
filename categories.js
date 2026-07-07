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

// Palabras clave por defecto para autocategorizar según la nota/concepto
export const CATEGORY_KEYWORDS = {
  comida: [
    'mercadona', 'carrefour', 'lidl', 'aldi', 'dia', 'alcampo', 'consum',
    'supermercado', 'super', 'restaurante', 'cafeteria', 'cafe', 'bar',
    'mcdonald', 'burger', 'kfc', 'telepizza', 'dominos', 'glovo', 'uber eats',
    'just eat', 'panaderia', 'fruteria', 'carniceria',
  ],
  casa: [
    'alquiler', 'hipoteca', 'luz', 'endesa', 'iberdrola', 'naturgy', 'agua',
    'gas', 'comunidad', 'ikea', 'leroy', 'bricomart', 'seguro hogar',
  ],
  transporte: [
    'gasolina', 'repsol', 'cepsa', 'bp', 'shell', 'renfe', 'metro', 'autobus',
    'bus', 'uber', 'cabify', 'taxi', 'parking', 'peaje', 'blablacar', 'bicing',
  ],
  ocio: [
    'cine', 'teatro', 'concierto', 'museo', 'discoteca', 'copas', 'viaje',
    'hotel', 'airbnb', 'booking',
  ],
  juegos: [
    'steam', 'playstation', 'psn', 'xbox', 'nintendo', 'epic games', 'riot',
    'twitch', 'game', 'juego',
  ],
  salud: [
    'farmacia', 'clinica', 'dentista', 'hospital', 'medico', 'optica',
    'gimnasio', 'gym', 'fisio',
  ],
  compras: [
    'amazon', 'zara', 'decathlon', 'el corte ingles', 'aliexpress',
    'pccomponentes', 'mediamarkt', 'primor', 'druni',
  ],
  suscripciones: [
    'netflix', 'spotify', 'hbo', 'disney', 'prime', 'youtube premium',
    'icloud', 'google one', 'movistar', 'vodafone', 'orange', 'dropbox',
    'chatgpt', 'openai',
  ],
};

export function guessCategoryByKeywords(text) {
  if (!text) return null;
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const [categoryId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => normalized.includes(kw))) {
      return categoryId;
    }
  }

  return null;
}
