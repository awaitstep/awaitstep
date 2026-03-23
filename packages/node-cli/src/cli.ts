#!/usr/bin/env node
import { resolve } from 'node:path'
import { generate } from './generate.js'
import { build } from './build.js'

const args = process.argv.slice(2)
const command = args[0]

if (!command || command === 'help' || command === '--help') {
  console.log(`Usage: awaitstep-node <command> [options]

Commands:
  generate [dir]   Validate and bundle all custom nodes into nodes.local.json
  build [dir]      Merge builtin + custom nodes into registry.json
                   Default dir: ./nodes
`)
  process.exit(0)
}

if (command === 'generate') {
  const nodesDir = resolve(args[1] ?? 'nodes')
  const result = await generate(nodesDir)

  if (result.errors.length > 0) {
    console.error('Failed to generate node bundles:\n')
    for (const err of result.errors) {
      const prefix = err.nodeId ? `  ${err.nodeId}: ` : '  '
      console.error(`${prefix}${err.error}`)
    }
    process.exit(1)
  }

  console.log(`Generated ${result.bundles.length} node bundle(s) → ${result.outputPath}`)
  for (const bundle of result.bundles) {
    console.log(`  ${bundle.definition.id} (${bundle.definition.version})`)
  }
  process.exit(0)
}

if (command === 'build') {
  const nodesDir = resolve(args[1] ?? 'nodes')
  const result = await build(nodesDir)

  if (result.error) {
    console.error(`Build failed: ${result.error}`)
    process.exit(1)
  }

  console.log(`Built node registry → ${result.outputPath}`)
  console.log(`  ${result.builtinCount} builtin + ${result.customCount} custom = ${result.totalNodes} total`)
  process.exit(0)
}

console.error(`Unknown command: ${command}`)
console.error('Run "awaitstep-node help" for usage')
process.exit(1)
