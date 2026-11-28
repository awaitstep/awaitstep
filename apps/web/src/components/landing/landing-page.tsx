import { Link } from '@tanstack/react-router'
import '@awaitstep/theme/landing.css'
import './landing.css'
import Logo from '../icons/logo'
import { Button } from '../ui/button'
import { HeroScene } from './hero-scene'

const DOCS_URL = 'https://docs.awaitstep.dev'
const REPO_URL = 'https://github.com/awaitstep/awaitstep'

/**
 * The page at the app's root (a self-hosted instance or AwaitStep Cloud): what AwaitStep is, the
 * 3D scene behind it, and the way in. Dark only, like the marketing site.
 */
export function LandingPage() {
  return (
    <div className="landing relative flex min-h-dvh flex-col bg-[var(--color-paper)] font-sans text-[var(--color-ink)]">
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between px-6 sm:px-16">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Logo className="w-8" />
            <span>AwaitStep</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-6 text-sm">
            <a href={DOCS_URL} className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">
              Docs
            </a>
            <a
              href={REPO_URL}
              className="hidden text-[var(--color-ink-2)] hover:text-[var(--color-ink)] sm:inline"
            >
              GitHub
            </a>
            <Button asChild size="sm">
              <Link to="/sign-in">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="relative flex flex-1 items-center pt-16">
        <HeroScene className="hero-scene" />
        <div className="relative z-10 mx-auto w-full max-w-[1360px] px-6 py-24 sm:px-16">
          <h1 className="max-w-[20ch] text-[clamp(2.25rem,3.4vw+0.5rem,4rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
            Build &amp; Run
            <br />
            durable <span className="text-[var(--color-accent)]">workflows</span>.
          </h1>
          <p className="mt-6 max-w-[34ch] text-lg leading-relaxed text-[var(--color-ink-2)]">
            Draw them or code them in TypeScript, then deploy and watch every step run.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={DOCS_URL}>Read the docs</a>
            </Button>
          </div>
        </div>
      </main>

      <footer className="relative z-10">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-[var(--color-muted)] sm:px-16">
          <p>
            AwaitStep is open source under{' '}
            <a
              href={`${REPO_URL}/blob/main/LICENSE`}
              className="underline underline-offset-4 hover:text-[var(--color-ink)]"
            >
              AGPL-3.0
            </a>
            .
          </p>
          <nav aria-label="Footer" className="flex gap-6">
            <a href={DOCS_URL} className="hover:text-[var(--color-ink)]">
              Docs
            </a>
            <a href={REPO_URL} className="hover:text-[var(--color-ink)]">
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
