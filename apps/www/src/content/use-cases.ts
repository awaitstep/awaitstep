/**
 * The use cases page: one case per template category, told through the template the app ships
 * for it (`@awaitstep/templates`), so the page never promises a starting point the product does
 * not give you. Each "how it helps" point names a step that is in that template.
 */
import { templateCategories, workflowTemplates, type WorkflowTemplate } from '@awaitstep/templates'
import { layoutFlow, stepLabel, type FlowLayout } from './flow'
import { INTEGRATIONS } from './integrations'

export interface UseCasePoint {
  title: string
  line: string
}

/** A run of a point's line: plain text, or the name of a step in the template's drawing. */
export interface LineSegment {
  text: string
  step: boolean
}

export interface UseCasePointView {
  title: string
  segments: LineSegment[]
}

export interface UseCase {
  categoryId: string
  categoryName: string
  templateId: string
  name: string
  /** What the work is, and why it is awkward inside an app. */
  problem: string
  trigger: string
  points: UseCasePointView[]
  flow: FlowLayout
  /** The category's other templates, by name. */
  more: string[]
}

interface CaseCopy {
  templateId: string
  problem: string
  points: UseCasePoint[]
}

/** The case told for each category, and what it says. */
const CASES: Record<string, CaseCopy> = {
  billing: {
    templateId: 'failed-payment-recovery',
    problem:
      'A card fails. You email the customer, give them three days to pay, and downgrade them if they don’t. Inside your app that’s a scheduled job, a status column and a race with the next webhook.',
    points: [
      {
        title: 'Waits for the payment, not a server',
        line: 'Wait for payment holds the run until Stripe’s payment-succeeded event arrives, or three days pass.',
      },
      {
        title: 'Two endings, both on the canvas',
        line: 'The event path marks the payment recovered; the timeout path downgrades the account.',
      },
      {
        title: 'Every recovery on record',
        line: 'Each run has its own page: who paid, who was downgraded, and each step’s output.',
      },
    ],
  },
  onboarding: {
    templateId: 'new-user-onboarding',
    problem:
      'Welcome a new user now, check in tomorrow, then send tips to people who set up and a nudge to people who didn’t. Spread across a queue and a scheduler, that flow is hard to follow.',
    points: [
      {
        title: 'A day’s pause in one step',
        line: 'Wait one day sleeps the run for a day. Nothing polls; the run is stored while it waits.',
      },
      {
        title: 'The branch you can read',
        line: 'Is activated sends each user down one path: tips, or a nudge.',
      },
      {
        title: 'Change the copy in code',
        line: 'Each email is a step you can open in the code editor, typed, beside the canvas.',
      },
    ],
  },
  accounts: {
    templateId: 'tenant-provisioning',
    problem:
      'Setting up a customer’s workspace takes several writes across services. If one fails halfway, you are left with half a tenant and a cleanup script.',
    points: [
      {
        title: 'Try, then catch',
        line: 'Create workspace and Seed defaults run inside a try block. If either throws, Roll back runs.',
      },
      {
        title: 'Finished steps stay finished',
        line: 'When a step is retried, the steps before it don’t run again.',
      },
      {
        title: 'Then the welcome',
        line: 'Send welcome runs once the setup block is done.',
      },
    ],
  },
  integrations: {
    templateId: 'approval',
    problem:
      'A request needs someone’s yes. They might answer in a minute or in two days, and the request must not be lost in between.',
    points: [
      {
        title: 'Ask where people are',
        line: 'Ask for approval posts the request to Slack.',
      },
      {
        title: 'Wait up to two days',
        line: 'Wait for decision holds the run until the approval event, then Check decision goes ahead or rejects.',
      },
      {
        title: 'No silent expiry',
        line: 'If two days pass, Tell requester lets them know in Slack.',
      },
    ],
  },
  commerce: {
    templateId: 'abandoned-cart',
    problem:
      'Remind a shopper who leaves a cart, but never after they’ve bought. That takes a timer per cart that the purchase can cancel.',
    points: [
      {
        title: 'One timer per cart',
        line: 'Wait for purchase holds each cart’s run for up to two hours.',
      },
      {
        title: 'The purchase ends it',
        line: 'When cart-purchased arrives, the run takes the Purchased path and no reminder goes out.',
      },
      {
        title: 'Otherwise, a reminder',
        line: 'After two hours, Send reminder emails the shopper through Resend.',
      },
    ],
  },
}

const integrationNames = new Map(INTEGRATIONS.map((i) => [i.id, i.name]))

/**
 * Splits a line where it names one of the template's steps, so the page can set those names like
 * the nodes in the drawing. Longer names win ("Send reminder" before "Send").
 */
export function markSteps(line: string, stepNames: readonly string[]): LineSegment[] {
  const names = [...new Set(stepNames)].filter(Boolean).sort((a, b) => b.length - a.length)
  if (names.length === 0) return [{ text: line, step: false }]
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g')
  const segments: LineSegment[] = []
  let at = 0
  for (const match of line.matchAll(pattern)) {
    if (match.index > at) segments.push({ text: line.slice(at, match.index), step: false })
    segments.push({ text: match[0], step: true })
    at = match.index + match[0].length
  }
  if (at < line.length) segments.push({ text: line.slice(at), step: false })
  return segments
}

/** The sentence a template's IR gives for what starts it ("Runs when someone signs up."). */
function triggerOf(template: WorkflowTemplate): string {
  return template.ir.metadata.description ?? ''
}

export function buildUseCases(
  templates: readonly WorkflowTemplate[],
  categories: readonly { id: string; name: string }[],
  copy: Record<string, CaseCopy>,
): UseCase[] {
  return categories.flatMap((category) => {
    const c = copy[category.id]
    const template = c && templates.find((t) => t.id === c.templateId)
    if (!c || !template) return []
    return [
      {
        categoryId: category.id,
        categoryName: category.name,
        templateId: template.id,
        name: template.name,
        problem: c.problem,
        trigger: triggerOf(template),
        points: c.points.map((p) => ({
          title: p.title,
          segments: markSteps(
            p.line,
            template.ir.nodes.map((n) => stepLabel(n.name)),
          ),
        })),
        flow: layoutFlow(template.ir, integrationNames),
        more: templates
          .filter((t) => t.category === category.id && t.id !== template.id)
          .map((t) => t.name),
      },
    ]
  })
}

export const USE_CASES: UseCase[] = buildUseCases(workflowTemplates, templateCategories, CASES)

export const USE_CASES_PAGE = {
  title: 'Use cases for durable workflows | AwaitStep',
  description:
    'How AwaitStep runs failed payment recovery, onboarding, workspace setup, approvals and abandoned carts. Each one ships as a template.',
  heading: 'Use cases',
  line: 'The work your app hands off, and how AwaitStep runs it. Each one ships as a template.',
  pointsTitle: 'How AwaitStep handles it',
  // The app has no link that opens one template, so the button only says where to go.
  startLabel: 'Start building',
  moreLabel: 'Also in this category',
}

/** For tests: the copy the page tells, by category. */
export const CASE_COPY = CASES
