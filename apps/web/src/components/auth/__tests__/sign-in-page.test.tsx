import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type * as Utils from '../../../lib/utils'
import { SignInPage } from '../sign-in-page'

const auth = vi.hoisted(() => ({
  magicLink: vi.fn(() => Promise.resolve({ error: null })),
  social: vi.fn(() => Promise.resolve({ error: null })),
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

vi.mock('../../../lib/auth-client', () => ({
  authClient: { signIn: { magicLink: auth.magicLink, social: auth.social } },
}))
vi.mock('../../../lib/utils', async (original) => ({
  ...(await original<typeof Utils>()),
  getOrigin: () => 'https://app.test',
}))

const ALL = { github: true, google: true, magicLink: true }

afterEach(() => {
  auth.magicLink.mockClear()
  auth.social.mockClear()
  toast.success.mockClear()
  toast.error.mockClear()
})

describe('SignInPage', () => {
  it('reads as SignIn: providers, or, the work email and the note', () => {
    render(<SignInPage redirectPath={null} authMethods={ALL} />)
    expect(screen.getByRole('heading', { name: 'Sign in to AwaitStep' })).toBeVisible()
    expect(screen.getByText('Build durable workflows with your team.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    expect(screen.getByText('or')).toBeVisible()
    expect(screen.getByRole('textbox', { name: /Work email/ })).toBeVisible()
    expect(screen.getByText('New here? Signing in creates your account.')).toBeVisible()
  })

  it('signs in with GitHub and Google as before, back to the saved page', async () => {
    render(<SignInPage redirectPath="/acme/projects" authMethods={ALL} />)
    await userEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(auth.social.mock.calls).toEqual([
      [
        {
          provider: 'github',
          callbackURL: 'https://app.test/acme/projects',
          errorCallbackURL: 'https://app.test/sign-in?redirect=%2Facme%2Fprojects',
        },
      ],
      [expect.objectContaining({ provider: 'google' })],
    ])
  })

  it('emails a link, lands on the old dashboard by default, and can start over', async () => {
    render(<SignInPage redirectPath={null} authMethods={ALL} />)
    await userEvent.type(screen.getByRole('textbox', { name: /Work email/ }), 'daniel@acme.test')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    expect(auth.magicLink).toHaveBeenCalledWith({
      email: 'daniel@acme.test',
      callbackURL: 'https://app.test/dashboard',
      errorCallbackURL: 'https://app.test/sign-in',
      fetchOptions: expect.any(Object),
    })
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeVisible()
    expect(screen.getByText('We sent a sign-in link to daniel@acme.test.')).toBeVisible()
    expect(screen.getByText(/works once and expires in 5 minutes/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByRole('heading', { name: 'Sign in to AwaitStep' })).toBeVisible()
  })

  it('says the sign-in is to accept an invitation when it came from an invite', async () => {
    render(<SignInPage redirectPath="/invite/inv_sam" authMethods={ALL} />)
    expect(screen.getByRole('heading', { name: 'Sign in to accept your invitation' })).toBeVisible()
    expect(screen.getByText(/Use the email address the invite was sent to/)).toBeVisible()
    expect(screen.getByText('New here? Signing in creates your account.')).toBeVisible()
    await userEvent.type(screen.getByRole('textbox', { name: /Work email/ }), 'daniel@acme.test')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    expect(auth.magicLink).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: 'https://app.test/invite/inv_sam' }),
    )
    expect(
      await screen.findByText(
        /We sent a sign-in link to daniel@acme.test. Open it to accept your invitation./,
      ),
    ).toBeVisible()
  })

  it('keeps the plain sign-in wording for any other return page', () => {
    render(<SignInPage redirectPath="/acme/projects" authMethods={ALL} />)
    expect(screen.getByRole('heading', { name: 'Sign in to AwaitStep' })).toBeVisible()
    expect(screen.queryByText(/invitation/)).not.toBeInTheDocument()
  })

  it('shows only the methods this instance turns on', () => {
    render(
      <SignInPage
        redirectPath={null}
        authMethods={{ github: false, google: false, magicLink: true }}
      />,
    )
    expect(screen.queryByRole('button', { name: /Continue with/ })).not.toBeInTheDocument()
    expect(screen.queryByText('or')).not.toBeInTheDocument()
  })

  it('says so when no method is turned on', () => {
    render(
      <SignInPage
        redirectPath={null}
        authMethods={{ github: false, google: false, magicLink: false }}
      />,
    )
    expect(screen.getByText(/No sign-in methods are turned on/)).toBeVisible()
  })

  it('says a refused sign-in’s reason under the form and in the toast', async () => {
    auth.magicLink.mockResolvedValueOnce({ error: { message: 'Too many requests' } } as never)
    render(<SignInPage redirectPath={null} authMethods={ALL} />)
    await userEvent.type(screen.getByRole('textbox', { name: /Work email/ }), 'daniel@acme.test')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')
    expect(toast.error).toHaveBeenCalledWith(
      'Too many requests',
      expect.objectContaining({ duration: 6000 }),
    )
    expect(screen.getByRole('heading', { name: 'Sign in to AwaitStep' })).toBeVisible()
  })

  it('answers a network failure instead of leaving an unhandled rejection', async () => {
    auth.social.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<SignInPage redirectPath={null} authMethods={ALL} />)
    await userEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in failed. Please try again.')
    expect(toast.error).toHaveBeenCalledWith(
      'Couldn’t sign you in',
      expect.objectContaining({ duration: 6000 }),
    )
  })

  it('toasts that the link was sent', async () => {
    render(<SignInPage redirectPath={null} authMethods={ALL} />)
    await userEvent.type(screen.getByRole('textbox', { name: /Work email/ }), 'daniel@acme.test')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    await screen.findByRole('heading', { name: 'Check your email' })
    expect(toast.success).toHaveBeenCalledWith('Sign-in link sent', expect.any(Object))
  })

  it('says a provider that sent you back before approving did not finish', () => {
    render(<SignInPage redirectPath={null} authMethods={ALL} errorCode="access_denied" />)
    expect(screen.getByRole('alert')).toHaveTextContent('That sign-in didn’t finish')
    expect(screen.getByRole('alert')).toHaveTextContent('no account was created or changed')
    expect(screen.getByRole('alert')).toHaveTextContent('or use your email below')
  })

  it('does not point at an email form that is turned off', () => {
    render(
      <SignInPage
        redirectPath={null}
        authMethods={{ github: true, google: false, magicLink: false }}
        errorCode="access_denied"
      />,
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('use your email')
  })

  it('says an expired or used link has expired and offers a new one', () => {
    for (const code of ['EXPIRED_TOKEN', 'INVALID_TOKEN']) {
      const { unmount } = render(
        <SignInPage redirectPath={null} authMethods={ALL} errorCode={code} />,
      )
      expect(screen.getByRole('alert')).toHaveTextContent('That sign-in link has expired')
      expect(screen.getByRole('alert')).toHaveTextContent('Links last 5 minutes and work only once')
      expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeVisible()
      unmount()
    }
  })

  it('shows no alert when nothing failed', () => {
    render(<SignInPage redirectPath={null} authMethods={ALL} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the invite wording and the way back after a failed link', async () => {
    render(
      <SignInPage redirectPath="/invite/inv_sam" authMethods={ALL} errorCode="EXPIRED_TOKEN" />,
    )
    expect(screen.getByRole('heading', { name: 'Sign in to accept your invitation' })).toBeVisible()
    await userEvent.type(screen.getByRole('textbox', { name: /Work email/ }), 'daniel@acme.test')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    expect(auth.magicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackURL: 'https://app.test/invite/inv_sam',
        errorCallbackURL: 'https://app.test/sign-in?redirect=%2Finvite%2Finv_sam',
      }),
    )
  })

  it('marks an address that is not an email, under the field, and sends nothing', async () => {
    render(<SignInPage redirectPath={null} authMethods={ALL} />)
    const field = screen.getByRole('textbox', { name: /Work email/ })
    await userEvent.type(field, 'daniel@acme')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    expect(screen.getByText('Enter a valid email address, like you@company.com.')).toBeVisible()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(auth.magicLink).not.toHaveBeenCalled()
    await userEvent.type(field, '.test')
    expect(field).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('locks the button with a countdown when too many links were asked for', async () => {
    auth.magicLink.mockResolvedValueOnce({
      error: { status: 429, message: 'Too many requests. Please try again later.' },
    } as never)
    render(<SignInPage redirectPath={null} authMethods={ALL} />)
    await userEvent.type(screen.getByRole('textbox', { name: /Work email/ }), 'daniel@acme.test')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many sign-in links')
    expect(screen.getByRole('button', { name: 'Try again in 1:00' })).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'Sign in to AwaitStep' })).toBeVisible()
  })
})
