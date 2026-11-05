import { describe, expect, it } from 'vitest'
import { workflowLinks } from '../workflows/detail-links'

const SALES = { org: 'acme', project: 'project-101', workspace: 'sales' }

describe('workflowLinks', () => {
  it('keeps every link in the workspace the workflow was opened in', () => {
    const links = workflowLinks(SALES, 'wf_1')
    const base = '/acme/project-101/sales/workflows/wf_1'
    expect(links.overview).toBe(`${base}/overview`)
    expect(links.runs).toBe(`${base}/runs`)
    expect(links.run('run_9')).toBe(`${base}/runs/run_9`)
    expect(links.deployments).toBe(`${base}/deployments`)
    expect(links.deploy).toBe(`${base}/deploy`)
    expect(links.deployVersion('v 9')).toBe(`${base}/deploy?version=v+9`)
    expect(links.editor('ide')).toBe(`${base}?view=ide`)
    expect(links.editor('canvas', { version: 'v 1' })).toBe(`${base}?view=canvas&version=v+1`)
  })

  it('encodes ids', () => {
    expect(workflowLinks(SALES, 'wf/1').run('a b')).toBe(
      '/acme/project-101/sales/workflows/wf%2F1/runs/a%20b',
    )
  })
})
