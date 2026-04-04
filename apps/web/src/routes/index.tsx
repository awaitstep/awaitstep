import { createFileRoute, Link } from '@tanstack/react-router'
import { GitHubIcon } from '../components/icons/provider-icons'
import Logo from '../components/icons/logo'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'AwaitStep — Open Source Visual Workflow Builder' }] }),
  component: HomePage,
})

function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      {/* Google Font for handwriting */}
      <link
        href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap"
        rel="stylesheet"
      />

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Radial glow behind hero */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: '800px',
          height: '600px',
          background: 'radial-gradient(ellipse, oklch(0.7 0.15 160 / 6%) 0%, transparent 70%)',
        }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-1">
          <Logo className="w-10" />
          <span className="uppercase text-xs text-foreground font-bold tracking-tight">
            AwaitStep
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://docs.awaitstep.dev"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Docs
          </a>
          <a
            href="https://github.com/awaitstep/awaitstep"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3.5 py-1.5 text-[11px] uppercase tracking-widest text-muted-foreground backdrop-blur-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Open Source Workflow Builder
        </div>

        <h1 className="mt-8 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Build and deploy
          <br />
          workflows{' '}
          <span className="relative inline-block">
            <span
              className="text-primary"
              style={{ fontFamily: "'Caveat', cursive", fontSize: '1.3em', lineHeight: 1 }}
            >
              visually
            </span>
            {/* Hand-drawn underline */}
            <svg
              className="absolute -bottom-1 left-0 w-full text-primary/50"
              viewBox="0 0 200 12"
              fill="none"
              preserveAspectRatio="none"
              style={{ height: '10px' }}
            >
              <path
                d="M2 8c30-6 60-2 90-4s70 2 106 0"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{
                  strokeDasharray: 200,
                  strokeDashoffset: 200,
                  animation: 'draw 0.8s ease-out 0.5s forwards',
                }}
              />
            </svg>
          </span>
          <span className="text-primary" style={{ fontFamily: "'Caveat', cursive" }}>
            .
          </span>
        </h1>

        <style>{`
          @keyframes draw {
            to { stroke-dashoffset: 0; }
          }
        `}</style>

        <p className="mt-6 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
          A self-hosted visual builder that generates and deploys code directly to Cloudflare
          Workflows. No proprietary engines, just your code.
        </p>

        <div className="mt-10 flex items-center gap-3">
          <Link
            to="/sign-in"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/awaitstep/awaitstep"
            className="flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-card"
          >
            <GitHubIcon className="h-4 w-4" />
            View Source
          </a>
        </div>

        {/* Feature grid */}
        <div className="mt-16 flex w-full max-w-2xl flex-col items-center gap-2">
          <div className="grid w-full grid-cols-4 gap-2">
            {['Drag & Drop Canvas', 'One-Click Deploy', '30+ Node Types', 'Custom Marketplace'].map(
              (label) => (
                <div
                  key={label}
                  className="flex items-center justify-center rounded-lg border border-border/40 bg-card/30 px-4 py-4 text-xs text-muted-foreground/70"
                >
                  {label}
                </div>
              ),
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {['API Playground', 'Self-Hosted'].map((label) => (
              <div
                key={label}
                className="flex items-center justify-center rounded-lg border border-border/40 bg-card/30 px-8 py-4 text-xs text-muted-foreground/70"
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 px-6 py-5 text-center text-[11px] text-muted-foreground/50 sm:px-10">
        Open source under Apache 2.0
      </footer>
    </div>
  )
}
