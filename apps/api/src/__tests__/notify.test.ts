import { describe, expect, it, vi } from 'vitest'
import type { NotifiedRecipient } from '@awaitstep/db'
import { createBudget } from '../middleware/rate-limit.js'
import { emailEach } from '../lib/notify.js'

// Notification emails stay within each person's hourly budget: past it, the
// Inbox alone tells them, so many failing workflows or requests can't flood
// one mailbox.

const person = (userId: string): NotifiedRecipient => ({
  userId,
  email: `${userId}@x.test`,
  name: userId,
  orgSlug: 'acme',
  count: 1,
})

describe('emailEach', () => {
  it('sends to each person until their budget is spent', async () => {
    const budget = createBudget({ windowMs: 60_000, max: 2 })
    const send = vi.fn(async (_to: NotifiedRecipient) => undefined)
    await emailEach([person('ama'), person('ben')], send, budget)
    await emailEach([person('ama')], send, budget)
    await emailEach([person('ama'), person('ben')], send, budget)
    expect(send.mock.calls.map(([to]) => to.userId)).toEqual(['ama', 'ben', 'ama', 'ben'])
  })

  it('never fails the caller when a send fails', async () => {
    const budget = createBudget({ windowMs: 60_000, max: 5 })
    await expect(
      emailEach([person('ama')], () => Promise.reject(new Error('down')), budget),
    ).resolves.toBeUndefined()
  })
})
