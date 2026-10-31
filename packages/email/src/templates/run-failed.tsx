import Layout, { Footer } from '../layout.js'
import { Actions, Headline, Lead, Note, PrimaryButton, Raw, Status } from '../components.js'

interface RunFailedEmailProps {
  url: string
  headline: string
  statusLabel: string
  /** `danger` while it fails, `ok` once it recovers. */
  tone: 'danger' | 'ok'
  leadLine: string
  /** The strip of recent runs, markup built by the renderer; empty when not known. */
  runsHtml: string
  rowsHtml: string
  openWorkflowHtml: string
  noteLine: string
  previewLine: string
  footerNote: string
  appUrl?: string
}

/** T4 — a workflow keeps failing at one step, or has recovered. */
export function RunFailedEmail({
  url,
  headline,
  statusLabel,
  tone,
  leadLine,
  runsHtml,
  rowsHtml,
  openWorkflowHtml,
  noteLine,
  previewLine,
  footerNote,
  appUrl,
}: RunFailedEmailProps) {
  return (
    <Layout
      preview={previewLine}
      appUrl={appUrl}
      label="Alert"
      footer={<Footer note={footerNote} variant="settings" appUrl={appUrl} />}
    >
      <Status tone={tone}>{statusLabel}</Status>
      <Headline>{headline}</Headline>
      <Lead>{leadLine}</Lead>
      <Raw html={runsHtml} />
      <Raw html={rowsHtml} />
      <Actions
        primary={<PrimaryButton href={url}>See runs</PrimaryButton>}
        secondaryHtml={openWorkflowHtml}
      />
      <Note>{noteLine}</Note>
    </Layout>
  )
}

export default RunFailedEmail
