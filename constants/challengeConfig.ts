/**
 * Challenge configuration constants.
 * Extracted from services/mockData.ts for clean architecture.
 */

import type { PrecisionAtelierConfig, PrecisionDistance } from '@/types/petanque';

export const PRECISION_ATELIERS: PrecisionAtelierConfig[] = [
  {
    id: 'boule_seule',
    name: 'Tir de boule seule',
    description: 'Tirer une boule isolée placée dans un cercle',
    icon: 'radio-button-checked',
    scoringOptions: [
      { points: 0, label: 'Raté', description: 'Boule cible non touchée' },
      { points: 1, label: 'Touché', description: 'Boule cible frappée mais reste dans le cercle' },
      { points: 3, label: 'Sorti', description: 'Boule cible frappée et sort du cercle' },
      { points: 5, label: 'Carreau', description: 'Boule envoyée reste dans le cercle après avoir frappé la cible' },
    ]
  },
  {
    id: 'derriere_but',
    name: 'Boule derrière le but',
    description: 'Tirer une boule placée derrière le cochonnet sans toucher le but',
    icon: 'gps-fixed',
    scoringOptions: [
      { points: 0, label: 'Raté', description: 'Boule non touchée, sol touché avant, ou but touché en premier' },
      { points: 1, label: 'Touché', description: 'Boule cible frappée en premier mais reste dans le cercle' },
      { points: 3, label: 'Sorti', description: 'Boule cible frappée en premier et sort du cercle' },
      { points: 5, label: 'Carreau', description: 'Boule envoyée reste dans le cercle sans toucher le but' },
    ]
  },
  {
    id: 'entre_2_boules',
    name: 'Entre 2 boules',
    description: 'Tirer une boule placée entre deux boules obstacles',
    icon: 'more-horiz',
    scoringOptions: [
      { points: 0, label: 'Raté', description: 'Obstacle touché en premier ou obstacle sorti après touche' },
      { points: 1, label: 'Touché', description: 'Cible frappée, obstacle touché mais reste, ou cible reste dans cercle' },
      { points: 3, label: 'Sorti', description: 'Cible sort du cercle sans toucher les obstacles' },
      { points: 5, label: 'Carreau', description: 'Boule envoyée reste dans le cercle sans toucher les obstacles' },
    ]
  },
  {
    id: 'sautee',
    name: 'Tir à la sautée',
    description: 'Tir en cloche par-dessus une boule obstacle',
    icon: 'flight-takeoff',
    scoringOptions: [
      { points: 0, label: 'Raté', description: 'Obstacle touché en premier ou obstacle sorti au recul' },
      { points: 1, label: 'Touché', description: 'Cible touchée, obstacle touché au recul mais reste, ou cible reste' },
      { points: 3, label: 'Sorti', description: 'Cible sort du cercle sans déplacer l\'obstacle' },
      { points: 5, label: 'Carreau', description: 'Boule envoyée reste dans le cercle sans déplacer l\'obstacle' },
    ]
  },
  {
    id: 'tir_but',
    name: 'Tir de but',
    description: 'Tirer directement le cochonnet',
    icon: 'stars',
    scoringOptions: [
      { points: 0, label: 'Raté', description: 'But non touché' },
      { points: 3, label: 'Touché', description: 'But frappé mais reste dans le cercle' },
      { points: 5, label: 'Sorti', description: 'But frappé et sort du cercle' },
    ]
  },
];

export const PRECISION_DISTANCES: PrecisionDistance[] = [6, 7, 8, 9];

export const PRECISION_POINTS_CONFIG = {
  carreau: 5,
  touche: 3,
  frole: 1,
  rate: 0,
};
