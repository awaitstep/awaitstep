/**
 * The site's /llms.txt (llmstxt.org): what AwaitStep is and where each page and doc lives, in
 * plain Markdown, from the same copy the pages use.
 */
import { CHANGELOG_PAGE } from './changelog'
import { HERO, META } from './home'
import { INTEGRATIONS_PAGE } from './integrations'
import { PRICING_PAGE } from './pricing'
import { DOCS_URL, INSTALL_URL, REPO_URL } from './site'
import { USE_CASES_PAGE } from './use-cases'

export function llmsText(site: URL): string {
  const page = (path: string) => new URL(path, site).toString()
  const { before, accent, after } = HERO.titleSecond
  return [
    '# AwaitStep',
    '',
    `> ${HERO.title} ${before}${accent}${after} ${META.description}`,
    '',
    '## Pages',
    '',
    `- [Home](${page('/')}): ${HERO.line}`,
    `- [Use cases](${page('/use-cases')}): ${USE_CASES_PAGE.description}`,
    `- [Integrations](${page('/integrations')}): ${INTEGRATIONS_PAGE.description}`,
    `- [Pricing](${page('/pricing')}): ${PRICING_PAGE.description}`,
    `- [Changelog](${page('/changelog')}): ${CHANGELOG_PAGE.description}`,
    '',
    '## Docs',
    '',
    `- [Documentation](${DOCS_URL}): building workflows, nodes, the API and agents`,
    `- [Self-host](${INSTALL_URL}): run the open-source edition with Docker`,
    `- [Source](${REPO_URL}): the open-source repository, AGPL-3.0`,
    '',
  ].join('\n')
}
