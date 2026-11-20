import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { currentIrVersion, parseFrontmatter, syncDocs, validatePack } from './skills.mjs'

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const SKILL = `---
name: awaitstep
description: >-
  Test skill. Use when testing.
license: Apache-2.0
compatibility: Test fixture.
---

# Test

Read [the extra reference](references/extra.md).
`

const EXTRA = '# Extra\n'

function write(root, path, source) {
  const file = join(root, path)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, source)
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'awaitstep-skills-'))
  roots.push(root)
  write(root, 'skills/awaitstep/SKILL.md', SKILL)
  write(root, 'skills/awaitstep/references/extra.md', EXTRA)
  write(root, 'packages/ir/src/types.ts', 'export const IR_VERSION = 3 as const\n')
  write(
    root,
    'skills/manifest.json',
    JSON.stringify({
      name: 'awaitstep',
      version: '1.0.0',
      description: 'Test pack',
      docs: 'https://docs.example.com/agents/',
      api: { baseUrl: 'https://docs.example.com/api', irVersion: 3 },
      entry: 'awaitstep/SKILL.md',
      skills: ['awaitstep'],
    }),
  )
  write(
    root,
    '.claude-plugin/plugin.json',
    JSON.stringify({
      name: 'awaitstep',
      version: '1.0.0',
      description: 'Test plugin',
      license: 'Apache-2.0',
    }),
  )
  write(
    root,
    '.claude-plugin/marketplace.json',
    JSON.stringify({
      name: 'awaitstep',
      owner: { name: 'AwaitStep' },
      plugins: [{ name: 'awaitstep', source: './', description: 'Test plugin' }],
    }),
  )
  write(
    root,
    'apps/docs/agents/index.md',
    '[awaitstep](https://docs.awaitstep.dev/skills/awaitstep/SKILL.md)\n',
  )
  write(
    root,
    'apps/docs/public/llms.txt',
    '[awaitstep](https://docs.awaitstep.dev/skills/awaitstep/SKILL.md)\n',
  )
  return root
}

test('a valid pack passes', () => {
  const result = validatePack({ root: fixture() })
  assert.equal(result.ok, true, result.errors.join('\n'))
})

test('a skill whose folder and frontmatter name disagree fails', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/SKILL.md', SKILL.replace('name: awaitstep', 'name: other'))
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /frontmatter name is "other"/)
})

test('a broken relative link fails', () => {
  const root = fixture()
  write(
    root,
    'skills/awaitstep/SKILL.md',
    SKILL.replace('references/extra.md', 'references/nope.md'),
  )
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /links to missing references\/nope\.md/)
})

test('a manifest that misses a skill fails', () => {
  const root = fixture()
  write(
    root,
    'skills/manifest.json',
    JSON.stringify({
      name: 'awaitstep',
      version: '1.0.0',
      docs: 'https://docs.example.com/agents/',
      api: { baseUrl: 'https://docs.example.com/api', irVersion: 3 },
      entry: 'awaitstep/SKILL.md',
      skills: [],
    }),
  )
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /missing awaitstep/)
})

test('a docs page or llms.txt that does not list a skill fails', () => {
  const root = fixture()
  write(root, 'apps/docs/public/llms.txt', '# nothing\n')
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(
    result.errors.join('\n'),
    /does not list https:\/\/docs\.awaitstep\.dev\/skills\/awaitstep\/SKILL\.md/,
  )
})

test('a plugin whose version disagrees with the manifest fails', () => {
  const root = fixture()
  write(
    root,
    '.claude-plugin/plugin.json',
    JSON.stringify({
      name: 'awaitstep',
      version: '2.0.0',
      description: 'Test plugin',
      license: 'Apache-2.0',
    }),
  )
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /match skills\/manifest\.json/)
})

test('a secret-looking token fails', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/notes.md', `token ask_${'a'.repeat(24)}\n`)
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /looks like it contains a secret/)
})

test('a GitHub token fails', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/notes.md', `token ghp_${'a'.repeat(36)}\n`)
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /looks like it contains a secret/)
})

test('an absolute home path fails', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/notes.md', '/Users/someone/project\n')
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /absolute home path/)
})

test('a template without a default export fails', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/references/examples/x/1.0.0/template.ts', 'export const x = 1\n')
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /template has no default export/)
})

test('a plain description is refused (YAML colon/hash risk)', () => {
  const root = fixture()
  write(
    root,
    'skills/awaitstep/SKILL.md',
    SKILL.replace('description: >-\n  Test skill. Use when testing.', 'description: Test: skill'),
  )
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /description must use a folded block/)
})

test('a reference file with a broken link fails', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/references/extra.md', '[missing](other.md)\n')
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /references\/extra\.md links to missing other\.md/)
})

test('a symlink in the pack fails', () => {
  const root = fixture()
  symlinkSync(
    join(root, 'skills/awaitstep/references/extra.md'),
    join(root, 'skills/awaitstep/references/link.md'),
  )
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /symlinks are not allowed/)
})

test('a Windows absolute path fails', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/notes.md', 'C:\\Users\\someone\\file.ts\n')
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /absolute home path/)
})

test('a docs link on another domain fails', () => {
  const root = fixture()
  write(
    root,
    'apps/docs/agents/index.md',
    '[awaitstep](https://docs.example.com/skills/awaitstep/SKILL.md)\n',
  )
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /does not link https:\/\/docs\.awaitstep\.dev/)
})

test('frontmatter reads plain and folded descriptions', () => {
  const plain = parseFrontmatter('---\nname: x\ndescription: one\n---\nbody\n')
  assert.equal(plain.data.description, 'one')
  const folded = parseFrontmatter('---\nname: x\ndescription: >-\n  one\n  two\n---\nbody\n')
  assert.equal(folded.data.description, 'one two')
  assert.equal(folded.error, null)
})

test('a references/ path in inline code that the skill does not have fails', () => {
  const root = fixture()
  // Another skill's file, named as if it were this one's: a skill installed on
  // its own would be told to read a file it does not have.
  write(
    root,
    'skills/awaitstep/references/extra.md',
    'See `awaitstep-workflows` → `references/step-code.md`.\n',
  )
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /names missing references\/step-code\.md/)
})

test('a references/ path in inline code that exists passes', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/references/more.md', 'Read `references/extra.md`.\n')
  const result = validatePack({ root })
  assert.equal(result.ok, true, result.errors.join('\n'))
})

test('a docs URL to a file the pack does not have fails', () => {
  const root = fixture()
  write(
    root,
    'skills/awaitstep/references/more.md',
    '[ok](https://docs.awaitstep.dev/skills/awaitstep/references/extra.md) and ' +
      '[gone](https://docs.awaitstep.dev/skills/awaitstep/references/gone.md)\n',
  )
  const result = validatePack({ root })
  assert.equal(result.ok, false)
  const errors = result.errors.join('\n')
  assert.match(
    errors,
    /links to missing https:\/\/docs\.awaitstep\.dev\/skills\/awaitstep\/references\/gone\.md/,
  )
  assert.doesNotMatch(errors, /extra\.md/)
})

test('the manifest and the skills follow the IR version', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/references/more.md', 'Works with IR v3.\n')
  const result = validatePack({ root, irVersion: 4 })
  assert.equal(result.ok, false)
  const errors = result.errors.join('\n')
  assert.match(errors, /api\.irVersion must be 4/)
  assert.match(errors, /says IR v3; the IR is v4/)
})

test('the IR version is read from @awaitstep/ir under the root being checked', () => {
  assert.equal(typeof currentIrVersion(), 'number')
  const root = fixture()
  write(root, 'packages/ir/src/types.ts', 'export const IR_VERSION = 4 as const\n')
  assert.match(validatePack({ root }).errors.join('\n'), /api\.irVersion must be 4/)
  rmSync(join(root, 'packages'), { recursive: true })
  assert.match(validatePack({ root }).errors.join('\n'), /IR_VERSION not found/)
})

test('a broken link in SKILL.md is reported once', () => {
  const root = fixture()
  write(
    root,
    'skills/awaitstep/SKILL.md',
    SKILL.replace('references/extra.md', 'references/nope.md'),
  )
  const missing = validatePack({ root }).errors.filter((e) => e.includes('references/nope.md'))
  assert.equal(missing.length, 1, missing.join('\n'))
})

test('a docs URL followed by sentence punctuation passes', () => {
  const root = fixture()
  write(
    root,
    'skills/awaitstep/references/more.md',
    'See https://docs.awaitstep.dev/skills/awaitstep/SKILL.md. Or https://docs.awaitstep.dev/skills/awaitstep/references/extra.md, too.\n',
  )
  const result = validatePack({ root })
  assert.equal(result.ok, true, result.errors.join('\n'))
})

test('the docs dev sync copies an invalid pack and lists its problems; the build refuses it', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/references/extra.md', '[missing](other.md)\n')
  assert.throws(() => syncDocs({ root }), /refusing to copy an invalid skill pack/)
  const { warnings } = syncDocs({ root, strict: false })
  assert.match(warnings.join('\n'), /links to missing other\.md/)
  assert.equal(existsSync(join(root, 'apps/docs/public/skills/awaitstep/SKILL.md')), true)
})

test('a file type the scans do not read is refused from the public pack', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/references/examples/.env', 'TOKEN=abc\n')
  write(root, 'skills/awaitstep/notes.txt', 'text\n')
  const errors = validatePack({ root }).errors.join('\n')
  assert.match(errors, /examples\/\.env: only md, json/)
  assert.match(errors, /notes\.txt: only md, json/)
})

test('an svg in the pack is scanned like any other file', () => {
  const root = fixture()
  write(root, 'skills/awaitstep/icon.svg', `<svg><!-- ghp_${'a'.repeat(36)} --></svg>\n`)
  assert.match(
    validatePack({ root }).errors.join('\n'),
    /icon\.svg looks like it contains a secret/,
  )
})

test('a root hook, MCP server, command or agent would ship with the plugin and fails', () => {
  const root = fixture()
  write(root, 'hooks/hooks.json', '{}')
  write(root, '.mcp.json', '{}')
  write(root, 'agents/x.md', '# x\n')
  const errors = validatePack({ root }).errors.join('\n')
  assert.match(errors, /^hooks: the plugin source is the repo root/m)
  assert.match(errors, /^\.mcp\.json: the plugin source/m)
  assert.match(errors, /^agents: the plugin source/m)
})

test('a plugin manifest that declares hooks or MCP servers fails', () => {
  const root = fixture()
  write(
    root,
    '.claude-plugin/plugin.json',
    JSON.stringify({
      name: 'awaitstep',
      version: '1.0.0',
      description: 'Test plugin',
      license: 'Apache-2.0',
      hooks: './hooks.json',
      mcpServers: {},
    }),
  )
  const errors = validatePack({ root }).errors.join('\n')
  assert.match(errors, /"hooks" would ship to every installer/)
  assert.match(errors, /"mcpServers" would ship to every installer/)
})
