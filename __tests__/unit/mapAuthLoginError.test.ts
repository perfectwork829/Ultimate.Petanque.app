import { mapAuthLoginErrorMessage } from '../../utils/mapAuthLoginError';

const t = (_section: string, key: string) => `i18n:${key}`;

describe('mapAuthLoginErrorMessage', () => {
  it('maps invalid credentials', () => {
    expect(mapAuthLoginErrorMessage('Invalid login credentials', t)).toBe(
      'i18n:invalidCredentials'
    );
  });

  it('maps email not confirmed', () => {
    expect(mapAuthLoginErrorMessage('Email not confirmed', t)).toBe(
      'i18n:emailNotConfirmed'
    );
  });

  it('maps invalid api key', () => {
    expect(mapAuthLoginErrorMessage('Invalid API key', t)).toBe('i18n:invalidApiKey');
  });

  it('returns raw message when unknown', () => {
    expect(mapAuthLoginErrorMessage('Something else', t)).toBe('Something else');
  });
});
