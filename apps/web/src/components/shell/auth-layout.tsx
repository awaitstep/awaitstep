import type { ReactNode } from 'react'
import Logo from '../icons/logo'
import { ShellLink } from '../ui/shell-link'

export interface FooterLink {
  label: string
  href: string
}

interface AuthLayoutProps {
  /** Docs, Status, Privacy. */
  footerLinks: FooterLink[]
  /** One `AuthCard`. */
  children: ReactNode
}

/** The frame for screens before the dashboard: sign-in, invites, choosing an org. */
export function AuthLayout({ footerLinks, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex items-center gap-2.5 px-7 py-5 text-sm font-semibold">
        <Logo className="h-5 w-auto" />
        AwaitStep
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-6">{children}</main>
      <footer className="flex flex-wrap justify-center gap-4.5 p-4.5 text-2xs text-muted-foreground">
        {footerLinks.map((link) => (
          <ShellLink key={link.href} href={link.href} className="hover:text-foreground">
            {link.label}
          </ShellLink>
        ))}
      </footer>
    </div>
  )
}
