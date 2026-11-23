import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cachingDisabled } from './check-hyperdrive-caching.mjs'

test('passes a config with caching disabled, after wrangler’s banner', () => {
  assert.equal(cachingDisabled('⛅️ wrangler 4\n{"id":"x","caching":{"disabled":true}}'), true)
})

test('fails a config with caching on, or with no caching setting (the default is on)', () => {
  assert.equal(cachingDisabled('{"id":"x","caching":{"disabled":false}}'), false)
  assert.equal(cachingDisabled('{"id":"x"}'), false)
})

test('throws when the output holds no config', () => {
  assert.throws(() => cachingDisabled('Error: not found'), /No Hyperdrive config/)
})
