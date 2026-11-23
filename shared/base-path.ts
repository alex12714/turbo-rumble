/**
 * Optional URL prefix when the game is served below a path, e.g. `/g/rumble`.
 * The empty string (the default) serves the game from the origin root.
 */
export function parseBasePath(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (value === '') return '';
  if (
    !/^(\/[A-Za-z0-9._~-]+)+$/.test(value) ||
    value.split('/').some((s) => s === '..' || s === '.')
  )
    throw new Error(
      'BASE_PATH must look like /g/game: absolute, without query, dots or a trailing slash',
    );
  return value;
}

/** Strips the base path from a request or location pathname; outside the base it is returned as-is. */
export function stripBasePath(pathname: string, basePath: string): string {
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  return pathname.startsWith(basePath + '/') ? pathname.slice(basePath.length) : pathname;
}

/**
 * Origins allowed to frame the game and to receive its embed status messages
 * (`EMBED_ORIGINS`, space or comma separated). Empty keeps framing unrestricted, as before.
 */
export function parseEmbedOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? '').split(/[\s,]+/).filter(Boolean);
  return origins.map((value) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value.replace(/\/$/, ''))
      throw new Error('EMBED_ORIGINS must list http(s) origins without paths');
    return url.origin;
  });
}
