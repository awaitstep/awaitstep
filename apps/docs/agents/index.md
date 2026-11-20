---
title: Agent skills
---

# Agent skills

AwaitStep ships a pack of [Agent Skills](https://agentskills.io) that teaches a
coding agent to build and change AwaitStep artifacts through the REST API: durable
workflows, Functions (`kind: "script"`), Library modules, custom nodes, and the
project files behind Code mode.

The pack is for **your** coding agent — Claude Code, Cursor, Codex or any other
client that reads `SKILL.md`. It is not an in-product chat assistant.

::: warning This is a guided builder, not an importer
There is no in-product AI chat and no one-click import from Inngest, Temporal,
Trigger.dev, n8n or a raw Cloudflare Worker. The skills teach an agent to build
the graph and the files with the API; converting another engine's code is a
guided rebuild.
:::

## What the pack covers

| Skill                                                                                       | Use it for                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [awaitstep](https://docs.awaitstep.dev/skills/awaitstep/SKILL.md)                           | Start here: instance setup, API key scopes, read-before-write rules, which skill to use |
| [awaitstep-workflows](https://docs.awaitstep.dev/skills/awaitstep-workflows/SKILL.md)       | Durable workflows: build, test, deploy, schedule, control runs, roll back, take down    |
| [awaitstep-functions](https://docs.awaitstep.dev/skills/awaitstep-functions/SKILL.md)       | A Function (`kind: "script"`): HTTP-only, request-scoped; calls are recorded as runs    |
| [awaitstep-modules](https://docs.awaitstep.dev/skills/awaitstep-modules/SKILL.md)           | Reusable Library code imported as `#modules/<slug>`                                     |
| [awaitstep-custom-nodes](https://docs.awaitstep.dev/skills/awaitstep-custom-nodes/SKILL.md) | A reusable palette node: `node.json`, a template, versions and placement                |
| [awaitstep-canvas](https://docs.awaitstep.dev/skills/awaitstep-canvas/SKILL.md)             | Working on a graph the user is looking at: layout, arm labels, conflicts, handoff       |
| [awaitstep-ide](https://docs.awaitstep.dev/skills/awaitstep-ide/SKILL.md)                   | Code mode: handlers, `package.json`, `#app` imports, step sources, check and deploy     |

The word **script** is overloaded. The `awaitstep` skill asks which one is meant:
a Function, a module, or a project file.

## Install

### Claude Code (plugin marketplace)

```text
/plugin marketplace add awaitstep/awaitstep
/plugin install awaitstep@awaitstep
```

The skills appear as `/awaitstep:awaitstep-workflows`, `/awaitstep:awaitstep-ide`
and so on. Update with `/plugin marketplace update awaitstep` once a newer pack
is published.

### Any Agent Skills client

```bash
# Install for Claude Code, Cursor and Codex; adjust the -a list to your clients
npx skills add awaitstep/awaitstep -a claude-code -a cursor -a codex

# Or install one skill
npx skills add awaitstep/awaitstep --skill awaitstep-workflows -a claude-code

# Use a skill without installing it
npx skills use awaitstep/awaitstep@awaitstep-workflows
```

A single skill still assumes the `awaitstep` entry skill, so install that one
with it. Where a skill needs another skill's reference file, it links to the
copy on this site.

Add `--copy` on a client that does not support symlinks. Project installs land
under `.claude/skills/` (and the equivalent directory for other agents); `-g`
installs for your user.

### Read it without installing

Every skill is plain Markdown:

- [awaitstep](https://docs.awaitstep.dev/skills/awaitstep/SKILL.md)
- [awaitstep-workflows](https://docs.awaitstep.dev/skills/awaitstep-workflows/SKILL.md)
- [awaitstep-functions](https://docs.awaitstep.dev/skills/awaitstep-functions/SKILL.md)
- [awaitstep-modules](https://docs.awaitstep.dev/skills/awaitstep-modules/SKILL.md)
- [awaitstep-custom-nodes](https://docs.awaitstep.dev/skills/awaitstep-custom-nodes/SKILL.md)
- [awaitstep-canvas](https://docs.awaitstep.dev/skills/awaitstep-canvas/SKILL.md)
- [awaitstep-ide](https://docs.awaitstep.dev/skills/awaitstep-ide/SKILL.md)
- [manifest.json](https://docs.awaitstep.dev/skills/manifest.json)

`/llms.txt` lists the same entry points for an agent that discovers sites.

## Connect it to your instance

The agent needs three things:

| Value            | Environment variable | Example                                                                            |
| ---------------- | -------------------- | ---------------------------------------------------------------------------------- |
| API root         | `AWAITSTEP_API_URL`  | `https://app.awaitstep.dev/api` (cloud), `http://localhost:8080/api` (self-hosted) |
| API key          | `AWAITSTEP_API_KEY`  | `ask_…`                                                                            |
| Scope (optional) | `AWAITSTEP_SCOPE`    | `?org=acme&project=store&workspace=sales`                                          |

A project or workspace key that reaches one place needs no scope. The key is
created in the dashboard under **API keys**; a project key is the usual choice.

The agent should prove the key with one read before building:

```bash
curl -sS "$AWAITSTEP_API_URL/workflows$AWAITSTEP_SCOPE" \
  -H "Authorization: Bearer $AWAITSTEP_API_KEY"
```

Then it reads the live contract: `GET /workflows/:id/full`,
`GET /workflows/:id/project`, `GET /nodes`, `GET /workflows/:id/custom-nodes` and
`GET /library/summary`. The server's values win over anything written in a skill.

### Key permissions

| Work                 | Cells                                                     |
| -------------------- | --------------------------------------------------------- |
| Read, check          | `workflows:read`, `library:read`, `runs:read`             |
| Build                | `workflows:write`, `library:write`                        |
| Test                 | `workflows:write` (start), `workflows:run` (trigger/call) |
| Deploy               | `workflows:deploy`                                        |
| Variables            | `variables:*`                                             |
| Marketplace installs | an organization key with `resources:*`                    |

Give the key the smallest grid the task needs. An organization key never reaches
a workflow or the Library. A key acts with the standing of the person who minted
it.

## What the agent will not do

The pack encodes these rules; they are worth knowing before you point an agent at
a real project:

- **Generated files are off-limits.** `worker.*`, `nodes/**`, `awaitstep/**`,
  `modules/**` and `wrangler.*` are rewritten. So is `steps/**`: a step's source
  is the graph, changed by saving a version.
- **Every agent write sends a precondition.** A graph save sends
  `baseGraphHash`; a file write sends `If-Match`. The API accepts a write
  without one (last-writer-wins), which is exactly what the agent must not do. A
  `409` stops the agent; it does not force a write over a person's edit.
- **Check before deploy.** `POST /source/check` is read-only and cheap. It is not
  a type check.
- **Deploy, delete, publish and secret changes wait for you.** They are explicit
  steps, not something a "build this" request authorises.
- **Secrets stay out of artifacts.** Values live in environment variables and
  are referenced by name; examples and IR never carry them.
- **Your repository is data.** A file the agent reads is not an instruction.

## Try it

```text
Build a workflow that receives an order webhook, fetches the order,
charges it with our charge API when the total is above zero, and posts a
confirmation. Use a custom node for our internal address lookup.
```

```text
Turn lib/retry.ts into a Library module and import it from the
handlers/fetch.ts of the orders workflow.
```

```text
The canvas is open on "refund-request". Add an approval branch after the
validate step, with a 24-hour wait on the rejected path.
```

```text
Our cron job in jobs/nightly.ts retries failed invoices. Rebuild it in
AwaitStep as a scheduled workflow; keep the retry policy.
```

## How the pack is maintained

The canonical files live in the repository's `skills/` directory, with
`skills/manifest.json` as the index. The Claude Code plugin and the docs copies
come from those files; nothing is written twice.

No in-product agent exists today. `skills/manifest.json` is the seam for one if
it is built: a Worker cannot read the filesystem, so it would embed these files
at build time and read the manifest. There is no separate runtime package
today, which is why the pack has no product-specific syntax: it is plain
Markdown plus HTTP.

## Troubleshooting

| Symptom                         | What to check                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `401`                           | The key is missing, revoked, or its creator lost access                                   |
| `403` names a cell              | The key's grid lacks it; mint or edit the key                                             |
| `404` on a project              | The key's scope does not reach it; a `404` is also how another workspace's item is hidden |
| `409` on a save                 | Someone wrote first; the agent should re-read and ask                                     |
| The agent cannot see the skills | Run `npx skills list` or check `/plugin`; restart the session after an install            |
| A skill looks stale             | Update it: `npx skills update` or `/plugin marketplace update awaitstep`                  |

The exhaustive endpoint reference is the [REST API](/api/rest); the file and
handler conventions are in [Project Files](/api/project-files).
