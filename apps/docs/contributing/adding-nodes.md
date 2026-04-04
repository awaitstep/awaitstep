---
title: Adding Nodes
---

# Adding Nodes

This walkthrough shows how to add a custom node to AwaitStep. We'll build a `slack_post_message` node that posts a message to a Slack channel.

## 1. Create the directory

Node IDs follow the pattern `^[a-z][a-z0-9_]*$`. The directory name must match the node ID.

```bash
mkdir -p nodes/slack_post_message/templates
mkdir -p nodes/slack_post_message/tests/fixtures
```

## 2. Write node.json

`node.json` is the complete `NodeDefinition`. Every field must be accurate — it drives the UI, the expression autocomplete, and code generation.

```json
{
  "id": "slack_post_message",
  "name": "Slack: Post Message",
  "version": "1.0.0",
  "description": "Post a message to a Slack channel using the Slack Bot API.",
  "category": "Messaging",
  "tags": ["slack", "messaging", "notifications"],
  "author": "your-github-username",
  "license": "Apache-2.0",
  "providers": ["cloudflare"],

  "configSchema": {
    "channel": {
      "type": "string",
      "label": "Channel",
      "description": "Channel ID or name (e.g. #general or C01234ABCDE)",
      "required": true,
      "placeholder": "#general"
    },
    "text": {
      "type": "textarea",
      "label": "Message",
      "description": "Message text. Supports Slack mrkdwn formatting.",
      "required": true,
      "placeholder": "Hello from AwaitStep!"
    },
    "username": {
      "type": "string",
      "label": "Bot Username",
      "description": "Override the bot's display name.",
      "placeholder": "AwaitStep Bot"
    },
    "botToken": {
      "type": "secret",
      "label": "Slack Bot Token",
      "description": "Bot OAuth token from api.slack.com/apps. Starts with xoxb-.",
      "required": true,
      "envVarName": "SLACK_BOT_TOKEN"
    }
  },

  "outputSchema": {
    "ok": {
      "type": "boolean",
      "description": "Whether the message was sent successfully"
    },
    "ts": {
      "type": "string",
      "description": "Timestamp of the posted message (used as message ID)"
    },
    "channel": {
      "type": "string",
      "description": "Channel ID where the message was posted"
    }
  }
}
```

### Key rules to remember

- The `id` must not be a builtin: `step`, `sleep`, `sleep_until`, `branch`, `parallel`, `http_request`, `wait_for_event`
- Every `secret` field must have `envVarName`
- Every `select` or `multiselect` field must have non-empty `options`
- `description` must be under 120 characters
- `version` must be valid semver

## 3. Write the Cloudflare template

```typescript
// nodes/slack_post_message/templates/cloudflare.ts
import type { NodeContext } from '@awaitstep/node-sdk'

interface Config {
  channel: string
  text: string
  username?: string
  botToken: never // secret — accessed via ctx.env, never ctx.config
}

interface Output {
  ok: boolean
  ts: string
  channel: string
}

export default async function (ctx: NodeContext<Config>): Promise<Output> {
  const body: Record<string, unknown> = {
    channel: ctx.config.channel,
    text: ctx.config.text,
  }

  if (ctx.config.username) {
    body.username = ctx.config.username
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Slack HTTP error (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as {
    ok: boolean
    ts?: string
    channel?: string
    error?: string
  }

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error ?? 'unknown error'}`)
  }

  return {
    ok: data.ok,
    ts: data.ts ?? '',
    channel: data.channel ?? ctx.config.channel,
  }
}
```

### Template rules

- Export a **default async function** accepting `ctx: NodeContext<Config>`
- Return an object that **exactly matches** `outputSchema`
- Mark secret config fields as `never` in the `Config` interface — access them via `ctx.env` only
- Use only Web APIs (`fetch`, `crypto`, `URL`) — no `fs`, `path`, `process`, or `Buffer`
- **Throw on errors** — never swallow them with `try/catch` returning `{ success: false }`
- Never log secret values

## 4. Write tests

```typescript
// nodes/slack_post_message/tests/cloudflare.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockContext } from '@awaitstep/node-sdk/testing'
import handler from '../templates/cloudflare'

const mockConfig = {
  channel: '#general',
  text: 'Hello from tests!',
}

const mockEnv = {
  SLACK_BOT_TOKEN: 'xoxb-test-token',
}

describe('slack_post_message / cloudflare', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns ok, ts, and channel on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        ts: '1234567890.123456',
        channel: 'C01234ABCDE',
      }),
    })

    const ctx = createMockContext({ config: mockConfig, env: mockEnv })
    const result = await handler(ctx)

    expect(result).toEqual({
      ok: true,
      ts: '1234567890.123456',
      channel: 'C01234ABCDE',
    })
  })

  it('throws on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    const ctx = createMockContext({ config: mockConfig, env: mockEnv })
    await expect(handler(ctx)).rejects.toThrow('500')
  })

  it('throws on Slack API error (ok: false)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'channel_not_found' }),
    })

    const ctx = createMockContext({ config: mockConfig, env: mockEnv })
    await expect(handler(ctx)).rejects.toThrow('channel_not_found')
  })

  it('sends the correct Authorization header', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, ts: '123', channel: 'C1' }),
    })
    global.fetch = fetchSpy

    const ctx = createMockContext({ config: mockConfig, env: mockEnv })
    await handler(ctx)

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer xoxb-test-token')
  })
})
```

## 5. Write the README

The README documents the node for users browsing the marketplace. At minimum it must include a config table and an output table.

See `nodes/http_request/README.md` for a reference example.

## 6. Validate

Run the node CLI to validate your node before submitting:

```bash
pnpm node-cli validate nodes/slack_post_message
```

Fix any validation errors reported. Common mistakes:

| Mistake                           | Fix                                                 |
| --------------------------------- | --------------------------------------------------- |
| Secret field missing `envVarName` | Add `"envVarName": "SLACK_BOT_TOKEN"`               |
| `select` field missing `options`  | Add `"options": ["a", "b", "c"]`                    |
| Template returns extra fields     | Remove fields not in `outputSchema`                 |
| Template swallows errors          | Change `return { error }` to `throw new Error(...)` |

## 7. Run tests

```bash
cd nodes/slack_post_message
pnpm test
```

All tests must pass before submitting a pull request.
