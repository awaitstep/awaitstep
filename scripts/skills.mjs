#!/usr/bin/env node
// Validates the agent skill pack and copies it into the docs site.
//
// The pack is content, not code: the checks here keep the frontmatter, the
// manifest, the plugin catalog, the docs entry points and the examples from
// drifting apart. `apps/api`'s tests validate the IR and node examples against
// the real schema; this file cannot import the workspace packages.
//
// Usage:
//   node scripts/skills.mjs validate
//   node scripts/skills.mjs sync-docs          (refuses an invalid pack)
//   node scripts/skills.mjs sync-docs --warn   (copies it and lists the problems)

import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS = 'skills'
const DOCS_PAGE = 'apps/docs/agents/index.md'
const LLMS = 'apps/docs/public/llms.txt'
const MANIFEST = 'skills/manifest.json'
const PLUGIN = '.claude-plugin/plugin.json'
const MARKETPLACE = '.claude-plugin/marketplace.json'
const DOCS_COPY = 'apps/docs/public/skills'
const MAX_SKILL_BYTES = 12_000
const IR_SOURCE = 'packages/ir/src/types.ts'
const DOCS_SKILLS_URL = 'https://docs.awaitstep.dev/skills/'
const PACK_FILE_TYPES = ['md', 'json', 'ts', 'tsx', 'js', 'mjs', 'svg']
const PACK_FILE_RE = new RegExp(`\\.(${PACK_FILE_TYPES.join('|')})$`)
// The plugin's source is the repo root: a Claude Code plugin runs what these
// declare (hooks, MCP and LSP servers) and loads commands and agents from them,
// on every installer's machine. The pack ships skills only.
const PLUGIN_EXECUTABLE_PATHS = ['hooks', '.mcp.json', '.lsp.json', 'commands', 'agents']
const PLUGIN_EXECUTABLE_FIELDS = ['hooks', 'mcpServers', 'lspServers', 'commands', 'agents']

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const SECRET_PATTERNS = [
  /\bask_[A-Za-z0-9_-]{16,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./,
  /\bpassword\s*[:=]\s*\S{8,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAWAITSTEP_API_KEY\s*=\s*\S{8,}/,
]
const ABSOLUTE_PATH_PATTERNS = [
  /\/Users\/[A-Za-z0-9._-]+\//,
  /\/home\/[A-Za-z0-9._-]+\//,
  /[A-Za-z]:\\Users\\/,
]

function walk(root, dir) {
  const out = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...walk(root, path))
    else out.push(path)
  }
  return out
}

/** A symlink in the pack would be copied to the docs and could point anywhere. */
function symlinksIn(root, dir) {
  const found = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isSymbolicLink()) found.push(path)
    else if (entry.isDirectory()) found.push(...symlinksIn(root, path))
  }
  return found
}

/**
 * A deliberately small YAML frontmatter reader: one `key: value` per line plus
 * the folded/literal block forms the descriptions use. The pack never needs
 * anchors, lists or nested maps in SKILL.md frontmatter.
 */
export function parseFrontmatter(source) {
  if (!source.startsWith('---\n')) return { data: {}, body: source, error: 'missing opening ---' }
  const end = source.indexOf('\n---', 4)
  if (end === -1) return { data: {}, body: source, error: 'missing closing ---' }
  const raw = source.slice(4, end).split('\n')
  const body = source.slice(end + 4).replace(/^\n/, '')
  const data = {}
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i]
    if (line.trim() === '') continue
    const match = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line)
    if (!match) return { data, body, error: `unreadable frontmatter line: ${line}` }
    const [, key, rest = ''] = match
    const value = rest.trim()
    if (value === '>-' || value === '>' || value === '|' || value === '|-') {
      const lines = []
      while (i + 1 < raw.length && (raw[i + 1].startsWith(' ') || raw[i + 1] === '')) {
        i += 1
        lines.push(raw[i].replace(/^ {1,2}/, ''))
      }
      data[key] = lines.join(value.startsWith('|') ? '\n' : ' ').trim()
    } else {
      data[key] = unquote(value)
    }
  }
  return { data, body, error: null }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

/** Everything outside fenced blocks and inline code, so links in examples are not checked. */
function stripCode(source) {
  return source
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`\n]*`/g, '')
}

function relativeLinks(source) {
  const links = []
  const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  for (const match of stripCode(source).matchAll(re)) links.push(match[1])
  return links
}

function isExternal(link) {
  return (
    link.startsWith('http://') ||
    link.startsWith('https://') ||
    link.startsWith('mailto:') ||
    link.startsWith('#') ||
    link.startsWith('/')
  )
}

function checkLinks(skill, file, source, errors, root) {
  for (const link of relativeLinks(source)) {
    if (isExternal(link)) continue
    const target = link.split('#')[0]
    if (target === '') continue
    const path = resolve(root, dirname(file), target)
    const inside = path === join(root, SKILLS) || path.startsWith(join(root, SKILLS) + sep)
    if (!inside || !existsSync(path)) {
      errors.push(`${skill}: ${file} links to missing ${link}`)
    }
  }
}

/**
 * A `references/…` path written as inline code is an instruction to read that
 * file, so it must exist in the same skill: a skill installed on its own has
 * nothing else. Another skill's file is linked by its docs URL instead.
 */
function checkReferencePaths(skill, file, source, errors, root) {
  const skillRoot = resolve(root, SKILLS, skill)
  for (const match of source.matchAll(/`(references\/[^`\s]+)`/g)) {
    const target = match[1].replace(/[.,;:]+$/, '')
    if (!existsSync(resolve(skillRoot, target))) {
      errors.push(`${skill}: ${file} names missing ${target}`)
    }
  }
}

/** A docs URL into the pack must name a file the docs copy will serve. */
function checkDocsUrls(skill, file, source, errors, root) {
  const re = new RegExp(`${DOCS_SKILLS_URL.replace(/[.]/g, '\\.')}([^\\s)\\]"'\`<>]+)`, 'g')
  for (const match of source.matchAll(re)) {
    // Sentence punctuation after a bare URL is not part of it.
    const target = match[1].split('#')[0].replace(/[.,;:!?*_]+$/, '')
    const path = resolve(root, SKILLS, target)
    const inside = path.startsWith(join(root, SKILLS) + sep)
    if (!inside || !existsSync(path)) {
      errors.push(`${skill}: ${file} links to missing ${DOCS_SKILLS_URL}${target}`)
    }
  }
}

/** The IR version the pack documents, read from `@awaitstep/ir`'s source. */
export function currentIrVersion(root = ROOT) {
  const path = resolve(root, IR_SOURCE)
  if (!existsSync(path)) return null
  const match = /export const IR_VERSION = (\d+)/.exec(readFileSync(path, 'utf8'))
  return match ? Number(match[1]) : null
}

function checkIrMentions(skill, file, source, errors, irVersion) {
  for (const match of source.matchAll(/\bIR v(\d+)\b/g)) {
    if (Number(match[1]) !== irVersion) {
      errors.push(`${skill}: ${file} says IR v${match[1]}; the IR is v${irVersion}`)
    }
  }
}

function checkText(skill, file, source, errors) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(source)) errors.push(`${skill}: ${file} looks like it contains a secret`)
  }
  for (const pattern of ABSOLUTE_PATH_PATTERNS) {
    if (pattern.test(source)) errors.push(`${skill}: ${file} contains an absolute home path`)
  }
}

export function validatePack({ root = ROOT, irVersion = currentIrVersion(root) } = {}) {
  const errors = []
  if (irVersion === null) errors.push(`${IR_SOURCE}: IR_VERSION not found`)
  const R = (path) => resolve(root, path)
  const readAt = (path) => readFileSync(R(path), 'utf8')
  const existsAt = (path) => existsSync(R(path))
  const isDir = (path) => existsAt(path) && statSync(R(path)).isDirectory()

  const skillsRoot = 'skills'
  if (!isDir(skillsRoot))
    return { ok: false, errors: ['skills/: directory is missing'], skills: [], warnings: [] }

  const dirs = readdirSync(R(skillsRoot), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  const manifestPath = 'skills/manifest.json'
  let manifest = null
  try {
    manifest = JSON.parse(readAt(manifestPath))
  } catch (error) {
    errors.push(`${manifestPath}: ${error.message}`)
  }

  if (manifest) {
    if (manifest.name !== 'awaitstep') errors.push(`${manifestPath}: name must be "awaitstep"`)
    if (!SEMVER_RE.test(String(manifest.version ?? '')))
      errors.push(`${manifestPath}: version must be major.minor.patch`)
    if (!/^https:\/\//.test(String(manifest.docs ?? '')))
      errors.push(`${manifestPath}: docs must be an https URL`)
    if (manifest.api?.irVersion !== irVersion)
      errors.push(`${manifestPath}: api.irVersion must be ${irVersion} (IR_VERSION)`)
    const listed = Array.isArray(manifest.skills) ? manifest.skills : []
    if (new Set(listed).size !== listed.length)
      errors.push(`${manifestPath}: skills lists a name twice`)
    for (const name of dirs)
      if (!listed.includes(name)) errors.push(`${manifestPath}: missing ${name}`)
    for (const name of listed) {
      if (!dirs.includes(name)) errors.push(`${manifestPath}: lists unknown skill ${name}`)
    }
    if (manifest.entry !== 'awaitstep/SKILL.md')
      errors.push(`${manifestPath}: entry must be awaitstep/SKILL.md`)
    if (!listed.includes('awaitstep')) errors.push(`${manifestPath}: entry skill is not listed`)
  }

  const seen = new Set()
  for (const name of dirs) {
    const dir = `${skillsRoot}/${name}`
    const file = `${dir}/SKILL.md`
    if (!existsAt(file)) {
      errors.push(`${name}: SKILL.md is missing`)
      continue
    }
    const source = readAt(file)
    const bytes = Buffer.byteLength(source)
    if (bytes > MAX_SKILL_BYTES)
      errors.push(`${name}: SKILL.md is ${bytes} bytes (max ${MAX_SKILL_BYTES})`)
    const { data, body, error } = parseFrontmatter(source)
    if (error) errors.push(`${name}: ${error}`)
    // A folded block keeps a description with a colon or a hash valid YAML;
    // a plain scalar with ": " makes the docs build fail instead.
    if (!/^description:\s*(?:>-|>|\||\|-)/m.test(source)) {
      errors.push(`${name}: description must use a folded block (description: >-)`)
    }
    if (data.name !== name) errors.push(`${name}: frontmatter name is "${data.name ?? ''}"`)
    if (!NAME_RE.test(String(data.name ?? '')) || data.name.length > 64)
      errors.push(`${name}: frontmatter name must be lowercase words joined by hyphens, max 64`)
    const description = String(data.description ?? '').trim()
    if (description.length === 0 || description.length > 1024)
      errors.push(`${name}: description must be 1..1024 characters`)
    if (!data.license) errors.push(`${name}: license is missing`)
    if (!data.compatibility) errors.push(`${name}: compatibility is missing`)
    if (String(data.compatibility ?? '').length > 500) {
      errors.push(`${name}: compatibility must be at most 500 characters`)
    }
    if (body.trim().length === 0) errors.push(`${name}: body is empty`)
    // Links and text are checked with every other file below, once.
    seen.add(name)
  }

  const allFiles = existsAt(skillsRoot) ? walk(root, skillsRoot) : []
  for (const path of existsAt(skillsRoot) ? symlinksIn(root, skillsRoot) : []) {
    errors.push(`${path}: symlinks are not allowed in the skill pack`)
  }
  for (const file of allFiles) {
    // Everything under skills/ is copied to the public docs site, so only text
    // the scans below read may be there: anything else would skip them.
    if (!PACK_FILE_RE.test(file)) {
      errors.push(`${file}: only ${PACK_FILE_TYPES.join(', ')} files may be in the skill pack`)
      continue
    }
    const source = readAt(file)
    const skill = file.split('/')[1] ?? file
    if (file.endsWith('.md')) {
      checkLinks(skill, file, source, errors, root)
      if (dirs.includes(skill)) checkReferencePaths(skill, file, source, errors, root)
      checkDocsUrls(skill, file, source, errors, root)
      if (irVersion !== null) checkIrMentions(skill, file, source, errors, irVersion)
    }
    if (file.endsWith('.json')) {
      try {
        JSON.parse(source)
      } catch (error) {
        errors.push(`${file}: invalid JSON (${error.message})`)
      }
    }
    if (/(^|\/)template\.tsx?$/.test(file)) {
      if (!/export default/.test(source)) errors.push(`${file}: template has no default export`)
    }
    checkText(file.split('/')[1] ?? file, file, source, errors)
  }

  // Plugin catalog.
  if (!existsAt(PLUGIN)) errors.push(`${PLUGIN}: missing`)
  else {
    let plugin = null
    try {
      plugin = JSON.parse(readAt(PLUGIN))
    } catch (error) {
      errors.push(`${PLUGIN}: ${error.message}`)
    }
    if (plugin) {
      if (plugin.name !== 'awaitstep') errors.push(`${PLUGIN}: name must be "awaitstep"`)
      if (!SEMVER_RE.test(String(plugin.version ?? '')))
        errors.push(`${PLUGIN}: version must be major.minor.patch`)
      if (manifest && plugin.version !== manifest.version)
        errors.push(`${PLUGIN}: version must match skills/manifest.json (${manifest.version})`)
      if (!plugin.description) errors.push(`${PLUGIN}: description is missing`)
      if (plugin.license !== 'Apache-2.0') errors.push(`${PLUGIN}: license must be Apache-2.0`)
      for (const field of PLUGIN_EXECUTABLE_FIELDS) {
        if (plugin[field] !== undefined) {
          errors.push(
            `${PLUGIN}: "${field}" would ship to every installer; the plugin is skills only`,
          )
        }
      }
    }
  }

  for (const path of PLUGIN_EXECUTABLE_PATHS) {
    if (existsAt(path)) {
      errors.push(
        `${path}: the plugin source is the repo root, so this would ship to every installer`,
      )
    }
  }

  if (!existsAt(MARKETPLACE)) errors.push(`${MARKETPLACE}: missing`)
  else {
    let market = null
    try {
      market = JSON.parse(readAt(MARKETPLACE))
    } catch (error) {
      errors.push(`${MARKETPLACE}: ${error.message}`)
    }
    if (market) {
      if (!NAME_RE.test(String(market.name ?? ''))) errors.push(`${MARKETPLACE}: invalid name`)
      if (!market.owner?.name) errors.push(`${MARKETPLACE}: owner.name is missing`)
      const entries = Array.isArray(market.plugins) ? market.plugins : []
      if (entries.length !== 1) errors.push(`${MARKETPLACE}: must list exactly one plugin`)
      for (const entry of entries) {
        if (entry.name !== 'awaitstep')
          errors.push(`${MARKETPLACE}: plugin name must be "awaitstep"`)
        if (typeof entry.source !== 'string' || !entry.source.startsWith('./'))
          errors.push(`${MARKETPLACE}: source must be a ./ path`)
        else {
          const target = resolve(root, entry.source)
          if (!existsSync(target) || (target !== root && !target.startsWith(root + sep)))
            errors.push(`${MARKETPLACE}: source ${entry.source} does not resolve inside the repo`)
        }
        if (!entry.description) errors.push(`${MARKETPLACE}: entry description is missing`)
        if (entry.version !== undefined && entry.version !== manifest?.version)
          errors.push(`${MARKETPLACE}: entry version must be omitted or match the manifest`)
      }
    }
  }

  // Docs entry points: every skill is linked from both.
  if (!existsAt(DOCS_PAGE)) errors.push(`${DOCS_PAGE}: missing`)
  else {
    const page = readAt(DOCS_PAGE)
    checkDocsUrls('docs', DOCS_PAGE, page, errors, root)
    for (const name of dirs) {
      const link = `https://docs.awaitstep.dev/skills/${name}/SKILL.md`
      if (!page.includes(link)) errors.push(`${DOCS_PAGE}: does not link ${link}`)
    }
  }
  if (!existsAt(LLMS)) errors.push(`${LLMS}: missing`)
  else {
    const llms = readAt(LLMS)
    checkDocsUrls('docs', LLMS, llms, errors, root)
    for (const name of dirs) {
      const link = `https://docs.awaitstep.dev/skills/${name}/SKILL.md`
      if (!llms.includes(link)) errors.push(`${LLMS}: does not list ${link}`)
    }
  }

  for (const name of seen) {
    if (!dirs.includes(name)) errors.push(`${name}: listed but not a skill directory`)
  }

  return { ok: errors.length === 0, errors, skills: dirs, warnings: [] }
}

/**
 * Copies the pack into the docs site. `strict` (the docs build, which deploys)
 * refuses an invalid pack; otherwise (the docs dev server) the problems come
 * back as warnings and the copy goes ahead, so a typo in one skill does not
 * stop the site from serving. A symlink is refused either way.
 */
export function syncDocs({ root = ROOT, strict = true } = {}) {
  const source = resolve(root, SKILLS)
  const target = resolve(root, DOCS_COPY)
  const publicRoot = resolve(root, 'apps/docs/public')
  if (!target.startsWith(publicRoot + sep)) {
    throw new Error(`refusing to write outside apps/docs/public: ${target}`)
  }
  if (!existsSync(source)) throw new Error(`skills/ is missing at ${source}`)
  for (const path of symlinksIn(root, SKILLS)) {
    throw new Error(`refusing to copy the skill pack: ${path} is a symlink`)
  }
  const checked = validatePack({ root })
  if (!checked.ok && strict) {
    throw new Error(`refusing to copy an invalid skill pack:\n  ${checked.errors.join('\n  ')}`)
  }
  rmSync(target, { recursive: true, force: true })
  cpSync(source, target, { recursive: true })
  return { source, target, warnings: checked.ok ? [] : checked.errors }
}

function main(argv) {
  const command = argv[2] ?? 'validate'
  if (command === 'validate') {
    const result = validatePack()
    if (!result.ok) {
      console.error(`Agent skills: ${result.errors.length} problem(s)`)
      for (const error of result.errors) console.error(`  - ${error}`)
      process.exit(1)
    }
    console.log(`Agent skills: ${result.skills.length} skills validated`)
    return
  }
  if (command === 'sync-docs') {
    const { target, warnings } = syncDocs({ strict: !argv.includes('--warn') })
    for (const warning of warnings) console.warn(`  ! ${warning}`)
    if (warnings.length > 0) console.warn(`Agent skills: ${warnings.length} problem(s) to fix`)
    console.log(`Agent skills copied to ${relative(ROOT, target)}/`)
    return
  }
  if (command === 'list') {
    const result = validatePack()
    for (const name of result.skills) console.log(name)
    return
  }
  console.error(`Unknown command: ${command}`)
  process.exit(2)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv)
