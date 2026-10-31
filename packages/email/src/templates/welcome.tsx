import Layout, { Footer } from '../layout.js'
import { Actions, Headline, Lead, Note, PrimaryButton, TextLink } from '../components.js'
import { FOOTER_LINKS, LIGHT } from '../theme.js'

interface WelcomeEmailProps {
  headline: string
  /** "You’re in <b>Acme Inc</b>. …", markup built by the renderer. */
  leadHtml: string
  connectUrl: string
  templatesUrl: string
  openUrl: string
  footerNote: string
  appName?: string
  appUrl?: string
}

function Step({
  n,
  title,
  body,
  children,
}: {
  n: number
  title: string
  body: string
  children?: React.ReactNode
}) {
  const cell = {
    padding: '15px 0',
    borderBottom: `1px solid ${LIGHT.line}`,
    verticalAlign: 'top' as const,
  }
  return (
    <tr>
      <td
        className="ae-faint ae-line"
        style={{ ...cell, width: 34, fontSize: 13, fontWeight: 600, color: LIGHT.faint }}
      >
        {n}
      </td>
      <td className="ae-line" style={cell}>
        <div className="ae-text" style={{ fontSize: 15, fontWeight: 600, color: LIGHT.text }}>
          {title}
        </div>
        <div
          className="ae-muted"
          style={{ marginTop: 3, fontSize: 14.5, lineHeight: 1.6, color: LIGHT.muted }}
        >
          {body}
        </div>
        {children && <div style={{ marginTop: 6, fontSize: 14.5 }}>{children}</div>}
      </td>
    </tr>
  )
}

/** T7 — the first sign-in to a new account. */
export function WelcomeEmail({
  headline,
  leadHtml,
  connectUrl,
  templatesUrl,
  openUrl,
  footerNote,
  appName = 'AwaitStep',
  appUrl,
}: WelcomeEmailProps) {
  return (
    <Layout
      preview="Three steps to your first deployed workflow."
      appUrl={appUrl}
      footer={<Footer note={footerNote} variant="settings" appUrl={appUrl} />}
    >
      <Headline>{headline}</Headline>
      <Lead html={leadHtml} />
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        className="ae-line"
        style={{
          borderCollapse: 'collapse',
          borderTop: `1px solid ${LIGHT.line}`,
          margin: '0 0 30px',
        }}
      >
        <tbody>
          <Step
            n={1}
            title="Connect Cloudflare"
            body={`Paste an API token so ${appName} can deploy for you. Takes about two minutes.`}
          >
            <TextLink href={connectUrl}>Connect Cloudflare</TextLink>
          </Step>
          <Step
            n={2}
            title="Build from a template"
            body="Start from human approval, order processing or a scheduled report."
          >
            <TextLink href={templatesUrl}>Browse templates</TextLink>
          </Step>
          <Step
            n={3}
            title="Deploy and watch it run"
            body="Every step shows up in Runs as it happens."
          />
        </tbody>
      </table>
      <Actions primary={<PrimaryButton href={openUrl}>Open {appName}</PrimaryButton>} />
      <Note>
        Stuck? The <TextLink href={FOOTER_LINKS.quickstart}>quickstart guide</TextLink> covers each
        step.
      </Note>
    </Layout>
  )
}

export default WelcomeEmail
