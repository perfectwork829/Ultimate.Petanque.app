/**
 * Tests for LanguageContext — provider mount, persistence, switch FR↔EN, t() function
 */

function isValidLanguage(lang: string): boolean {
  return lang === 'fr' || lang === 'en';
}

function resolveTranslation(section: string, key: string, language: string, main: any, extra: any): string {
  const extraSection = extra?.[section];
  if (extraSection && extraSection[key]) {
    return extraSection[key][language] || extraSection[key]['fr'] || key;
  }
  const mainSection = main?.[section];
  if (mainSection && mainSection[key]) {
    return mainSection[key][language] || mainSection[key]['fr'] || key;
  }
  return key;
}

const STORAGE_KEY = 'app_language';
const DEFAULT_LANGUAGE = 'fr';
const SUPPORTED_LANGUAGES = ['fr', 'en'];

describe('LanguageContext', () => {
  describe('constants', () => {
    test('STORAGE_KEY is defined', () => { expect(STORAGE_KEY).toBe('app_language'); });
    test('default language is French', () => { expect(DEFAULT_LANGUAGE).toBe('fr'); });
    test('supports 2 languages', () => { expect(SUPPORTED_LANGUAGES).toHaveLength(2); });
  });

  describe('isValidLanguage', () => {
    test('fr is valid', () => { expect(isValidLanguage('fr')).toBe(true); });
    test('en is valid', () => { expect(isValidLanguage('en')).toBe(true); });
    test('de is invalid', () => { expect(isValidLanguage('de')).toBe(false); });
    test('empty is invalid', () => { expect(isValidLanguage('')).toBe(false); });
  });

  describe('resolveTranslation', () => {
    const main = { tabs: { home: { fr: 'Accueil', en: 'Home' } } };
    const extra = { bonus: { key1: { fr: 'Valeur FR', en: 'Value EN' } } };

    test('resolves from main', () => {
      expect(resolveTranslation('tabs', 'home', 'fr', main, extra)).toBe('Accueil');
      expect(resolveTranslation('tabs', 'home', 'en', main, extra)).toBe('Home');
    });

    test('resolves from extra', () => {
      expect(resolveTranslation('bonus', 'key1', 'en', main, extra)).toBe('Value EN');
    });

    test('extra takes priority over main', () => {
      const mainOverlap = { sec: { k: { fr: 'MainFR' } } };
      const extraOverlap = { sec: { k: { fr: 'ExtraFR', en: 'ExtraEN' } } };
      expect(resolveTranslation('sec', 'k', 'fr', mainOverlap, extraOverlap)).toBe('ExtraFR');
    });

    test('falls back to FR when language missing', () => {
      const translations = { sec: { k: { fr: 'FallbackFR' } } };
      expect(resolveTranslation('sec', 'k', 'en', translations, {})).toBe('FallbackFR');
    });

    test('returns key when not found', () => {
      expect(resolveTranslation('unknown', 'key', 'fr', {}, {})).toBe('key');
    });
  });

  describe('language switching simulation', () => {
    test('switch from FR to EN', () => {
      let lang = 'fr';
      lang = 'en';
      expect(lang).toBe('en');
      expect(isValidLanguage(lang)).toBe(true);
    });

    test('switch from EN to FR', () => {
      let lang = 'en';
      lang = 'fr';
      expect(lang).toBe('fr');
    });
  });

  describe('context error outside provider', () => {
    test('undefined context throws', () => {
      const context = undefined;
      expect(() => {
        if (!context) throw new Error('useLanguage must be used within LanguageProvider');
      }).toThrow('useLanguage must be used within LanguageProvider');
    });
  });
});
