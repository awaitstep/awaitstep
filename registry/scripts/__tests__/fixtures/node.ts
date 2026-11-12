import type { NodeInput } from '../../lib/validate-node.js'

export const validBase = {
  id: 'example',
  name: 'Example',
  category: 'Utilities',
  author: 'awaitstep',
  license: 'Apache-2.0',
  docsUrl: 'https://example.com/docs',
  configSchema: {
    action: {
      type: 'select',
      label: 'Action',
      required: true,
      options: ['Do Thing'],
    },
    token: {
      type: 'secret',
      label: 'Token',
      required: true,
      envVarName: 'EXAMPLE_TOKEN',
    },
  },
  outputSchema: {
    id: { type: 'string' },
  },
  providers: ['cloudflare'],
  runtime: { defaultRetries: 2, defaultTimeout: '30 seconds' },
}

export const validOverrides = {
  version: '1.0.0',
  description: 'Do a thing',
}

export const validTemplate = `export default async function (ctx) {
  const action = ctx.config.action
  switch (action) {
    case 'Do Thing':
      return { id: String(ctx.env.EXAMPLE_TOKEN) }
    default:
      throw new Error(\`Unknown action: \${action}\`)
  }
}`

export const validInput: NodeInput = {
  id: 'example',
  base: validBase,
  versions: [
    {
      version: '1.0.0',
      overrides: validOverrides,
      templates: { cloudflare: validTemplate },
    },
  ],
  iconExists: true,
}
