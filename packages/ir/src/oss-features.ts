// The open-source features an instance can switch off, so a wrapping
// workspace can put its own in their place. The API refuses a name not
// listed here, and lists the switched-off ones in `GET /api/instance` →
// `disabled` for the dashboard to hide.

/** Every switchable feature, with what switching it off removes. */
export const OSS_FEATURES = {
  playground: 'The API Playground page and its links in the rail and account menu.',
  'connections.ui':
    'The Connections pages and their nav entries. Connections themselves stay: deploys still use them.',
  'connections.apiTokens':
    'Connecting or re-keying a Cloudflare account with a pasted API token. OAuth is unaffected.',
} as const satisfies Record<string, string>

export type OssFeature = keyof typeof OSS_FEATURES

/** Whether `name` is a switchable feature. */
export function isOssFeature(name: unknown): name is OssFeature {
  return typeof name === 'string' && Object.hasOwn(OSS_FEATURES, name)
}

/**
 * The switched-off features, each once, in `OSS_FEATURES` order. Throws on a
 * name that is not one: a misspelt switch must not leave the feature on.
 */
export function checkDisabledFeatures(names: readonly unknown[]): OssFeature[] {
  for (const name of names) {
    if (!isOssFeature(name)) {
      const known = Object.keys(OSS_FEATURES).join(', ')
      throw new Error(`Unknown feature switch "${String(name)}". Known: ${known}.`)
    }
  }
  return (Object.keys(OSS_FEATURES) as OssFeature[]).filter((feature) => names.includes(feature))
}
