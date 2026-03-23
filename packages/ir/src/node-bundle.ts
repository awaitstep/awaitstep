import { z } from 'zod'
import type { NodeDefinition, Provider } from './node-definition.js'

export interface NodeBundle {
  definition: NodeDefinition
  templates: Partial<Record<Provider, string>>
  bundledAt: string
  checksum: string
}

const fieldTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'select',
  'multiselect',
  'secret',
  'code',
  'json',
  'expression',
  'textarea',
])

const fieldValidationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
    format: z.enum(['email', 'url', 'uuid', 'date', 'date-time', 'duration']).optional(),
  })
  .strict()

const configFieldSchema = z
  .object({
    type: fieldTypeSchema,
    label: z.string(),
    description: z.string().optional(),
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    placeholder: z.string().optional(),
    options: z.array(z.string()).optional(),
    envVarName: z.string().optional(),
    validation: fieldValidationSchema.optional(),
  })
  .strict()

const outputFieldTypeSchema = z.enum(['string', 'number', 'boolean', 'object', 'array', 'null'])

const outputFieldSchema: z.ZodType = z.lazy(() =>
  z
    .object({
      type: outputFieldTypeSchema,
      description: z.string().optional(),
      nullable: z.boolean().optional(),
      items: outputFieldSchema.optional(),
      properties: z.record(z.string(), outputFieldSchema).optional(),
    })
    .strict(),
)

const categorySchema = z.enum([
  'Payments',
  'Email',
  'Messaging',
  'Database',
  'Storage',
  'AI',
  'Authentication',
  'HTTP',
  'Scheduling',
  'Notifications',
  'Data',
  'Utilities',
  'Control Flow',
  'Internal',
])

const providerSchema = z.enum(['cloudflare', 'inngest', 'temporal', 'stepfunctions'])

const runtimeHintsSchema = z
  .object({
    defaultTimeout: z.string().optional(),
    defaultRetries: z.number().optional(),
    idempotent: z.boolean().optional(),
    streaming: z.boolean().optional(),
  })
  .strict()

export const nodeDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    name: z.string().min(1),
    version: z.string(),
    description: z.string().max(120),
    category: categorySchema,
    tags: z.array(z.string()).optional(),
    icon: z.string().optional(),
    docsUrl: z.string().url().optional(),
    author: z.string().min(1),
    license: z.string().min(1),
    configSchema: z.record(z.string(), configFieldSchema),
    outputSchema: z.record(z.string(), outputFieldSchema),
    providers: z.array(providerSchema).min(1),
    dependencies: z.record(
      z.string().min(1).max(214).regex(
        /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/,
        'Invalid npm package name',
      ),
      z.string().min(1).max(100).regex(
        /^(\*|latest|next|canary|[\^~]?\d+(\.\d+){0,2}(-[a-zA-Z0-9.]+)?(\s*\|\|\s*[\^~]?\d+(\.\d+){0,2}(-[a-zA-Z0-9.]+)?)*)$/,
        'Invalid version range (e.g. ^1.0.0, ~2.3, latest)',
      ),
    ).optional(),
    runtime: runtimeHintsSchema.optional(),
    deprecated: z.boolean().optional(),
    deprecationMessage: z.string().optional(),
    replacedBy: z.string().optional(),
  })
  .strict()

export const nodeBundleSchema = z
  .object({
    definition: nodeDefinitionSchema,
    templates: z.record(providerSchema, z.string().optional()).check(
      z.refine((templates) => Object.values(templates).some((v) => v !== undefined), {
        message: 'At least one provider template is required',
      }),
    ),
    bundledAt: z.string().datetime(),
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
