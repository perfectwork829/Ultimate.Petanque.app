/**
 * Unit Tests: i18n Translation Keys
 * 
 * Verifies translation completeness, key consistency,
 * and that both FR and EN are always present.
 */

import { extraTranslations } from '@/constants/i18nExtra';

// ============================================================================
// extraTranslations Structure Tests
// ============================================================================

describe('extraTranslations', () => {
  describe('shareModal section', () => {
    it('should have all required keys', () => {
      const requiredKeys = [
        'shareTitle', 'readOnly', 'generateCode', 'codeCreated',
        'copy', 'shareBtn', 'copyCode', 'shareMessage',
      ];
      requiredKeys.forEach(key => {
        expect(extraTranslations.shareModal).toHaveProperty(key);
      });
    });

    it('should have both FR and EN for every key', () => {
      Object.entries(extraTranslations.shareModal).forEach(([key, value]) => {
        expect(value).toHaveProperty('fr');
        expect(value).toHaveProperty('en');
        expect(typeof (value as any).fr).toBe('string');
        expect(typeof (value as any).en).toBe('string');
        expect((value as any).fr.length).toBeGreaterThan(0);
        expect((value as any).en.length).toBeGreaterThan(0);
      });
    });
  });

  describe('modificationLogs section', () => {
    it('should have all required keys', () => {
      const requiredKeys = [
        'score', 'successCount', 'successRate', 'carreauCount',
        'totalPoints', 'duration', 'notes', 'winner', 'format',
        'revertField', 'revertConfirmTitle', 'revertConfirmMsg',
        'revertSuccess', 'revertError', 'reverting',
        'revertAll', 'revertAllConfirmTitle', 'revertAllConfirmMsg',
        'revertAllSuccess', 'revertAllError',
      ];
      requiredKeys.forEach(key => {
        expect(extraTranslations.modificationLogs).toHaveProperty(key);
      });
    });

    it('should have both FR and EN for every key', () => {
      Object.entries(extraTranslations.modificationLogs).forEach(([key, value]) => {
        expect(value).toHaveProperty('fr');
        expect(value).toHaveProperty('en');
        expect(typeof (value as any).fr).toBe('string');
        expect(typeof (value as any).en).toBe('string');
      });
    });
  });

  describe('matchSharing section', () => {
    it('should have all required keys', () => {
      const requiredKeys = [
        'shareStatusTitle', 'noShares', 'noSharesDesc',
        'statusPending', 'statusAccepted', 'statusDeclined',
        'permissionRead', 'permissionWrite',
        'revokeShare', 'revokeShareConfirm', 'shareRevoked',
      ];
      requiredKeys.forEach(key => {
        expect(extraTranslations.matchSharing).toHaveProperty(key);
      });
    });

    it('should have both FR and EN for every key', () => {
      Object.entries(extraTranslations.matchSharing).forEach(([key, value]) => {
        expect(value).toHaveProperty('fr');
        expect(value).toHaveProperty('en');
      });
    });
  });

  describe('no empty translations', () => {
    const allSections = Object.entries(extraTranslations);

    allSections.forEach(([section, keys]) => {
      describe(`section: ${section}`, () => {
        Object.entries(keys).forEach(([key, value]) => {
          it(`${key} should not have empty values`, () => {
            const val = value as { fr: string; en: string };
            expect(val.fr).toBeTruthy();
            expect(val.en).toBeTruthy();
          });
        });
      });
    });
  });
});
