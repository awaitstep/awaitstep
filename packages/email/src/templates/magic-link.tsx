import Layout, { Footer } from '../layout.js'
import { Actions, Headline, Lead, Note, PrimaryButton, Raw } from '../components.js'
import { LIGHT, MONO } from '../theme.js'

interface MagicLinkEmailProps {
  url: string
  /** "Use the button below to sign in as …", markup built by the renderer. */
  leadHtml: string
  /** Device, place and time of the request, markup built by the renderer; may be empty. */
  rowsHtml: string
  footerNote: string
  appName?: string
  appUrl?: string
}

/** T1 — the sign-in link. */
export function MagicLinkEmail({
  url,
  leadHtml,
  rowsHtml,
  footerNote,
  appName = 'AwaitStep',
  appUrl,
}: MagicLinkEmailProps) {
  return (
    <Layout
      preview="This link works once and expires in 5 minutes."
      appUrl={appUrl}
      footer={<Footer note={footerNote} variant="security" appUrl={appUrl} />}
    >
      <Headline>Sign in to {appName}</Headline>
      <Lead html={leadHtml} />
      <Actions primary={<PrimaryButton href={url}>Sign in to {appName}</PrimaryButton>} />
      <p
        className="ae-faint"
        style={{ margin: '30px 0 10px', fontSize: 13, lineHeight: 1.62, color: LIGHT.faint }}
      >
        Button not working? Paste this link into your browser:
      </p>
      <p
        className="ae-faint"
        style={{
          margin: '0 0 26px',
          fontFamily: MONO,
          fontSize: 13,
          lineHeight: 1.7,
          color: LIGHT.faint,
          wordBreak: 'break-all',
        }}
      >
        {url}
      </p>
      <Raw html={rowsHtml} />
      <Note>
        If you didn&apos;t ask for this, ignore this email. Nobody can sign in without this link.
      </Note>
    </Layout>
  )
}

export default MagicLinkEmail
