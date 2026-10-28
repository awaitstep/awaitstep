import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type * as Utils from '../../../lib/utils'
import { SignInPage } from '../sign-in-page'

const auth = vi.hoisted(() => ({
  magicLink: vi.fn(() => Promise.resolve({ error: null })),
  social: vi.fn(() => Promise.resolve({ error: null })),
}))

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
    expect(
      screen.getByText('No password needed. New here? Signing in creates your account.'),
    ).toBeVisible()
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
          errorCallbackURL: 'https://app.test/sign-in?error=true',
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
      errorCallbackURL: 'https://app.test/sign-in?error=true',
    })
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeVisible()
    expect(screen.getByText('We sent a sign-in link to daniel@acme.test.')).toBeVisible()
    expect(screen.getByText(/works once and expires in 5 minutes/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByRole('heading', { name: 'Sign in to AwaitStep' })).toBeVisible()
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
})
