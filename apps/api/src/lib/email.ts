import { Resend } from 'resend'
import {
  renderInvitationEmail,
  renderInviteRequestEmail,
  renderMagicLinkEmail,
} from '@awaitstep/email'
import type { AppEmails, InvitationEmail, InviteRequestEmail } from '../types.js'

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
      const { html, text } = await renderMagicLinkEmail({ url: data.url, appName, appUrl })
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
        subject: `${data.inviterName} invited you to ${data.orgName}`,
        html,
        text,
      })
    },

    async sendInviteRequest(data: InviteRequestEmail) {
      const { html, text } = await renderInviteRequestEmail({ ...data, appName, appUrl })
      await resend.emails.send({
        from,
        to: data.to,
        subject: `${data.askerEmail} asked for a new invite to ${data.orgName}`,
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
  }
}
