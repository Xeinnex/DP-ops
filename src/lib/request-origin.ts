/** APP_ORIGIN is the browser-facing origin, independent of proxy transport. */
export function allowedRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Preserve support for server/CLI callers.
  try {
    const configured = process.env.APP_ORIGIN;
    const expected = configured
      ? new URL(configured).origin
      : `${new URL(request.url).protocol}//${request.headers.get("host") || new URL(request.url).host}`;
    return origin === expected;
  } catch {
    return false;
  }
}
