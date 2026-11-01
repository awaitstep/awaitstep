import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetMockDb } from '../db'
import { AMA, DANIEL, TOM } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

// A project's accounts on dummy data (23a–23c): fixtures and trivial changes,
// with the project-admin gate the API has.

const { projectConnections: pc } = mockServer
const as = (userId: string): MockContext => ({ scenario: 'none', userId })
const ama = as(AMA)

beforeEach(() => {
  resetMockDb(new Date())
})

describe('project connections (dummy data)', () => {
  it('lists Project 101’s accounts, its default first, and where each workspace deploys', async () => {
    const listed = await pc.listProjectConnections(ama, 'acme', 'project-101')
    expect(listed.connections.map((c) => [c.name, c.scope, c.isDefault])).toEqual([
      ['Acme production', 'shared', true],
      ['Checkout staging', 'project', false],
    ])
    expect(listed.workspaces.find((w) => w.name === 'Sales')).toMatchObject({
      connectionName: 'Checkout staging',
      source: 'override',
    })
  })

  it('lets a project admin change the default; refuses someone who isn’t one', async () => {
    await pc.setProjectDefaultConnection(as(TOM), 'acme', 'project-101', 'conn_checkout')
    const listed = await pc.listProjectConnections(ama, 'acme', 'project-101')
    expect(listed.connections[0]?.id).toBe('conn_checkout')
    await expect(
      pc.setProjectDefaultConnection(as(DANIEL), 'acme', 'project-101', 'conn_production'),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('removes an owned account, and the one left becomes the default', async () => {
    await pc.setProjectDefaultConnection(ama, 'acme', 'project-101', 'conn_checkout')
    await pc.removeProjectConnection(ama, 'acme', 'project-101', 'conn_checkout')
    expect(getDb().connections.some((c) => c.id === 'conn_checkout')).toBe(false)
    expect(getDb().workspaceConnections).toEqual([])
    const listed = await pc.listProjectConnections(ama, 'acme', 'project-101')
    expect(listed.connections.map((c) => [c.id, c.isDefault])).toEqual([['conn_production', true]])
  })

  it('adds only accounts available to the project', async () => {
    await expect(
      pc.addProjectConnections(ama, 'acme', 'project-101', ['conn_marketing']),
    ).rejects.toMatchObject({ status: 422 })
    const available = await pc.listAvailableProjectConnections(ama, 'acme', 'project-101')
    expect(available.map((a) => [a.id, a.state])).toEqual([
      ['conn_production', 'added'],
      ['conn_marketing', 'restricted'],
    ])
  })
})
