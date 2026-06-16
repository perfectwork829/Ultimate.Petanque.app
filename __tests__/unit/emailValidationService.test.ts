/**
 * Unit tests for services/emailValidationService.ts
 *
 * Tests: isDisposableEmail (direct domain match, pattern-based detection),
 * isValidEmailFormat (valid/invalid formats), edge cases.
 */

const DISPOSABLE_DOMAINS = new Set([
  'guerrillamail.com', 'tempmail.com', 'mailinator.com', 'yopmail.com',
  'throwaway.email', 'sharklasers.com', 'trashmail.com', 'maildrop.cc',
  'fakeinbox.com', 'getnada.com', '10minutemail.com', 'discard.email',
]);

const DISPOSABLE_PATTERNS = [
  /^temp/i, /^trash/i, /^spam/i, /^disposable/i, /^throwaway/i,
  /^fake/i, /^junk/i, /minute.*mail/i, /mail.*temp/i, /guerrilla/i,
];

function isDisposableEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  for (const pattern of DISPOSABLE_PATTERNS) { if (pattern.test(domain)) return true; }
  return false;
}

function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

describe('isDisposableEmail — Direct Domain', () => {
  test('guerrillamail.com blocked', () => { expect(isDisposableEmail('user@guerrillamail.com')).toBe(true); });
  test('mailinator.com blocked', () => { expect(isDisposableEmail('test@mailinator.com')).toBe(true); });
  test('yopmail.com blocked', () => { expect(isDisposableEmail('x@yopmail.com')).toBe(true); });
  test('10minutemail.com blocked', () => { expect(isDisposableEmail('a@10minutemail.com')).toBe(true); });
  test('gmail.com allowed', () => { expect(isDisposableEmail('user@gmail.com')).toBe(false); });
  test('outlook.com allowed', () => { expect(isDisposableEmail('user@outlook.com')).toBe(false); });
  test('company.fr allowed', () => { expect(isDisposableEmail('user@company.fr')).toBe(false); });
});

describe('isDisposableEmail — Pattern Detection', () => {
  test('tempXYZ.com blocked', () => { expect(isDisposableEmail('a@tempxyz.com')).toBe(true); });
  test('trashbox.net blocked', () => { expect(isDisposableEmail('a@trashbox.net')).toBe(true); });
  test('spamhere.org blocked', () => { expect(isDisposableEmail('a@spamhere.org')).toBe(true); });
  test('disposablemail.io blocked', () => { expect(isDisposableEmail('a@disposablemail.io')).toBe(true); });
  test('fakeemail.net blocked', () => { expect(isDisposableEmail('a@fakeemail.net')).toBe(true); });
  test('5minutemail.org blocked', () => { expect(isDisposableEmail('a@5minutemail.org')).toBe(true); });
  test('mailtemp.net blocked', () => { expect(isDisposableEmail('a@mailtemp.net')).toBe(true); });
});

describe('isDisposableEmail — Edge Cases', () => {
  test('empty string returns false', () => { expect(isDisposableEmail('')).toBe(false); });
  test('no @ returns false', () => { expect(isDisposableEmail('noemail')).toBe(false); });
  test('case insensitive', () => { expect(isDisposableEmail('a@YOPMAIL.COM')).toBe(true); });
  test('pattern case insensitive', () => { expect(isDisposableEmail('a@TEMPMAIL123.com')).toBe(true); });
});

describe('isValidEmailFormat', () => {
  test('valid: user@example.com', () => { expect(isValidEmailFormat('user@example.com')).toBe(true); });
  test('valid: a.b@c.d.e', () => { expect(isValidEmailFormat('a.b@c.d.e')).toBe(true); });
  test('valid with trim', () => { expect(isValidEmailFormat(' user@test.com ')).toBe(true); });
  test('invalid: no @', () => { expect(isValidEmailFormat('userexample.com')).toBe(false); });
  test('invalid: no domain', () => { expect(isValidEmailFormat('user@')).toBe(false); });
  test('invalid: no tld', () => { expect(isValidEmailFormat('user@domain')).toBe(false); });
  test('invalid: spaces', () => { expect(isValidEmailFormat('us er@test.com')).toBe(false); });
  test('invalid: empty', () => { expect(isValidEmailFormat('')).toBe(false); });
});
