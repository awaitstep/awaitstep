import { Resend } from 'resend'
import { renderMagicLinkEmail } from '@awaitstep/email'

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
  }
}
