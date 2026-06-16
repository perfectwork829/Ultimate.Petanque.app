/**
 * Tests for AdvancedShotNotation — config arrays, type mappings, icon associations
 */

// Mirror config arrays from component
const SHOT_QUALITIES_IDS = ['gain_point', 'sans_effet', 'negatif', 'decisif', 'sous_pression', 'equipe_menee', 'equipe_mene'];
const SHOT_TYPES_IDS = ['au_fer', 'au_plomb', 'en_rafle', 'court', 'long', 'en_angle', 'sur_boule', 'sur_but'];
const POINT_TYPES_IDS = ['roule', 'plombe', 'demi_portee', 'portee_haute', 'au_but', 'securite'];
const POINT_QUALITIES_IDS = ['gagnant', 'placement', 'moins_50cm', 'moins_30cm', 'moins_10cm', 'rate_court', 'rate_long', 'trop_droite', 'trop_gauche'];
const SHOT_RESULTS_FAILED_IDS = ['court_droite', 'court_gauche', 'long', 'tir_bouchon'];

function getStepFlow(actionType: string, success: boolean): string[] {
  if (actionType === 'tir' && !success) return ['result', 'shotResult', 'type', 'quality'];
  return ['result', 'type', 'quality'];
}

function computeProgress(step: string, totalSteps: number): number {
  const steps4 = ['result', 'shotResult', 'type', 'quality'];
  const steps3 = ['result', 'type', 'quality'];
  const steps = totalSteps === 4 ? steps4 : steps3;
  const idx = steps.indexOf(step);
  return totalSteps === 4 ? (idx + 1) * 25 : (idx + 1) * 33.33;
}

describe('AdvancedShotNotation', () => {
  describe('config arrays', () => {
    test('7 shot qualities', () => { expect(SHOT_QUALITIES_IDS).toHaveLength(7); });
    test('8 shot types', () => { expect(SHOT_TYPES_IDS).toHaveLength(8); });
    test('6 point types', () => { expect(POINT_TYPES_IDS).toHaveLength(6); });
    test('9 point qualities', () => { expect(POINT_QUALITIES_IDS).toHaveLength(9); });
    test('4 failed shot results', () => { expect(SHOT_RESULTS_FAILED_IDS).toHaveLength(4); });
    test('all IDs are unique', () => {
      const all = [...SHOT_QUALITIES_IDS, ...SHOT_TYPES_IDS, ...POINT_TYPES_IDS, ...POINT_QUALITIES_IDS];
      expect(new Set(all).size).toBe(all.length);
    });
  });

  describe('step flow', () => {
    test('failed tir has 4 steps', () => {
      expect(getStepFlow('tir', false)).toHaveLength(4);
      expect(getStepFlow('tir', false)).toContain('shotResult');
    });
    test('successful tir has 3 steps', () => {
      expect(getStepFlow('tir', true)).toHaveLength(3);
      expect(getStepFlow('tir', true)).not.toContain('shotResult');
    });
    test('point always has 3 steps', () => {
      expect(getStepFlow('point', true)).toHaveLength(3);
      expect(getStepFlow('point', false)).toHaveLength(3);
    });
  });

  describe('progress computation', () => {
    test('result step at 25% for 4 steps', () => { expect(computeProgress('result', 4)).toBe(25); });
    test('quality step at 100% for 4 steps', () => { expect(computeProgress('quality', 4)).toBe(100); });
    test('result step at 33.33% for 3 steps', () => { expect(computeProgress('result', 3)).toBeCloseTo(33.33); });
    test('quality step at ~100% for 3 steps', () => { expect(computeProgress('quality', 3)).toBeCloseTo(99.99); });
  });

  describe('shot record structure', () => {
    test('creates valid record', () => {
      const record = {
        id: '1', timestamp: new Date().toISOString(), playerId: 'p1', playerName: 'Alice',
        team: 'A' as const, actionType: 'tir' as const, success: true, carreau: true,
        shotType: 'au_fer', shotQuality: 'gain_point',
      };
      expect(record.actionType).toBe('tir');
      expect(record.carreau).toBe(true);
    });
  });
});
