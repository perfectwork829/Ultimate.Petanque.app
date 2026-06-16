// ============================================
// BOULES COMPETITION DATABASE
// ============================================

export interface BoulesModel {
  brand: string;
  model: string;
  material: string;
  hardness: string;
  targetUsage: string;
  particularities: string;
}

export const BOULES_BRANDS = [
  'OBUT',
  'MS PÉTANQUE',
  'LA BOULE BLEUE',
  'BOULENCIEL',
  'KTK',
  'ODDEKA',
  'LA FRANC',
  'MARATHON',
  'GEOLOGIC',
  'TORO PETANK',
] as const;

export const BOULES_DATABASE: BoulesModel[] = [
  // OBUT
  { brand: 'OBUT', model: 'ATX', material: 'Acier spécial', hardness: 'Demi-tendre (130kg)', targetUsage: 'Élite / Milieu', particularities: "L'icône du haut niveau" },
  { brand: 'OBUT', model: 'RCC', material: 'Acier carbone', hardness: 'Amorti + (Tendre)', targetUsage: 'Tireur', particularities: 'Traitement anti-rebond' },
  { brand: 'OBUT', model: 'RCX', material: 'Acier inox', hardness: 'Amorti + (Tendre)', targetUsage: 'Tireur / Milieu', particularities: 'Version inox de la RCC' },
  { brand: 'OBUT', model: 'Nexius', material: 'Acier inox', hardness: 'Demi-tendre', targetUsage: 'Milieu', particularities: "Aimantable bien qu'en inox" },
  { brand: 'OBUT', model: 'Match +', material: 'Acier carbone', hardness: 'Amorti + (Tendre)', targetUsage: 'Tireur', particularities: 'Finition noire mate' },
  { brand: 'OBUT', model: 'Match IT', material: 'Acier inox', hardness: 'Demi-tendre (115kg)', targetUsage: 'Pointeur / Milieu', particularities: 'Polyvalente inox' },
  { brand: 'OBUT', model: 'Match', material: 'Acier carbone', hardness: 'Demi-tendre (115kg)', targetUsage: 'Débutant / Milieu', particularities: 'Excellent rapport Q/P' },
  { brand: 'OBUT', model: 'Soleil 110', material: 'Acier inox', hardness: 'Très tendre (110kg)', targetUsage: 'Tireur', particularities: 'Toucher souple' },
  { brand: 'OBUT', model: "Ton'R 110", material: 'Acier carbone', hardness: 'Très tendre (110kg)', targetUsage: 'Tireur', particularities: 'Très mate en main' },

  // MS PÉTANQUE
  { brand: 'MS PÉTANQUE', model: 'MS 2110', material: 'Acier carbone', hardness: 'Anti-rebond (110kg)', targetUsage: 'Tireur', particularities: 'Structure interne nervurée' },
  { brand: 'MS PÉTANQUE', model: 'MS IT', material: 'Acier inox', hardness: 'Anti-rebond (115kg)', targetUsage: 'Milieu', particularities: 'Polyvalente anti-rebond' },
  { brand: 'MS PÉTANQUE', model: "L'Inox (LS)", material: 'Acier inox', hardness: 'Demi-tendre (120kg)', targetUsage: 'Pointeur', particularities: 'Très brillante' },
  { brand: 'MS PÉTANQUE', model: 'MS 120', material: 'Acier carbone', hardness: 'Demi-tendre (120kg)', targetUsage: 'Milieu', particularities: 'Classique robuste' },
  { brand: 'MS PÉTANQUE', model: 'MS Acier', material: 'Acier carbone', hardness: 'Dure (140kg)', targetUsage: 'Pointeur', particularities: 'Longévité maximale' },
  { brand: 'MS PÉTANQUE', model: 'Impact', material: 'Acier carbone', hardness: 'Tendre (115kg)', targetUsage: 'Tireur', particularities: 'Gros diamètre possible' },
  { brand: 'MS PÉTANQUE', model: 'Tortue', material: 'Acier carbone', hardness: 'Tendre (115kg)', targetUsage: 'Tireur / Milieu', particularities: 'Design "carapace"' },

  // LA BOULE BLEUE
  { brand: 'LA BOULE BLEUE', model: 'Prestige 110', material: 'Inox ou Carbone', hardness: 'Très tendre (110kg)', targetUsage: "Tireur d'élite", particularities: 'Amorti exceptionnel' },
  { brand: 'LA BOULE BLEUE', model: '115 Tendre', material: 'Inox ou Carbone', hardness: 'Tendre (115kg)', targetUsage: 'Tireur', particularities: 'Très populaire en club' },
  { brand: 'LA BOULE BLEUE', model: '120 D-Tendre', material: 'Inox ou Carbone', hardness: 'Demi-tendre (120kg)', targetUsage: 'Milieu', particularities: 'Équilibrage soigné' },
  { brand: 'LA BOULE BLEUE', model: 'Super Inox', material: 'Acier inox', hardness: 'Demi-tendre (125kg)', targetUsage: 'Pointeur', particularities: 'Le "must" des pointeurs' },

  // BOULENCIEL
  { brand: 'BOULENCIEL', model: 'Iris', material: 'Acier inox', hardness: 'Demi-tendre (125kg)', targetUsage: 'Milieu', particularities: 'Alvéoles de couleur' },
  { brand: 'BOULENCIEL', model: 'Venus', material: 'Inox ou Carbone', hardness: 'Tendre ou DT', targetUsage: 'Tireur (T) / Milieu (DT)', particularities: 'Entièrement lisse' },
  { brand: 'BOULENCIEL', model: 'Mercure', material: 'Inox ou Carbone', hardness: 'Tendre ou DT', targetUsage: 'Pointeur', particularities: 'Grandes alvéoles larges' },
  { brand: 'BOULENCIEL', model: 'Saturne', material: 'Inox ou Carbone', hardness: 'Tendre ou DT', targetUsage: 'Pointeur / Milieu', particularities: 'Petites alvéoles, grip fort' },
  { brand: 'BOULENCIEL', model: 'Mars', material: 'Inox ou Carbone', hardness: 'Tendre ou DT', targetUsage: 'Tireur / Milieu', particularities: 'Design à picots' },
  { brand: 'BOULENCIEL', model: 'RD (Rizzi)', material: 'Acier carbone', hardness: 'Très tendre (110kg)', targetUsage: "Tireur d'élite", particularities: 'Équilibrage chirurgical' },
  { brand: 'BOULENCIEL', model: 'Continental', material: 'Acier carbone', hardness: 'Demi-tendre', targetUsage: 'Débutant', particularities: 'Entrée de gamme compét.' },
  { brand: 'BOULENCIEL', model: 'Vartan 16', material: 'Acier inox', hardness: 'Demi-tendre', targetUsage: 'Pointeur', particularities: '16 stries profondes' },

  // KTK
  { brand: 'KTK', model: 'ORA', material: 'Acier inox', hardness: 'Tendre (115kg)', targetUsage: 'Tireur / Milieu', particularities: 'Design moderne' },
  { brand: 'KTK', model: 'Adventure', material: 'Acier carbone', hardness: 'Demi-tendre (125kg)', targetUsage: 'Milieu', particularities: 'Très bon équilibrage' },
  { brand: 'KTK', model: 'Victory', material: 'Acier inox', hardness: 'Demi-tendre (125kg)', targetUsage: 'Polyvalente', particularities: 'Résistante à la rouille' },
  { brand: 'KTK', model: 'Dylan Rocher', material: 'Inox ou Carbone', hardness: 'Tendre (115kg)', targetUsage: 'Tireur', particularities: 'Modèle signature' },

  // ODDEKA
  { brand: 'ODDEKA', model: 'Zeus', material: 'Inox ou Carbone', hardness: 'Très tendre (110kg)', targetUsage: 'Tireur / Élite', particularities: 'Nouvelle référence' },

  // LA FRANC
  { brand: 'LA FRANC', model: 'SM / SB', material: 'Acier carbone', hardness: 'Dure / DT', targetUsage: 'Pointeur', particularities: 'Économique et robuste' },
  { brand: 'LA FRANC', model: 'SS / ST', material: 'Inox / Carbone', hardness: 'DT / Tendre', targetUsage: 'Milieu / Tireur', particularities: 'Excellent rapport Q/P' },

  // MARATHON
  { brand: 'MARATHON', model: '600 / 700', material: 'Carbone / Inox', hardness: 'Demi-tendre', targetUsage: 'Milieu / Pointeur', particularities: 'Homologation FIPJP' },
  { brand: 'MARATHON', model: '800', material: 'Acier carbone', hardness: 'Tendre (115kg)', targetUsage: 'Tireur', particularities: 'Boule de frappe' },

  // GEOLOGIC
  { brand: 'GEOLOGIC', model: 'Delta', material: 'Acier carbone', hardness: 'Dure', targetUsage: 'Débutant / Pointeur', particularities: 'Accessible' },
  { brand: 'GEOLOGIC', model: 'Alpha', material: 'Acier carbone', hardness: 'Tendre', targetUsage: 'Tireur', particularities: 'Entrée de gamme tireur' },

  // TORO PETANK
  { brand: 'TORO PETANK', model: 'Toro Carbone', material: 'Acier carbone', hardness: 'Demi-tendre (~120kg)', targetUsage: 'Polyvalente', particularities: 'Disponible lisse ou striée' },
  { brand: 'TORO PETANK', model: 'Toro Inox', material: 'Acier inox', hardness: 'Demi-dure (~125kg)', targetUsage: 'Milieu', particularities: 'Faible entretien, lisse ou striée' },
  { brand: 'TORO PETANK', model: 'Toro 119', material: 'Acier carbone', hardness: 'Demi-tendre (~120kg)', targetUsage: 'Polyvalente', particularities: 'Modèle classique, finition lisse' },
  { brand: 'TORO PETANK', model: 'Toro 119+', material: 'Acier carbone', hardness: 'Tendre (~115kg)', targetUsage: 'Tireur', particularities: 'Stries spécifiques, meilleur amorti' },
];

// Brand visual identities for leaderboard/widget and brand picker
export const BOULES_BRAND_IMAGES: Record<string, { uri: string }> = {
  'OBUT': { uri: 'https://cdn-ai.onspace.ai/onspace/files/n7FrcpYxZXS6cHa9kERGE7/obut.png' },
  'MS PÉTANQUE': { uri: 'https://cdn-ai.onspace.ai/onspace/files/93XrD3jYsFy38KJyLNrrGm/ms_ptanque_logo.jpg' },
  'LA BOULE BLEUE': require('@/assets/images/brands/la-boule-bleue.jpg'),
  'BOULENCIEL': { uri: 'https://cdn-ai.onspace.ai/onspace/files/gxspgkgoUNfZvPdYvKHcJk/boulenciel.jpg' },
  'KTK': { uri: 'https://cdn-ai.onspace.ai/onspace/files/kXRRhZXcyEjTBu4dvkcWnP/ktk-logo-300x161.png' },
  'ODDEKA': { uri: 'https://cdn-ai.onspace.ai/onspace/files/g9wEhCzjRnnr7rKVGMVUof/oddeka-logo-16381810113.jpg' },
  'LA FRANC': { uri: 'https://cdn-ai.onspace.ai/onspace/files/j3ATX9KiArNeGMTbYooSta/La-franc-Logo-recadre.png' },
  'MARATHON': { uri: 'https://cdn-ai.onspace.ai/onspace/files/ZaEayyuTQmXnHt9HiFHXWC/marathon.png' },
  'GEOLOGIC': { uri: 'https://cdn-ai.onspace.ai/onspace/files/7tedt8XwQQXgPcrFmj5Ma5/geologic.png' },
  'TORO PETANK': { uri: 'https://cdn-ai.onspace.ai/onspace/files/eZJMF8rKcHRFfZd94gQ74J/TOro_Petank.jpg' },
};

export const BOULES_BRAND_COLORS: Record<string, { bg: string; text: string; abbr: string }> = {
  'OBUT': { bg: '#1B3A5C', text: '#FFFFFF', abbr: 'OB' },
  'MS PÉTANQUE': { bg: '#C62828', text: '#FFFFFF', abbr: 'MS' },
  'LA BOULE BLEUE': { bg: '#1565C0', text: '#FFFFFF', abbr: 'BB' },
  'BOULENCIEL': { bg: '#6A1B9A', text: '#FFFFFF', abbr: 'BC' },
  'KTK': { bg: '#2E7D32', text: '#FFFFFF', abbr: 'KTK' },
  'ODDEKA': { bg: '#E65100', text: '#FFFFFF', abbr: 'OD' },
  'LA FRANC': { bg: '#00838F', text: '#FFFFFF', abbr: 'LF' },
  'MARATHON': { bg: '#4E342E', text: '#FFFFFF', abbr: 'MA' },
  'GEOLOGIC': { bg: '#37474F', text: '#FFFFFF', abbr: 'GE' },
  'TORO PETANK': { bg: '#B91C1C', text: '#FFFFFF', abbr: 'TP' },
};

export function getBrandImage(brand: string): { uri: string } | null {
  const upper = brand.toUpperCase();
  return BOULES_BRAND_IMAGES[upper] || null;
}

export function getBrandVisual(brand: string): { bg: string; text: string; abbr: string } {
  const upper = brand.toUpperCase();
  if (BOULES_BRAND_COLORS[upper]) return BOULES_BRAND_COLORS[upper];
  // Fallback: generate from brand name
  const hue = Math.abs(brand.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360);
  return { bg: `hsl(${hue}, 55%, 40%)`, text: '#FFFFFF', abbr: brand.substring(0, 2).toUpperCase() };
}

export function getModelsByBrand(brand: string): BoulesModel[] {
  return BOULES_DATABASE.filter(b => b.brand === brand);
}

export function findModel(brand: string, model: string): BoulesModel | undefined {
  return BOULES_DATABASE.find(b => b.brand === brand && b.model === model);
}
