import { describe, expect, it } from 'vitest'
import { renderAccessRequestEmail, renderRunFailedEmail, subjectText } from '../index.js'

describe('renderAccessRequestEmail', () => {
  it('names the asker and the place, and links to the Inbox', async () => {
    const { html, text } = await renderAccessRequestEmail({
      url: 'https://app.test/acme/inbox',
      askerName: 'Priya Shah',
      workspaceName: 'Sales',
      projectName: 'Project 101',
    })
    expect(text).toContain('Priya Shah is asking to join Sales')
    expect(text).toContain('Workspace Sales in Project 101')
    expect(html).toContain('href="https://app.test/acme/inbox"')
    expect(html).not.toMatch(/__[A-Z_]+__/)
  })

  it('escapes names people chose', async () => {
    const { html } = await renderAccessRequestEmail({
      url: 'https://app.test/acme/inbox',
      askerName: '<script>x</script>',
      workspaceName: 'Sales',
      projectName: 'Project 101',
    })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('renderRunFailedEmail', () => {
  it('says where the run failed, or that no step is known', async () => {
    const at = await renderRunFailedEmail({
      url: 'https://app.test/acme/project-101/sales/runs',
      workflowName: 'Lead enrichment',
      stepName: 'Fetch company',
      placeName: 'Project 101 · Sales',
    })
    expect(at.text).toContain(
      'A run of Lead enrichment in Project 101 · Sales failed at step “Fetch company”',
    )
    const unknown = await renderRunFailedEmail({
      url: 'https://app.test/x',
      workflowName: 'Sync',
      stepName: null,
      placeName: 'P · W',
    })
    expect(unknown.text).toContain('failed before finishing')
    expect(unknown.html).not.toMatch(/__[A-Z_]+__/)
  })
})

describe('a failed function call', () => {
  it('says a call to the function failed, with what it answered', async () => {
    const mail = await renderRunFailedEmail({
      url: 'https://app.test/x',
      workflowName: 'CRM Sync',
      stepName: null,
      placeName: 'Project 101 · Sales',
      call: true,
      errorMessage: 'Answered 500',
    })
    expect(mail.subject).toBe('A call to CRM Sync failed')
    expect(mail.text).toContain('A call to CRM Sync in Project 101 · Sales failed.')
    expect(mail.text).toContain('Function')
    expect(mail.text).toContain('Answered 500')
    expect(mail.text).not.toContain('A run of')
  })
})

describe('names that look like patterns', () => {
  it('keeps $ sequences and tokens in a name as typed', async () => {
    const { html, text } = await renderRunFailedEmail({
      url: 'https://app.test/x',
      workflowName: "Sync $` $& $' __APP_URL__ job",
      stepName: null,
      placeName: 'P · W',
      appUrl: 'https://app.test',
    })
    expect(text).toContain("A run of Sync $` $& $' __APP_URL__ job in P · W failed")
    expect(html).not.toMatch(/__(RUNS_URL|WORKFLOW_NAME|STEP_LINE|PLACE_NAME|APP_NAME)__/)
  })
})

describe('typed text in mail', () => {
  it('drops line breaks and direction overrides from subjects, and caps them', () => {
    expect(subjectText('Eve\r\nBcc: x@evil.test')).toBe('EveBcc: x@evil.test')
    expect(subjectText('abc\u202Egnp.exe')).toBe('abcgnp.exe')
    expect(subjectText('x'.repeat(300))).toHaveLength(200)
  })

  it('drops them from the body too', async () => {
    const { html } = await renderAccessRequestEmail({
      url: 'https://app.test/acme/inbox',
      askerName: 'Eve\u202E Park',
      workspaceName: 'Sales',
      projectName: 'P',
    })
    expect(html).not.toContain('\u202E')
    expect(html).toContain('Eve Park')
  })
})
