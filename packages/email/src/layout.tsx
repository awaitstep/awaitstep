import type { CSSProperties, ReactNode } from 'react'
import { Body, Column, Container, Head, Html, Img, Link, Preview, Row, Section } from 'react-email'
import { DARK_CSS, FONT, FOOTER_LINKS, LIGHT } from './theme.js'

interface LayoutProps {
  preview?: string
  appUrl?: string
  /** The small word at the right of the header: "Security", "Alert", "Invite". */
  label?: string
  footer: ReactNode
  children: ReactNode
}

export default function Layout({ children, preview, appUrl, label, footer }: LayoutProps) {
  const logoUrl = appUrl ? `${appUrl}/logo.png` : 'https://awaitstep.dev/logo.png'
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{DARK_CSS}</style>
      </Head>
      {preview && <Preview>{preview}</Preview>}
      <Body
        className="ae-page"
        style={{
          margin: 0,
          backgroundColor: LIGHT.page,
          color: LIGHT.text,
          fontFamily: FONT,
        }}
      >
        <Container
          style={{ width: '100%', maxWidth: 600, margin: '0 auto', padding: '30px 24px 48px' }}
        >
          <Row style={{ marginBottom: 34 }}>
            <Column>
              <Img src={logoUrl} width="60" height="28" alt="AwaitStep" />
            </Column>
            {label && (
              <Column
                align="right"
                className="ae-faint"
                style={{ fontSize: 12.5, color: LIGHT.faint }}
              >
                {label}
              </Column>
            )}
          </Row>
          {children}
          <Section
            className="ae-line"
            style={{ marginTop: 44, paddingTop: 20, borderTop: `1px solid ${LIGHT.line}` }}
          >
            {footer}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const footerText: CSSProperties = {
  margin: '0 0 7px',
  fontSize: 12.5,
  lineHeight: 1.7,
  color: LIGHT.faint,
}

const footerLink: CSSProperties = {
  color: LIGHT.faint,
  textDecoration: 'underline',
}

const SEP = (
  <span className="ae-sep" aria-hidden="true" style={{ margin: '0 7px', color: LIGHT.line2 }}>
    ·
  </span>
)

interface FooterProps {
  /** The whole first line: "Sent to a@b.test because …". */
  note: string
  /** Security mail can't be turned off, so it offers support instead of notification settings. */
  variant: 'security' | 'settings'
  appUrl?: string
}

export function Footer({ note, variant, appUrl }: FooterProps) {
  const links =
    variant === 'security'
      ? [
          ['Docs', FOOTER_LINKS.docs],
          ['Status', FOOTER_LINKS.status],
          ['Contact support', FOOTER_LINKS.support],
        ]
      : [
          ['Notification settings', `${appUrl ?? ''}${FOOTER_LINKS.notificationsPath}`],
          ['Docs', FOOTER_LINKS.docs],
          ['Status', FOOTER_LINKS.status],
        ]
  return (
    <>
      <p className="ae-faint" style={footerText}>
        {note}
      </p>
      <p className="ae-faint" style={footerText}>
        {links.map(([text, href], i) => (
          <span key={text}>
            {i > 0 && SEP}
            <Link className="ae-faint" href={href} style={footerLink}>
              {text}
            </Link>
          </span>
        ))}
      </p>
      <p className="ae-faint" style={{ ...footerText, margin: 0 }}>
        &copy; {'__YEAR__'}{' '}
        <Link
          className="ae-faint"
          href="https://awaitstep.dev"
          style={{ ...footerLink, textDecoration: 'none' }}
        >
          AwaitStep
        </Link>
      </p>
    </>
  )
}
