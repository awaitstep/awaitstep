/**
 * The app's origins from a `CORS_ORIGIN` value: one origin or a
 * comma-separated list, blanks dropped. The first is the dashboard's, the one
 * links are built on.
 */
export function parseAppOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}
