/**
 * Email links carry their token in the fragment (`#token=...`), which browsers never send to a
 * server. Reading is pure, so React may call it more than once; removing it from the address bar
 * and history is a separate step that runs in an effect.
 */
export function readTokenFromFragment(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
}

/** Removes the token so it does not stay visible, get bookmarked, or show in a screenshot. */
export function clearFragment(): void {
  if (window.location.hash) {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }
}
