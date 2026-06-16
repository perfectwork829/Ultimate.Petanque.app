/** Supabase email OTP is typically 6–8 digits (set in Dashboard → Auth → Email). */
export const AUTH_EMAIL_OTP_MIN_LENGTH = 6;
export const AUTH_EMAIL_OTP_MAX_LENGTH = 10;

const parsed = parseInt(process.env.EXPO_PUBLIC_AUTH_OTP_LENGTH ?? '6', 10);
/** Hint for UI copy; verification accepts any length in [MIN, MAX]. */
export const AUTH_EMAIL_OTP_LENGTH =
  Number.isFinite(parsed) && parsed >= AUTH_EMAIL_OTP_MIN_LENGTH && parsed <= AUTH_EMAIL_OTP_MAX_LENGTH
    ? parsed
    : AUTH_EMAIL_OTP_MIN_LENGTH;

export function normalizeEmailOtpInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, AUTH_EMAIL_OTP_MAX_LENGTH);
}

export function isCompleteEmailOtp(value: string): boolean {
  const len = normalizeEmailOtpInput(value).length;
  return len >= AUTH_EMAIL_OTP_MIN_LENGTH && len <= AUTH_EMAIL_OTP_MAX_LENGTH;
}
