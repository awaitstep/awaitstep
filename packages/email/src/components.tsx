import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-email'
import { LIGHT } from './theme.js'

const block: CSSProperties = { margin: 0 }

export function Headline({ children }: { children: ReactNode }) {
  return (
    <h1
      className="ae-text"
      style={{
        ...block,
        marginBottom: 14,
        fontSize: 27,
        lineHeight: 1.22,
        fontWeight: 600,
        letterSpacing: '-0.018em',
        color: LIGHT.text,
      }}
    >
      {children}
    </h1>
  )
}

/** Carries markup built by the fragment helpers: the value is a placeholder at build time. */
export function Raw({ html, tag = 'div' }: { html: string; tag?: 'div' | 'p' }) {
  const Tag = tag
  return <Tag dangerouslySetInnerHTML={{ __html: html }} />
}

export function Lead({ children, html }: { children?: ReactNode; html?: string }) {
  const style: CSSProperties = {
    ...block,
    marginBottom: 24,
    fontSize: 15.5,
    lineHeight: 1.68,
    color: LIGHT.muted,
  }
  if (html !== undefined) {
    return <p className="ae-muted" style={style} dangerouslySetInnerHTML={{ __html: html }} />
  }
  return (
    <p className="ae-muted" style={style}>
      {children}
    </p>
  )
}

/** The small uppercase word above a headline. */
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <div
      className="ae-ok"
      style={{
        marginBottom: 12,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: LIGHT.ok,
      }}
    >
      {children}
    </div>
  )
}

/** A dot and a short state: "Failing", "Expires 3 Nov". */
export function Status({
  tone,
  children,
}: {
  tone: 'danger' | 'ok' | 'faint'
  children: ReactNode
}) {
  const color = tone === 'danger' ? LIGHT.danger : tone === 'ok' ? LIGHT.ok : LIGHT.faint
  return (
    <div
      className={`ae-${tone}`}
      style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: 999,
          backgroundColor: 'currentColor',
          marginRight: 7,
        }}
      />
      {children}
    </div>
  )
}

export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-block',
        padding: '13px 24px',
        borderRadius: 8,
        backgroundColor: LIGHT.brand,
        color: LIGHT.onBrand,
        fontSize: 15,
        fontWeight: 600,
        lineHeight: '18px',
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  )
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      className="ae-link"
      href={href}
      style={{ color: LIGHT.link, fontWeight: 500, textDecoration: 'underline' }}
    >
      {children}
    </Link>
  )
}

/** The primary button with an optional quieter link beside it; `secondaryHtml` is markup built by the renderer, empty when absent. */
export function Actions({
  primary,
  secondary,
  secondaryHtml,
}: {
  primary: ReactNode
  secondary?: ReactNode
  secondaryHtml?: string
}) {
  return (
    <div style={{ margin: 0 }}>
      {primary}
      {secondary !== undefined && <span style={{ marginLeft: 18, fontSize: 15 }}>{secondary}</span>}
      {secondaryHtml !== undefined && (
        <span
          style={{ marginLeft: 18, fontSize: 15 }}
          dangerouslySetInnerHTML={{ __html: secondaryHtml }}
        />
      )}
    </div>
  )
}

/** The quiet paragraph under the actions. */
export function Note({ children, html }: { children?: ReactNode; html?: string }) {
  const style: CSSProperties = {
    margin: '26px 0 0',
    fontSize: 13,
    lineHeight: 1.62,
    color: LIGHT.faint,
  }
  if (html !== undefined) {
    return <p className="ae-faint" style={style} dangerouslySetInnerHTML={{ __html: html }} />
  }
  return (
    <p className="ae-faint" style={style}>
      {children}
    </p>
  )
}
