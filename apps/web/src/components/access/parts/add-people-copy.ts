import type { AddPeopleOutcome } from '../../../types/dashboard/access'
import type { PoolPerson } from './people-pool'

// The words of the Add people dialogs (21a, 21b), from the boards' logic.

/** One pick: someone in the org, or a new address to invite. */
export type Pick = { kind: 'person'; entry: PoolPerson } | { kind: 'email'; email: string }

export function pickKey(pick: Pick): string {
  return pick.kind === 'person' ? pick.entry.person.id : pick.email
}

export function pickName(pick: Pick): string {
  return pick.kind === 'person' ? pick.entry.person.name || pick.entry.person.email : pick.email
}

function firstName(pick: Pick): string {
  return pickName(pick).split(' ')[0]!
}

function andList(words: string[]): string {
  return words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

export interface AddPeopleContext {
  /** `project`: 21a, from a project's Members page; `workspace`: 21b. */
  kind: 'project' | 'workspace'
  orgName: string
  projectName: string
  /** "Editor", "Project admin". */
  roleLabel: string
  /** Where they get it: "Sales", "Sales and IT", "the whole of Project 101". */
  where: string
}

/** The note under the role: what adding these picks will do, before it's done. */
export function summaryText(picks: Pick[], ctx: AddPeopleContext): string {
  if (picks.length === 0) {
    return ctx.kind === 'project'
      ? 'Pick someone above. Anyone you add can open only what you choose here. Their other access doesn’t change.'
      : 'Pick someone above. Adding a person here never changes what they can see in other workspaces.'
  }
  const n = picks.length
  const bits = [`${n} ${n === 1 ? 'person gets' : 'people get'} ${ctx.roleLabel} in ${ctx.where}.`]
  const joiners = picks.filter((p) => p.kind === 'person' && p.entry.joins)
  if (ctx.kind === 'workspace' && joiners.length > 0) {
    // A workspace grant is what brings them into the project: no project role is given.
    bits.push(
      `${andList(joiners.map(firstName))} ${joiners.length === 1 ? 'isn’t' : 'aren’t'} in ${ctx.projectName} yet, so this brings them in with ${ctx.where} only.`,
    )
  }
  const newcomers = picks.filter((p) => p.kind === 'email')
  if (newcomers.length > 0) {
    bits.push(
      `${andList(newcomers.map(pickName))} ${newcomers.length === 1 ? 'is' : 'are'} new to ${ctx.orgName} and ${newcomers.length === 1 ? 'joins' : 'join'} as a Member once the invite is accepted, with nothing beyond this.`,
    )
  }
  return bits.join(' ')
}

/** "Add 2 people", "Send invite"; "Add people" with nothing picked. */
export function submitLabel(picks: Pick[]): string {
  const n = picks.length
  if (n === 0) return 'Add people'
  if (picks.every((p) => p.kind === 'email')) return n === 1 ? 'Send invite' : `Send ${n} invites`
  return `Add ${n} ${n === 1 ? 'person' : 'people'}`
}

/**
 * Where the people added can now work: what the server granted when it
 * says (it skips workspaces someone already has), the same for everyone, or
 * "what each row says" when it differs from person to person.
 */
function grantedWhere(outcomes: AddPeopleOutcome[], ctx: AddPeopleContext): string {
  const lists = outcomes
    .filter((o) => o.result === 'added' && o.workspaces)
    .map((o) => andList(o.workspaces!))
  if (lists.length === 0) return ctx.where
  const added = outcomes.filter((o) => o.result === 'added').length
  return lists.length === added && lists.every((list) => list === lists[0])
    ? lists[0]!
    : 'what each row below says'
}

export interface DoneCopy {
  title: string
  body: string
}

/** The done state's heading and line, from how each pick went. */
export function doneCopy(outcomes: AddPeopleOutcome[], ctx: AddPeopleContext): DoneCopy {
  const where = grantedWhere(outcomes, ctx)
  const added = outcomes.filter((o) => o.result === 'added').length
  const invited = outcomes.filter((o) => o.result === 'invited').length
  let title: string
  if (added === 0) title = invited === 1 ? 'Invite sent' : 'Invites sent'
  else if (invited > 0)
    title = invited === 1 ? 'Added, and one invite sent' : 'Added, and invites sent'
  else title = added === 1 ? 'Added' : `Added ${added} people`
  let body: string
  if (added === 0) body = `Anyone invited gets ${where} the moment they accept.`
  else if (invited > 0) {
    body = `People already in ${ctx.orgName} can open ${where} now. Anyone invited gets access the moment they accept.`
  } else body = `They can open ${where} now. Change any of it from Edit access.`
  return { title, body }
}

/** Under each name in the done list: what they got, the invite, or why it didn't go through. */
export function doneLine(outcome: AddPeopleOutcome, ctx: AddPeopleContext): string {
  if (outcome.result === 'added') {
    const where = outcome.workspaces ? andList(outcome.workspaces) : ctx.where
    return `${ctx.roleLabel} in ${where}`
  }
  if (outcome.result === 'invited') return 'Invite sent · expires in 7 days'
  return outcome.error ?? 'Not added'
}
