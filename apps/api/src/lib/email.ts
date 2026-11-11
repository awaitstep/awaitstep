import { Resend } from 'resend'
import {
  renderAccessRequestEmail,
  renderInvitationEmail,
  renderInviteRequestEmail,
  renderMagicLinkEmail,
  renderRunFailedEmail,
  subjectText,
} from '@awaitstep/email'
import type {
  AccessRequestEmail,
  AppEmails,
  InvitationEmail,
  InviteRequestEmail,
  RunFailedEmail,
} from '../types.js'

interface EmailServiceOptions {
  apiKey: string
  fromAddress?: string
  appName?: string
  appUrl?: string
}

export function createEmailService(options: EmailServiceOptions) {
  const resend = new Resend(options.apiKey)
  const from = options.fromAddress ?? 'AwaitStep <noreply@awaitstep.dev>'
  const appName = options.appName
  const appUrl = options.appUrl

  return {
    async sendMagicLink(data: { email: string; url: string }) {
      const { html, text } = await renderMagicLinkEmail({
        url: data.url,
        to: data.email,
        appName,
        appUrl,
      })
      await resend.emails.send({
        from,
        to: data.email,
        subject: `Sign in to ${appName ?? 'AwaitStep'}`,
        html,
        text,
      })
    },

    async sendInvitation(data: InvitationEmail) {
      const { html, text } = await renderInvitationEmail({ ...data, appName, appUrl })
      await resend.emails.send({
        from,
        to: data.to,
        subject: subjectText(`${data.inviterName} invited you to ${data.orgName}`),
        html,
        text,
      })
    },

    async sendInviteRequest(data: InviteRequestEmail) {
      const { html, text } = await renderInviteRequestEmail({ ...data, appName, appUrl })
      await resend.emails.send({
        from,
        to: data.to,
        subject: subjectText(`${data.askerEmail} asked for a new invite to ${data.orgName}`),
        html,
        text,
      })
    },

    async sendAccessRequest(data: AccessRequestEmail) {
      const { html, text } = await renderAccessRequestEmail({
        ...data,
        kind: 'edit',
        appName,
        appUrl,
      })
      await resend.emails.send({
        from,
        to: data.to,
        subject: subjectText(`${data.askerName} asked for edit access to ${data.workspaceName}`),
        html,
        text,
      })
    },

    async sendRunFailed(data: RunFailedEmail) {
      const { html, text } = await renderRunFailedEmail({ ...data, appName, appUrl })
      await resend.emails.send({
        from,
        to: data.to,
        subject: subjectText(
          data.call ? `A call to ${data.workflowName} failed` : `${data.workflowName} failed`,
        ),
        html,
        text,
      })
    },
  }
}

export type EmailService = ReturnType<typeof createEmailService>

/**
 * The app's mail, with the links built on the web app's origin. Without a
 * mail service nothing is sent; with `logLinks` the links are logged
 * instead, as magic links are — a dev or QA self-host with no Resend key
 * still has a way to hand an invite over. An invite link is the invitation,
 * so a deployment has to ask for that: logs are not a private place.
 */
export function createAppEmails(options: {
  webUrl: string
  service: EmailService | null
  logLinks: boolean
  log: (message: string) => void
}): AppEmails {
  const base = options.webUrl.replace(/\/$/, '')
  return {
    inviteUrl: (id) => `${base}/invite/${encodeURIComponent(id)}`,
    membersUrl: (orgSlug) => `${base}/${encodeURIComponent(orgSlug)}/settings/members`,
    inboxUrl: (orgSlug) => `${base}/${encodeURIComponent(orgSlug)}/inbox`,
    runsUrl: (slugs) =>
      `${base}/${[slugs.org, slugs.project, slugs.workspace].map(encodeURIComponent).join('/')}/runs`,
    async sendInvitation(data) {
      if (options.service) return options.service.sendInvitation(data)
      options.log(
        options.logLinks
          ? `Invitation for ${data.to} to ${data.orgName}: ${data.url}`
          : `Invitation for ${data.to} to ${data.orgName} not sent: no email service (set LOG_EMAIL_LINKS=1 to log links)`,
      )
    },
    async sendInviteRequest(data) {
      if (options.service) return options.service.sendInviteRequest(data)
      options.log(
        options.logLinks
          ? `${data.askerEmail} asked ${data.to} for a new invite to ${data.orgName}: ${data.url}`
          : `${data.askerEmail} asked ${data.to} for a new invite to ${data.orgName}: not sent, no email service`,
      )
    },
    // Neither carries a secret, so without a mail service the note is logged whole.
    async sendAccessRequest(data) {
      if (options.service) return options.service.sendAccessRequest(data)
      options.log(
        `${data.askerName} asked ${data.to} for edit access to ${data.workspaceName}: ${data.url} (no email service)`,
      )
    },
    async sendRunFailed(data) {
      if (options.service) return options.service.sendRunFailed(data)
      const what = data.call ? `A call to ${data.workflowName}` : data.workflowName
      options.log(`${what} failed; told ${data.to}: ${data.url} (no email service)`)
    },
  }
}
