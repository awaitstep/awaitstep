import { describe, expect, it } from 'vitest'
import type { SceneNode } from '../graph'
import { clip, statusLine } from '../card-face'

const node = (over: Partial<SceneNode> = {}): SceneNode => ({
  id: 'n',
  name: 'Issue refund',
  kind: 'step',
  row: 0,
  lane: 0,
  ...over,
})

describe('statusLine', () => {
  it('says which attempt is running once there has been a retry', () => {
    expect(statusLine(node(), 'running', 1)).toBe('Running')
    expect(statusLine(node(), 'running', 2)).toBe('Running, attempt 2')
  })

  it('names the failure when the node has one', () => {
    expect(statusLine(node({ failure: 'Stripe 503' }), 'failed', 1)).toBe(
      'Attempt 1 failed: Stripe 503',
    )
    expect(statusLine(node(), 'failed', 1)).toBe('Attempt 1 failed')
  })

  it('reads a sleep by its duration, and a finish by its attempts', () => {
    expect(statusLine(node({ kind: 'sleep', detail: '3 days' }), 'sleeping', 1)).toBe(
      'Sleeping 3 days',
    )
    expect(statusLine(node(), 'done', 1)).toBe('Complete')
    expect(statusLine(node(), 'done', 2)).toBe('Complete after 2 attempts')
  })

  it('covers waiting, retrying and skipped, and falls back to the node’s detail when idle', () => {
    expect(statusLine(node(), 'waiting', 1)).toBe('Waiting for the event')
    expect(statusLine(node(), 'retrying', 2)).toBe('Retrying, attempt 2')
    expect(statusLine(node(), 'skipped', 0)).toBe('Not taken')
    expect(statusLine(node({ detail: 'POST /refunds' }), 'idle', 0)).toBe('POST /refunds')
  })
})

describe('clip', () => {
  it('keeps text that fits, and ends longer text with an ellipsis at the limit', () => {
    expect(clip('Send receipt', 12)).toBe('Send receipt')
    expect(clip('Update order status', 10)).toBe('Update or…')
    expect(clip('Update order status', 10)).toHaveLength(10)
  })
})
