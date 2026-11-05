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
    expect(links.editor('ide')).toBe(`${base}?view=ide`)
    expect(links.editor('canvas', { version: 'v 1' })).toBe(`${base}?view=canvas&version=v+1`)
  })

  it('stays on the old pages when there is no workspace', () => {
    const links = workflowLinks(null, 'wf_1')
    expect(links.overview).toBe('/workflows/wf_1')
    expect(links.runs).toBe('/workflows/wf_1/runs')
    expect(links.run('run_9')).toBe('/runs/run_9?workflowId=wf_1')
    expect(links.deployments).toBe('/workflows/wf_1/deployments')
    expect(links.deploy).toBe('/workflows/wf_1/deploy')
    expect(links.editor('canvas')).toBe('/workflows/wf_1/editor?view=canvas')
  })

  it('encodes ids on both', () => {
    expect(workflowLinks(SALES, 'wf/1').run('a b')).toBe(
      '/acme/project-101/sales/workflows/wf%2F1/runs/a%20b',
    )
    expect(workflowLinks(null, 'wf/1').run('a&b')).toBe('/runs/a%26b?workflowId=wf%2F1')
  })
})
