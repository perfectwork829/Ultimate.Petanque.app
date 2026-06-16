/** Map raw Supabase/auth errors to localized login messages. */
export function mapAuthLoginErrorMessage(
  rawError: string,
  t: (section: string, key: string) => string
): string {
  const m = rawError.toLowerCase();

  if (
    m.includes('invalid login credentials') ||
    m.includes('invalid email or password') ||
    m.includes('invalid credentials')
  ) {
    return t('login', 'invalidCredentials');
  }
  if (m.includes('email not confirmed')) {
    return t('login', 'emailNotConfirmed');
  }
  if (m.includes('invalid api key')) {
    return t('login', 'invalidApiKey');
  }
  if (
    m.includes('failed to load user profile') ||
    m.includes('failed to load profile')
  ) {
    return t('login', 'loginSessionFailed');
  }
  if (m.includes('timeout')) {
    return t('login', 'loginTimeout');
  }

  return rawError;
}
