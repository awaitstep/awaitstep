import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  migrateArtifact,
  validateArtifact,
  validateCustomNodeManifest,
  type ScriptIR,
  type WorkflowIR,
} from '@awaitstep/ir'
import {
  generateUniversalFunctionBundle,
  generateUniversalWorkflowBundle,
  normalizeStepModules,
  stepModuleProblems,
} from '@awaitstep/codegen'

/**
 * The shipped agent skills carry complete examples. They are content, not
 * code, so nothing else would notice a field rename or a broken arm: these
 * tests validate every one against the same schema a save and a deploy use.
 */
const SKILLS = join(dirname(fileURLToPath(import.meta.url)), '../../../../skills')

function read(path: string): string {
  return readFileSync(join(SKILLS, path), 'utf8')
}

function files(dir: string, suffix: string): string[] {
  return readdirSync(join(SKILLS, dir))
    .filter((name) => name.endsWith(suffix))
    .sort()
}

describe('agent skill examples', () => {
  it('ships exactly the documented workflow examples', () => {
    expect(files('awaitstep-workflows/references/examples', '.json')).toHaveLength(3)
  })

  it.each(files('awaitstep-workflows/references/examples', '.json'))(
    'workflow %s validates and generates',
    (name) => {
      const raw = JSON.parse(read(`awaitstep-workflows/references/examples/${name}`))
      const validated = validateArtifact(migrateArtifact(raw))
      expect(validated.ok, JSON.stringify(validated)).toBe(true)
      if (!validated.ok) return

      const ir = normalizeStepModules(validated.value) as WorkflowIR
      expect(stepModuleProblems(ir)).toEqual([])
      const bundle = generateUniversalWorkflowBundle(ir)
      expect(bundle.files.length).toBeGreaterThan(0)
      const source = bundle.files.map((file) => file.source).join('\n')

      // An expression in a URL must reach codegen as an interpolation, not as
      // a quoted string that still contains `order.id`.
      if (name === 'webhook-order.json') {
        expect(source).toContain('https://api.example.com/orders/${parse_trigger.orderId}')
        expect(source).not.toContain('https://api.example.com/orders/parse_trigger.orderId')
      }
      // The try/catch arms keep their values local; the continuation has no
      // inputs, which is what the example's report step says.
      if (name === 'try-catch.json') {
        expect(source).toContain('$report(stepArgs({ env, event, inputs: {}, step, ctx }))')
      }
    },
  )

  it('ships exactly the documented Function example', () => {
    expect(files('awaitstep-functions/references/examples', '.json')).toHaveLength(1)
  })

  it('function example validates, has no durable node and generates', () => {
    const name = files('awaitstep-functions/references/examples', '.json')[0]!
    const raw = JSON.parse(read(`awaitstep-functions/references/examples/${name}`))
    expect(raw.kind).toBe('script')

    const validated = validateArtifact(migrateArtifact(raw))
    expect(validated.ok, JSON.stringify(validated)).toBe(true)
    if (!validated.ok) return

    const ir = normalizeStepModules(validated.value) as ScriptIR
    expect(ir.nodes.map((node) => node.type)).not.toContain('sleep')
    expect(ir.nodes.map((node) => node.type)).not.toContain('sleep_until')
    expect(ir.nodes.map((node) => node.type)).not.toContain('wait_for_event')
    expect(stepModuleProblems(ir)).toEqual([])
    const bundle = generateUniversalFunctionBundle(ir)
    expect(bundle.files.length).toBeGreaterThan(0)
    expect(bundle.files.map((file) => file.source).join('\n')).toContain(
      'https://api.example.com/orders/${parse.orderId}',
    )
  })

  it('ships exactly the documented custom node example', () => {
    expect(files('awaitstep-custom-nodes/references/examples/weather/1.0.0', '.json')).toEqual([
      'node.json',
    ])
  })

  it('custom node manifest passes the publish rules', () => {
    const path = 'awaitstep-custom-nodes/references/examples/weather/1.0.0/node.json'
    const result = validateCustomNodeManifest(read(path), '1.0.0', path)
    expect(result.errors, JSON.stringify(result.errors)).toEqual([])
    expect(result.definition?.version).toBe('1.0.0')
    expect(result.definition?.providers).toEqual(['cloudflare'])
    for (const [field, spec] of Object.entries(result.definition?.configSchema ?? {})) {
      if (spec.type === 'secret') expect(spec.envVarName, `${field} envVarName`).toBeTruthy()
      if (spec.type === 'select' || spec.type === 'multiselect') {
        expect(spec.options, `${field} options`).toBeTruthy()
        expect(spec.options!.length).toBeGreaterThan(0)
      }
    }
  })

  it('module example has a valid package.json and an entry with an export', () => {
    const manifest = JSON.parse(
      read('awaitstep-modules/references/examples/lead-scoring/package.json'),
    ) as { name?: string; version?: string; type?: string }
    expect(manifest.name).toBe('lead-scoring')
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(manifest.type).toBe('module')
    expect(read('awaitstep-modules/references/examples/lead-scoring/index.ts')).toMatch(
      /export (function|const|interface)/,
    )
  })
})
