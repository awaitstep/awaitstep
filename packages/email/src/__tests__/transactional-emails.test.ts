import { describe, expect, it } from 'vitest'
import { formatClock, formatDay, formatWhen } from '../fragments.js'
import {
  renderAccessRequestEmail,
  renderInvitationEmail,
  renderKeyExpiringEmail,
  renderMagicLinkEmail,
  renderNewSignInEmail,
  renderRunFailedEmail,
  renderWelcomeEmail,
} from '../index.js'

const noTokens = (html: string) => expect(html).not.toMatch(/__[A-Z_]+__/)

describe('T1 sign-in link', () => {
  it('names the address, the link, and what the request came from', async () => {
    const { html, text, subject } = await renderMagicLinkEmail({
      url: 'https://app.test/auth/magic?token=abc',
      to: 'daniel@acme.test',
      device: 'Chrome on macOS',
      near: 'Amsterdam, NL',
      requestedAt: '2026-10-31T18:02:00Z',
      timeZone: 'Europe/Amsterdam',
    })
    expect(subject).toBe('Sign in to AwaitStep')
    expect(text).toContain('sign in as daniel@acme.test')
    expect(text).toContain('Requested from Chrome on macOS')
    expect(text).toContain('Near Amsterdam, NL (approximate)')
    expect(text).toMatch(/When 31 Oct 2026, 19:02 (CET|GMT\+1)/)
    expect(html).toContain('href="https://app.test/auth/magic?token=abc"')
    noTokens(html)
  })

  it('leaves the request rows out when nothing is known and offers no settings link', async () => {
    const { text, html } = await renderMagicLinkEmail({ url: 'https://app.test/x' })
    expect(text).not.toContain('Requested from')
    expect(text).toContain('You can’t turn off security emails.')
    expect(text).toContain('Contact support')
    expect(text).not.toContain('Notification settings')
    noTokens(html)
  })
})

describe('T2 invitation', () => {
  const base = {
    url: 'https://app.test/invite/1',
    orgName: 'Acme Inc',
    inviterName: 'Ama Mensah',
    role: 'editor',
    place: null,
    expiresAt: '2030-11-01T00:00:00Z',
  }

  it('shows the organization, the role and what it allows', async () => {
    const { text, subject, html } = await renderInvitationEmail({
      ...base,
      workspaceName: 'Sales',
      projectName: 'Project 101',
      place: 'Sales in Project 101 (Editor)',
      to: 'daniel@acme.test',
    })
    expect(subject).toBe('Ama Mensah invited you to Acme Inc on AwaitStep')
    expect(text).toContain('Organization Acme Inc')
    expect(text).toContain('Workspace Sales in Project 101')
    expect(text).toContain('Your role Editor · build, run and deploy workflows')
    expect(text).toContain('Invited email daniel@acme.test')
    expect(text).toContain('This invite expires on 1 Nov 2030.')
    expect(text).toContain(
      'Sent to daniel@acme.test because Ama Mensah invited this address to Acme Inc.',
    )
    expect(html).toContain('>AM<')
    noTokens(html)
  })

  it('does not claim the invitee is limited to one workspace for an org-wide role', async () => {
    const { text } = await renderInvitationEmail({ ...base, role: 'admin' })
    expect(text).not.toContain('other projects or workspaces')
    expect(text).toContain('Your role Admin')
  })

  it('escapes the inviter and the organization', async () => {
    const { html } = await renderInvitationEmail({
      ...base,
      inviterName: '<img src=x onerror=1>',
      orgName: '<b>Org</b>',
    })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>Org</b>')
    noTokens(html)
  })
})

describe('T3 access request', () => {
  it('asks a decision with Approve and Decline, the role asked for and the message', async () => {
    const { html, text, subject } = await renderAccessRequestEmail({
      url: 'https://app.test/acme/inbox',
      askerName: 'Daniel Kim',
      askerEmail: 'daniel@acme.test',
      workspaceName: 'IT',
      projectName: 'Project 101',
      requestedRole: 'viewer',
      message: 'Need to check the provisioning runs.',
      approveUrl: 'https://app.test/a',
      declineUrl: 'https://app.test/d',
      editUrl: 'https://app.test/e',
      to: 'admin@acme.test',
    })
    expect(subject).toBe('Daniel Kim asked to join IT')
    expect(text).toContain('Person Daniel Kim · daniel@acme.test')
    expect(text).toContain('Role asked for Viewer · see workflows and runs')
    expect(text).toContain('Message “Need to check the provisioning runs.”')
    expect(text).toContain('Sent to admin@acme.test because you can manage who joins IT.')
    expect(html).toContain('href="https://app.test/a"')
    expect(html).toContain('href="https://app.test/d"')
    expect(html).toContain('href="https://app.test/e"')
    noTokens(html)
  })

  it('words an edit request for a Viewer as asking for edit access', async () => {
    const { text, subject } = await renderAccessRequestEmail({
      url: 'https://app.test/acme/inbox',
      askerName: 'Priya Shah',
      workspaceName: 'Sales',
      projectName: 'Project 101',
      kind: 'edit',
    })
    expect(subject).toBe('Priya Shah asked for edit access to Sales')
    expect(text).toContain('Priya Shah can view this workspace today.')
    expect(text).not.toContain('Edit access instead')
  })
})

describe('T4 workflow failing', () => {
  const base = {
    url: 'https://app.test/runs',
    workflowName: 'Lead enrichment',
    stepName: 'Fetch company',
    placeName: 'Project 101 · Sales',
  }

  it('counts the failures, shows the strip, the error and the way to the workflow', async () => {
    const { html, text, subject } = await renderRunFailedEmail({
      ...base,
      failedRuns: 3,
      recentRuns: 4,
      runHistory: [false, false, false, false, true, true, false, true],
      errorMessage: '502 Bad Gateway',
      lastFailure: '5 minutes ago',
      workflowUrl: 'https://app.test/wf',
    })
    expect(subject).toBe('Lead enrichment failed 3 times in the last hour')
    expect(text).toContain('Lead enrichment is failing')
    expect(text).toContain('3 of the last 4 runs stopped at the same step.')
    expect(text).toContain('Workspace Sales in Project 101')
    expect(text).toContain('Error 502 Bad Gateway')
    expect(html).toContain(
      'aria-label="The last 8 runs, oldest first: passed, passed, passed, passed, failed, failed, passed, failed"',
    )
    expect(html).toContain('href="https://app.test/wf"')
    noTokens(html)
  })

  it('sends the recovery as its own state', async () => {
    const { html, text, subject } = await renderRunFailedEmail({ ...base, state: 'recovered' })
    expect(subject).toBe('Lead enrichment recovered')
    expect(text).toContain('are passing again')
    expect(text).not.toContain('Error')
    expect(html).toContain('ae-ok')
    noTokens(html)
  })
})

describe('T5 API key expiring', () => {
  const base = {
    url: 'https://app.test/keys/new',
    keyName: 'Read-only dashboard',
    daysLeft: 3,
    expiresAt: '2030-11-03T00:00:00Z',
  }

  it('says when it stops working and how to replace it', async () => {
    const { html, text, subject } = await renderKeyExpiringEmail({
      ...base,
      keyPrefix: 'as_live_8f3k…',
      reaches: 'Project 101 · read only',
      lastUsed: '2 hours ago',
      reviewUrl: 'https://app.test/keys/1',
      levelName: 'Project 101',
      to: 'daniel@acme.test',
    })
    expect(subject).toBe('API key “Read-only dashboard” expires in 3 days')
    expect(text).toContain('Your API key expires in 3 days')
    expect(text).toContain('rejected from 3 Nov 2030 at 00:00 UTC')
    expect(text).toContain('Reaches Project 101 · read only')
    expect(text).toContain('Sent to daniel@acme.test because you manage API keys in Project 101.')
    expect(html).toContain('href="https://app.test/keys/1"')
    noTokens(html)
  })

  it('speaks of one day in the singular and a key never used as such', async () => {
    const { text, subject } = await renderKeyExpiringEmail({ ...base, daysLeft: 1 })
    expect(subject).toContain('expires in 1 day')
    expect(text).toContain('Last used Never')
  })
})

describe('T6 new sign-in', () => {
  it('tells the device, the place and the time, and offers the sessions page', async () => {
    const { html, text, subject } = await renderNewSignInEmail({
      url: 'https://app.test/account/sessions',
      device: 'Chrome on Windows 11',
      near: 'Rotterdam, NL',
      signedInAt: '2026-10-31T17:47:00Z',
      method: 'GitHub',
      to: 'daniel@acme.test',
    })
    expect(subject).toBe('New sign-in to AwaitStep from Chrome on Windows 11')
    expect(text).toContain('Device Chrome on Windows 11')
    expect(text).toContain('Signed in with GitHub')
    expect(text).toContain('31 Oct 2026, 17:47 UTC')
    expect(text).toContain('Sent to daniel@acme.test to keep your account safe.')
    expect(text).not.toContain('Notification settings')
    expect(html).toContain('href="https://app.test/account/sessions"')
    noTokens(html)
  })

  it('escapes a device string a client chose', async () => {
    const { html } = await renderNewSignInEmail({
      url: 'https://app.test/s',
      device: '<script>x</script>',
      signedInAt: '2026-10-31T17:47:00Z',
    })
    expect(html).not.toContain('<script>x</script>')
  })
})

describe('T7 welcome', () => {
  it('greets by name and lays out the three steps', async () => {
    const { html, text, subject } = await renderWelcomeEmail({
      name: 'Daniel',
      orgName: 'Acme Inc',
      connectUrl: 'https://app.test/connect',
      templatesUrl: 'https://app.test/templates',
      openUrl: 'https://app.test/dashboard',
      to: 'daniel@acme.test',
    })
    expect(subject).toBe('Welcome to AwaitStep, Daniel')
    expect(text).toContain('Welcome, Daniel')
    expect(text).toContain('You’re in Acme Inc.')
    expect(text).toContain('Connect Cloudflare')
    expect(text).toContain('Deploy and watch it run')
    expect(text).toContain('Notification settings')
    expect(html).toContain('href="https://app.test/connect"')
    expect(html).toContain('href="https://app.test/dashboard"')
    noTokens(html)
  })

  it('keeps a name that looks like a token as typed', async () => {
    const { html, text } = await renderWelcomeEmail({
      name: '__APP_URL__',
      connectUrl: 'https://app.test/c',
      templatesUrl: 'https://app.test/t',
      openUrl: 'https://app.test/o',
    })
    expect(text).toContain('Welcome, __APP_URL__')
    expect(html).not.toMatch(/__(NAME|LEAD_HTML|FOOTER_NOTE)__/)
  })
})

describe('plain text', () => {
  it('leaves out the hidden preview text and decodes apostrophes', async () => {
    const { text } = await renderNewSignInEmail({
      url: 'https://app.test/s',
      device: 'Chrome',
      near: 'Rotterdam, NL',
      signedInAt: '2026-10-31T17:47:00Z',
    })
    expect(text.startsWith('Security')).toBe(true)
    expect(text).not.toMatch(/[\u200b-\u200d\ufeff]/)
    expect(text).toContain("a device we haven't seen before")
    expect(text).not.toContain('&#')
  })
})

describe('dark mode', () => {
  it('ships a dark palette keyed to prefers-color-scheme with light as the base', async () => {
    const { html } = await renderMagicLinkEmail({ url: 'https://app.test/x' })
    expect(html).toContain('prefers-color-scheme: dark')
    expect(html).toContain('color-scheme')
  })
})

describe('review fixes', () => {
  const failing = {
    url: 'https://app.test/runs',
    workflowName: 'Lead enrichment',
    stepName: 'Fetch company',
    placeName: 'Project 101 · Sales',
  }

  it('T4 recovered shows no failure details, in the body or the preview', async () => {
    const { text, html } = await renderRunFailedEmail({
      ...failing,
      state: 'recovered',
      errorMessage: '502 Bad Gateway',
      lastFailure: '5 minutes ago',
    })
    expect(text).not.toContain('Failing step')
    expect(text).not.toContain('502 Bad Gateway')
    expect(html).not.toContain('Fetch company')
  })

  it('T4 words one run, all runs failed, and no known step', async () => {
    const one = await renderRunFailedEmail({ ...failing, failedRuns: 1, recentRuns: 1 })
    expect(one.text).toContain('The last run stopped at the same step.')
    const all = await renderRunFailedEmail({ ...failing, failedRuns: 4, recentRuns: 4 })
    expect(all.text).toContain('The last 4 runs stopped at the same step.')
    const unknown = await renderRunFailedEmail({
      ...failing,
      stepName: null,
      failedRuns: 3,
      recentRuns: 4,
    })
    expect(unknown.text).toContain('3 of the last 4 runs stopped before finishing.')
  })

  it('T4 keeps a project name that contains the separator when names are given apart', async () => {
    const { text } = await renderRunFailedEmail({
      ...failing,
      placeName: 'Acme · EU · Sales',
      projectName: 'Acme · EU',
      workspaceName: 'Sales',
    })
    expect(text).toContain('Workspace Sales in Acme · EU')
    expect(text).toContain('you get failure alerts for Sales.')
  })

  it('T2 as the API sends it does not contradict the place with the org role', async () => {
    const { text, html } = await renderInvitationEmail({
      url: 'https://app.test/invite/1',
      orgName: 'Acme Inc',
      inviterName: 'Ama Mensah',
      role: 'member',
      place: 'Sales in Project 101 (Editor)',
      expiresAt: '2030-11-01T00:00:00Z',
    })
    expect(text).toContain('Where Sales in Project 101 (Editor)')
    expect(text).not.toContain('Your role')
    expect(text).toContain('Ama Mensah invited you to join')
    expect(text).not.toMatch(/^AM\b/m)
    expect(html).toContain('You’ll join Sales in Project 101 (Editor).')
  })

  it('T3 as the API sends it promises no buttons it lacks and leaves no empty note', async () => {
    const { html, text } = await renderAccessRequestEmail({
      url: 'https://app.test/acme/inbox',
      askerName: 'Priya Shah',
      workspaceName: 'Sales',
      projectName: '',
      kind: 'edit',
    })
    expect(html).toContain('Edit access to Sales. Open your Inbox to approve or decline.')
    expect(html).not.toMatch(/<p\b[^>]*><\/p>/)
    expect(text).toContain('Workspace Sales')
    expect(text).not.toContain('in \n')
  })

  it('writes September the same way in every date', () => {
    expect(formatWhen('2026-09-30T12:00:00Z')).toBe('30 Sep 2026, 12:00 UTC')
    expect(formatDay('2026-09-30T12:00:00Z', new Date('2026-01-01T00:00:00Z'))).toBe('30 Sep')
  })

  it('formats days, times and clocks, and drops what is not a date', () => {
    const now = new Date('2026-06-01T00:00:00Z')
    expect(formatDay('2027-01-02T00:00:00Z', now)).toBe('2 Jan 2027')
    expect(formatDay('not a date')).toBeNull()
    expect(formatWhen('not a date')).toBeNull()
    expect(formatWhen('2026-10-31T17:47:00Z', 'Not/AZone')).toBe('31 Oct 2026, 17:47 UTC')
    expect(formatClock('2026-11-03T00:00:00Z')).toBe('00:00 UTC')
  })

  it('keeps a line break in an error message as a space', async () => {
    const { text } = await renderRunFailedEmail({
      ...failing,
      errorMessage: '502 Bad Gateway\nupstream timed out',
    })
    expect(text).toContain('Error 502 Bad Gateway upstream timed out')
  })

  it('escapes the error, message, key and organization names', async () => {
    const x = '<i>x</i>'
    const run = await renderRunFailedEmail({ ...failing, errorMessage: x, lastFailure: x })
    const req = await renderAccessRequestEmail({
      url: 'https://app.test/i',
      askerName: 'A',
      workspaceName: 'W',
      projectName: 'P',
      message: x,
    })
    const key = await renderKeyExpiringEmail({
      url: 'https://app.test/k',
      keyName: x,
      daysLeft: 3,
      expiresAt: '2030-11-03T00:00:00Z',
    })
    const welcome = await renderWelcomeEmail({
      name: 'D',
      orgName: x,
      connectUrl: 'https://app.test/c',
      templatesUrl: 'https://app.test/t',
      openUrl: 'https://app.test/o',
    })
    for (const { html } of [run, req, key, welcome]) {
      expect(html).not.toContain('<i>x</i>')
      expect(html).toContain('&lt;i&gt;x&lt;/i&gt;')
    }
  })

  it('does not decode an entity twice in the text version', async () => {
    const { text } = await renderRunFailedEmail({ ...failing, workflowName: 'a &lt;b&gt;' })
    expect(text).toContain('a &lt;b&gt; is failing')
  })

  it('prints the link behind each button in the text version', async () => {
    const { text } = await renderInvitationEmail({
      url: 'https://app.test/invite/1?x=1&y=2',
      orgName: 'Acme',
      inviterName: 'Ama',
      role: 'member',
      place: null,
      expiresAt: '2030-11-01T00:00:00Z',
    })
    expect(text).toContain('Accept invite (https://app.test/invite/1?x=1&y=2)')
  })

  it('falls back to the public site for the logo and settings link without a web origin', async () => {
    const { html } = await renderKeyExpiringEmail({
      url: 'https://app.test/k',
      keyName: 'k',
      daysLeft: 7,
      expiresAt: '2030-11-03T00:00:00Z',
    })
    expect(html).toContain('href="https://awaitstep.dev/settings/notifications"')
    expect(html).toContain('src="https://awaitstep.dev/logo.png"')
    expect(html).toContain(`© <!-- -->${new Date().getFullYear()}`)
  })

  it('T5 and T7 edge copy: never "0 days", no dangling comma, no article before the app name', async () => {
    const key = await renderKeyExpiringEmail({
      url: 'https://app.test/k',
      keyName: 'k',
      daysLeft: 0,
      expiresAt: '2030-11-03T00:00:00Z',
    })
    expect(key.subject).toBe('API key “k” expires in 1 day')
    const w = await renderWelcomeEmail({
      name: ' ',
      appName: 'Orbit',
      to: 'a@b.test',
      connectUrl: 'https://app.test/c',
      templatesUrl: 'https://app.test/t',
      openUrl: 'https://app.test/o',
    })
    expect(w.subject).toBe('Welcome to Orbit')
    expect(w.text).toMatch(/^Welcome\n/)
    expect(w.text).toContain('because you created your Orbit account.')
  })

  it('cuts device, place and method text to a short line so a client cannot write a message in a security mail', async () => {
    const long =
      'Your account is locked. Verify now at https://evil.test/unlock and call us today please'
    const t1 = await renderMagicLinkEmail({ url: 'https://app.test/x', device: long, near: long })
    const t6 = await renderNewSignInEmail({
      url: 'https://app.test/s',
      device: long,
      method: long,
      signedInAt: '2026-10-31T17:47:00Z',
    })
    for (const out of [t1.text, t6.text]) expect(out).not.toContain('evil.test/unlock and call')
    expect(t6.subject).not.toContain('call us today')
  })

  it('lets only http(s) addresses become links', async () => {
    const { html } = await renderRunFailedEmail({
      url: 'https://app.test/runs',
      workflowName: 'W',
      stepName: null,
      placeName: 'P',
      workflowUrl: 'javascript:alert(1)',
    })
    expect(html).not.toContain('javascript:')
    const req = await renderAccessRequestEmail({
      url: 'https://app.test/i',
      askerName: 'A',
      workspaceName: 'W',
      projectName: 'P',
      approveUrl: ' JaVaScRiPt:alert(1)',
      declineUrl: 'data:text/html,x',
      editUrl: 'javascript:1',
    })
    expect(req.html).not.toMatch(/javascript:|data:text/i)
  })

  it('drops invisible and direction characters from typed text', async () => {
    const { html, subject } = await renderWelcomeEmail({
      name: 'Pay\u200bpal\u061c\u2028x\ufeff',
      connectUrl: 'https://app.test/c',
      templatesUrl: 'https://app.test/t',
      openUrl: 'https://app.test/o',
    })
    expect(subject).toBe('Welcome to AwaitStep, Paypalx')
    expect(html).toContain('Welcome, Paypalx')
  })

  it('writes a web origin with a trailing slash without a double slash', async () => {
    const { html } = await renderMagicLinkEmail({
      url: 'https://app.test/x',
      appUrl: 'https://app.test/',
    })
    expect(html).toContain('src="https://app.test/logo.png"')
  })

  it('loads no remote font stylesheet', async () => {
    const { html } = await renderMagicLinkEmail({ url: 'https://app.test/x' })
    expect(html).not.toContain('fonts.googleapis.com')
  })
})
