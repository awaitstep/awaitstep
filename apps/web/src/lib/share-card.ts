/**
 * The link preview the dashboard shows when its URL is shared. The image is the website's home
 * share card; it is absolute because chat apps and social sites only fetch absolute image URLs.
 */
const TITLE = 'AwaitStep'
const DESCRIPTION =
  'Build and run durable workflows. Draw them or write them in TypeScript; AwaitStep retries what fails and shows every step.'
const IMAGE = 'https://awaitstep.dev/og/home.png'

export const SHARE_CARD_META = [
  { name: 'description', content: DESCRIPTION },
  { property: 'og:type', content: 'website' },
  { property: 'og:site_name', content: TITLE },
  { property: 'og:title', content: TITLE },
  { property: 'og:description', content: DESCRIPTION },
  { property: 'og:image', content: IMAGE },
  { property: 'og:image:width', content: '1200' },
  { property: 'og:image:height', content: '630' },
  { property: 'og:image:alt', content: 'AwaitStep: Build & Run durable workflows' },
  { name: 'twitter:card', content: 'summary_large_image' },
  { name: 'twitter:title', content: TITLE },
  { name: 'twitter:description', content: DESCRIPTION },
  { name: 'twitter:image', content: IMAGE },
] as const
