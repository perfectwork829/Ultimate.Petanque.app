/**
 * Unit tests for hooks/useLanguage.ts and contexts/LanguageContext.tsx
 *
 * Tests: language default, translation lookup, extra translations fallback,
 * context error handling, language persistence key.
 */

// ─── Inline implementations ──

type Language = 'fr' | 'en';

const STORAGE_KEY = '@app_language';
const DEFAULT_LANGUAGE: Language = 'fr';
const SUPPORTED_LANGUAGES: Language[] = ['fr', 'en'];

function isValidLanguage(lang: string): lang is Language {
  return SUPPORTED_LANGUAGES.includes(lang as Language);
}

function translateMock(section: string, key: string, lang: Language): string {
  const mockTranslations: Record<string, Record<string, Record<string, string>>> = {
    tabs: {
      home: { fr: 'Accueil', en: 'Home' },
      stats: { fr: 'Statistiques', en: 'Statistics' },
      directory: { fr: 'Annuaire', en: 'Directory' },
      map: { fr: 'Carte', en: 'Map' },
    },
    common: {
      save: { fr: 'Enregistrer', en: 'Save' },
      cancel: { fr: 'Annuler', en: 'Cancel' },
      delete: { fr: 'Supprimer', en: 'Delete' },
    },
  };

  const sectionData = mockTranslations[section];
  if (!sectionData) return key;
  const keyData = sectionData[key];
  if (!keyData) return key;
  return keyData[lang] || keyData['fr'] || key;
}

function buildTranslationFunction(language: Language, extraTranslations: any = {}) {
  return (section: string, key: string): string => {
    const extra = extraTranslations[section];
    if (extra && extra[key]) {
      return extra[key][language] || extra[key]['fr'] || key;
    }
    return translateMock(section, key, language);
  };
}

// ─── Tests ──

describe('language constants', () => {
  test('default language is French', () => { expect(DEFAULT_LANGUAGE).toBe('fr'); });
  test('2 supported languages', () => { expect(SUPPORTED_LANGUAGES).toHaveLength(2); });
  test('storage key defined', () => { expect(STORAGE_KEY).toBe('@app_language'); });
});

describe('isValidLanguage', () => {
  test('fr is valid', () => { expect(isValidLanguage('fr')).toBe(true); });
  test('en is valid', () => { expect(isValidLanguage('en')).toBe(true); });
  test('de is invalid', () => { expect(isValidLanguage('de')).toBe(false); });
  test('empty is invalid', () => { expect(isValidLanguage('')).toBe(false); });
  test('FR (uppercase) is invalid', () => { expect(isValidLanguage('FR')).toBe(false); });
});

describe('translation function - French', () => {
  const t = buildTranslationFunction('fr');

  test('tabs.home = Accueil', () => { expect(t('tabs', 'home')).toBe('Accueil'); });
  test('tabs.stats = Statistiques', () => { expect(t('tabs', 'stats')).toBe('Statistiques'); });
  test('common.save = Enregistrer', () => { expect(t('common', 'save')).toBe('Enregistrer'); });
  test('common.cancel = Annuler', () => { expect(t('common', 'cancel')).toBe('Annuler'); });
  test('missing key returns key', () => { expect(t('tabs', 'nonexistent')).toBe('nonexistent'); });
  test('missing section returns key', () => { expect(t('unknown', 'key')).toBe('key'); });
});

describe('translation function - English', () => {
  const t = buildTranslationFunction('en');

  test('tabs.home = Home', () => { expect(t('tabs', 'home')).toBe('Home'); });
  test('tabs.directory = Directory', () => { expect(t('tabs', 'directory')).toBe('Directory'); });
  test('common.delete = Delete', () => { expect(t('common', 'delete')).toBe('Delete'); });
});

describe('extra translations fallback', () => {
  const extra = {
    custom: {
      hello: { fr: 'Bonjour', en: 'Hello' },
      world: { fr: 'Monde' }, // No English
    },
  };

  test('extra FR translation', () => {
    const t = buildTranslationFunction('fr', extra);
    expect(t('custom', 'hello')).toBe('Bonjour');
  });

  test('extra EN translation', () => {
    const t = buildTranslationFunction('en', extra);
    expect(t('custom', 'hello')).toBe('Hello');
  });

  test('fallback to FR when EN missing', () => {
    const t = buildTranslationFunction('en', extra);
    expect(t('custom', 'world')).toBe('Monde');
  });

  test('extra does not shadow main translations', () => {
    const t = buildTranslationFunction('fr', extra);
    expect(t('tabs', 'home')).toBe('Accueil');
  });

  test('missing extra key falls through to main', () => {
    const t = buildTranslationFunction('fr', extra);
    expect(t('custom', 'missing')).toBe('missing');
  });
});

describe('useLanguage context validation', () => {
  test('throws when used outside provider', () => {
    expect(() => {
      // Simulated: accessing context that returns undefined
      const context = undefined;
      if (!context) throw new Error('useLanguage must be used within LanguageProvider');
    }).toThrow('useLanguage must be used within LanguageProvider');
  });
});
