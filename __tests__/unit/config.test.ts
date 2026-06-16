/**
 * Tests for constants/config.ts — URLs, game rules, enums, feature flags
 */

import config, { SENTRY_DSN, tournamentLevels, tournamentCategories, registrationTypes, tournamentScopes } from '@/constants/config';

describe('config constants', () => {
  describe('app identity', () => {
    test('appName is defined', () => { expect(config.appName).toBeTruthy(); });
    test('version follows semver', () => { expect(config.version).toMatch(/^\d+\.\d+\.\d+$/); });
    test('appDownloadUrl is HTTPS', () => { expect(config.appDownloadUrl.startsWith('https://')).toBe(true); });
  });

  describe('game rules', () => {
    test('maxScore is 13', () => { expect(config.game.maxScore).toBe(13); });
    test('3 formats', () => { expect(config.game.formats).toHaveLength(3); });
    test('formats include Doublette', () => { expect(config.game.formats).toContain('Doublette'); });
    test('boulesPerPlayer for each format', () => {
      expect(config.game.boulesPerPlayer['Tête-à-tête']).toBe(3);
      expect(config.game.boulesPerPlayer['Doublette']).toBe(3);
      expect(config.game.boulesPerPlayer['Triplette']).toBe(2);
    });
  });

  describe('match modes', () => {
    test('2 modes', () => { expect(config.matchModes).toHaveLength(2); });
    test('includes Entraînement', () => { expect(config.matchModes).toContain('Entraînement'); });
    test('includes Tournoi', () => { expect(config.matchModes).toContain('Tournoi'); });
  });

  describe('tournament types', () => {
    test('7 types', () => { expect(config.tournamentTypes).toHaveLength(7); });
    test('includes Poules', () => { expect(config.tournamentTypes).toContain('Poules'); });
    test('includes Mixte', () => { expect(config.tournamentTypes).toContain('Mixte'); });
  });

  describe('player roles', () => {
    test('3 roles', () => { expect(config.playerRoles).toHaveLength(3); });
    test('includes Pointeur/Tireur/Milieu', () => {
      expect(config.playerRoles).toContain('Pointeur');
      expect(config.playerRoles).toContain('Tireur');
      expect(config.playerRoles).toContain('Milieu');
    });
  });

  describe('terrain types', () => {
    test('5 terrain types', () => { expect(config.terrainTypes).toHaveLength(5); });
    test('each has id/label/icon/description', () => {
      config.terrainTypes.forEach(t => {
        expect(t.id).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.icon).toBeTruthy();
        expect(t.description).toBeTruthy();
      });
    });
  });

  describe('terrain environments', () => {
    test('2 environments', () => { expect(config.terrainEnvironments).toHaveLength(2); });
    test('indoor and outdoor', () => {
      expect(config.terrainEnvironments.map(e => e.id)).toContain('indoor');
      expect(config.terrainEnvironments.map(e => e.id)).toContain('outdoor');
    });
  });

  describe('map settings', () => {
    test('defaultRegion is France center', () => {
      expect(config.map.defaultRegion.latitude).toBeCloseTo(46.6, 0);
      expect(config.map.defaultRegion.longitude).toBeCloseTo(1.9, 0);
    });
    test('marker colors for 3 entity types', () => {
      expect(config.map.markerColors.club).toBeTruthy();
      expect(config.map.markerColors.player).toBeTruthy();
      expect(config.map.markerColors.tournament).toBeTruthy();
    });
  });

  describe('tournament enums', () => {
    test('tournamentLevels has 8 levels', () => { expect(tournamentLevels).toHaveLength(8); });
    test('tournamentCategories has 4', () => { expect(tournamentCategories).toHaveLength(4); });
    test('registrationTypes has 4', () => { expect(registrationTypes).toHaveLength(4); });
    test('tournamentScopes has 6', () => { expect(tournamentScopes).toHaveLength(6); });
  });

  describe('SENTRY_DSN', () => {
    test('is placeholder', () => { expect(SENTRY_DSN).toBe('YOUR_SENTRY_DSN'); });
  });

  describe('shot types', () => {
    test('3 shot types', () => { expect(config.shotTypes).toHaveLength(3); });
    test('each has id/label/icon', () => {
      config.shotTypes.forEach(s => {
        expect(s.id).toBeTruthy();
        expect(s.label).toBeTruthy();
        expect(s.icon).toBeTruthy();
      });
    });
  });
});
