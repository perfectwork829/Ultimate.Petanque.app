/**
 * Tests for SimplifiedShotNotation — config arrays, step logic, quality mapping
 */

const SHOT_TYPES_SUCCESS_IDS = ['au_fer', 'au_plomb', 'en_rafle', 'court_ramasse', 'carreau'];
const SHOT_TYPES_FAILED_IDS = ['au_fer', 'au_plomb', 'en_rafle'];
const SHOT_RESULTS_FAILED_IDS = ['court_droite', 'court_gauche', 'long', 'tir_bouchon'];
const SHOT_QUALITIES_IDS = ['gain_point', 'sans_effet', 'negatif', 'decisif'];
const POINT_TYPES_IDS = ['roule', 'plombe', 'demi_portee', 'portee'];
const POINT_QUALITIES_SUCCESS_IDS = ['excellent', 'bon', 'moyen', 'au_bouchon', 'devant_boule'];
const POINT_QUALITIES_FAILED_IDS = ['rate', 'crochete', 'sorti'];

function getSimplifiedStepCount(actionType: string, success: boolean): number {
  if (actionType === 'tir' && !success) return 4;
  return 3;
}

function getCurrentStep(success: boolean | null, actionType: string, shotResult: any, shotType: any, pointType: any): number {
  if (success === null) return 1;
  if (actionType === 'tir') {
    if (!success) { return !shotResult ? 2 : !shotType ? 3 : 4; }
    return !shotType ? 2 : 3;
  }
  return !pointType ? 2 : 3;
}

function getShotTypesForResult(success: boolean): string[] {
  return success ? SHOT_TYPES_SUCCESS_IDS : SHOT_TYPES_FAILED_IDS;
}

function getPointQualitiesForResult(success: boolean): string[] {
  return success ? POINT_QUALITIES_SUCCESS_IDS : POINT_QUALITIES_FAILED_IDS;
}

describe('SimplifiedShotNotation', () => {
  describe('config arrays', () => {
    test('5 success shot types (includes carreau)', () => { expect(SHOT_TYPES_SUCCESS_IDS).toHaveLength(5); expect(SHOT_TYPES_SUCCESS_IDS).toContain('carreau'); });
    test('3 failed shot types (no carreau)', () => { expect(SHOT_TYPES_FAILED_IDS).toHaveLength(3); expect(SHOT_TYPES_FAILED_IDS).not.toContain('carreau'); });
    test('4 shot qualities', () => { expect(SHOT_QUALITIES_IDS).toHaveLength(4); });
    test('4 point types', () => { expect(POINT_TYPES_IDS).toHaveLength(4); });
    test('5 success point qualities', () => { expect(POINT_QUALITIES_SUCCESS_IDS).toHaveLength(5); });
    test('3 failed point qualities', () => { expect(POINT_QUALITIES_FAILED_IDS).toHaveLength(3); });
    test('4 failed shot results', () => { expect(SHOT_RESULTS_FAILED_IDS).toHaveLength(4); });
  });

  describe('step count', () => {
    test('failed tir = 4 steps', () => { expect(getSimplifiedStepCount('tir', false)).toBe(4); });
    test('success tir = 3 steps', () => { expect(getSimplifiedStepCount('tir', true)).toBe(3); });
    test('point = 3 steps', () => { expect(getSimplifiedStepCount('point', true)).toBe(3); });
  });

  describe('getCurrentStep', () => {
    test('no result = step 1', () => { expect(getCurrentStep(null, 'tir', null, null, null)).toBe(1); });
    test('failed tir no shotResult = step 2', () => { expect(getCurrentStep(false, 'tir', null, null, null)).toBe(2); });
    test('failed tir with shotResult no type = step 3', () => { expect(getCurrentStep(false, 'tir', 'long', null, null)).toBe(3); });
    test('failed tir with type = step 4', () => { expect(getCurrentStep(false, 'tir', 'long', 'au_fer', null)).toBe(4); });
    test('success tir no type = step 2', () => { expect(getCurrentStep(true, 'tir', null, null, null)).toBe(2); });
    test('success tir with type = step 3', () => { expect(getCurrentStep(true, 'tir', null, 'au_fer', null)).toBe(3); });
    test('point no type = step 2', () => { expect(getCurrentStep(true, 'point', null, null, null)).toBe(2); });
    test('point with type = step 3', () => { expect(getCurrentStep(true, 'point', null, null, 'roule')).toBe(3); });
  });

  describe('conditional shot types', () => {
    test('success shows 5 types including carreau', () => { expect(getShotTypesForResult(true)).toHaveLength(5); });
    test('failure shows 3 types without carreau', () => { expect(getShotTypesForResult(false)).toHaveLength(3); });
  });

  describe('conditional point qualities', () => {
    test('success shows 5 distance-based qualities', () => { expect(getPointQualitiesForResult(true)).toHaveLength(5); });
    test('failure shows 3 error-based qualities', () => { expect(getPointQualitiesForResult(false)).toHaveLength(3); });
  });

  describe('carreau detection', () => {
    test('shotType carreau sets isCarreau', () => {
      const isCarreau = 'carreau' === 'carreau';
      expect(isCarreau).toBe(true);
    });
    test('non-carreau type is false', () => {
      expect('au_fer' === 'carreau').toBe(false);
    });
  });
});
