import Layout, { Footer } from '../layout.js'
import { Actions, Headline, Lead, Note, PrimaryButton, Raw } from '../components.js'
import { LIGHT } from '../theme.js'

interface NewSignInEmailProps {
  url: string
  rowsHtml: string
  previewLine: string
  footerNote: string
  appUrl?: string
}

/** T6 — a sign-in from a device the account hasn't used before. */
export function NewSignInEmail({
  url,
  rowsHtml,
  previewLine,
  footerNote,
  appUrl,
}: NewSignInEmailProps) {
  return (
    <Layout
      preview={previewLine}
      appUrl={appUrl}
      label="Security"
      footer={<Footer note={footerNote} variant="security" appUrl={appUrl} />}
    >
      <Headline>New sign-in to your account</Headline>
      <Lead>Your account was signed in from a device we haven&apos;t seen before.</Lead>
      <Raw html={rowsHtml} />
      <p
        className="ae-muted"
        style={{ margin: '0 0 24px', fontSize: 15.5, lineHeight: 1.68, color: LIGHT.muted }}
      >
        <b className="ae-text" style={{ fontWeight: 600, color: LIGHT.text }}>
          Not you?
        </b>{' '}
        Sign that device out now, then remove the sign-in method it used.
      </p>
      <Actions primary={<PrimaryButton href={url}>Review your sessions</PrimaryButton>} />
      <Note>If this was you, there&apos;s nothing to do.</Note>
    </Layout>
  )
}

export default NewSignInEmail
