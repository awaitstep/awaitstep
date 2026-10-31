import Layout, { Footer } from '../layout.js'
import { Actions, Headline, Lead, Note, PrimaryButton, Raw } from '../components.js'
import { LIGHT } from '../theme.js'

interface InvitationEmailProps {
  url: string
  orgName: string
  inviterName: string
  inviterInitials: string
  rowsHtml: string
  previewLine: string
  noteLine: string
  footerNote: string
  appName?: string
  appUrl?: string
}

/** T2 — an admin invited this address. */
export function InvitationEmail({
  url,
  orgName,
  inviterName,
  inviterInitials,
  rowsHtml,
  previewLine,
  noteLine,
  footerNote,
  appName = 'AwaitStep',
  appUrl,
}: InvitationEmailProps) {
  return (
    <Layout
      preview={previewLine}
      appUrl={appUrl}
      label="Invite"
      footer={<Footer note={footerNote} variant="settings" appUrl={appUrl} />}
    >
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '0 0 20px' }}>
        <tbody>
          <tr>
            <td
              className="ae-rail"
              align="center"
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                backgroundColor: LIGHT.rail,
                color: LIGHT.muted,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {inviterInitials}
            </td>
            <td
              className="ae-muted"
              style={{ paddingLeft: 11, fontSize: 14.5, color: LIGHT.muted }}
            >
              <b className="ae-text" style={{ fontWeight: 600, color: LIGHT.text }}>
                {inviterName}
              </b>{' '}
              invited you to join
            </td>
          </tr>
        </tbody>
      </table>
      <Headline>
        Join {orgName} on {appName}
      </Headline>
      <Lead>Build, run and deploy durable workflows on Cloudflare together with your team.</Lead>
      <Raw html={rowsHtml} />
      <Actions primary={<PrimaryButton href={url}>Accept invite</PrimaryButton>} />
      <Note>{noteLine}</Note>
    </Layout>
  )
}

export default InvitationEmail
