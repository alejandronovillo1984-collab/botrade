const SESSION_COOKIE = '__session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5; // 5 días

function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'https:';
}

export function setSessionCookie(value: string): void {
  if (typeof document === 'undefined') return;
  const secure = isSecureContext() ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  const secure = isSecureContext() ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
}
