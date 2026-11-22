import { describe, expect, it } from 'vitest'
import { generateWorkflowBundle } from '@awaitstep/provider-cloudflare'
import { workflowTemplates } from '../workflow-templates'
import { registryTemplate } from './fixtures/registry-nodes'

function template(id: string) {
  const found = workflowTemplates.find((t) => t.id === id)
  if (!found) throw new Error(`no template ${id}`)
  return found
}

function workflowSource(id: string): string {
  const { ir } = template(id)
  const bundle = generateWorkflowBundle(ir, {
    templateResolver: {
      getTemplate: (type) => {
        const node = ir.nodes.find((n) => n.type === type)
        return node ? registryTemplate(type, node.version) : undefined
      },
    },
  })
  return bundle.files.find((f) => f.path === 'awaitstep/workflow.ts')!.source
}

describe('template behaviour', () => {
  it('account deletion stops before the confirmation email when a deletion failed', () => {
    const { ir } = template('account-deletion')
    const after = ir.edges.find((e) => e.source === 'delete_everywhere' && e.label === 'then')
    const check = ir.nodes.find((n) => n.id === after?.target)
    expect(check?.type).toBe('step')
    expect(String(check?.data.code)).toMatch(
      /\bdelete_everywhere\.filter[\s\S]*rejected[\s\S]*throw/,
    )
    expect(ir.edges).toContainEqual(
      expect.objectContaining({ source: check!.id, target: 'send_confirmation' }),
    )
  })

  it('rolls a failed tenant back once, not once per retry', () => {
    expect(workflowSource('tenant-provisioning')).toMatch(
      /flow\.step\("roll_back \(roll_back\)", \{ retries: \{ limit: 0\b/,
    )
  })

  it('does not retry a webhook whose signature is wrong', () => {
    expect(workflowSource('inbound-webhook')).toMatch(
      /flow\.step\("verify_signature \(verify_signature\)", \{ retries: \{ limit: 0\b/,
    )
  })

  it('sends Stripe a stable identifier per usage record, so a retried loop does not bill twice', () => {
    expect(workflowSource('usage-sync')).toContain('identifier: record.id')
  })

  it('takes the approved arm from the event payload', () => {
    expect(workflowSource('approval')).toContain('wait_for_decision.payload.approved === true')
  })

  it.each(['failed-payment-recovery', 'trial-ending', 'order-fulfillment'])(
    '"%s" tells the user to verify the Stripe signature before starting it',
    (id) => {
      const first = template(id).ir.nodes[0]!
      expect(String(first.data.code)).toMatch(/TODO: check the Stripe-Signature header/)
    },
  )

  it('data export mails the looked-up email, not one from the payload, under a random key', () => {
    const source = workflowSource('data-export')
    expect(source).not.toMatch(/to: `?\$?\{?event\.payload\.email/)
    const build = template('data-export').ir.nodes.find((n) => n.id === 'build_export')!
    expect(String(build.data.code)).toContain('crypto.randomUUID()')
    expect(String(build.data.code)).not.toMatch(/exports\/\\\$\{event\.payload\.userId\}/)
  })

  it('outbound webhooks carry an id and timestamp that the signature covers', () => {
    const source = workflowSource('outbound-webhook')
    expect(source).toContain('"webhook-id": `${sign_payload.id}`')
    expect(source).toContain('"webhook-timestamp": `${sign_payload.timestamp}`')
    const sign = template('outbound-webhook').ir.nodes[0]!
    expect(String(sign.data.code)).toContain('${id}.${timestamp}.${body}')
  })

  it('inbound webhook refuses a request with no signature or no secret', () => {
    const verify = template('inbound-webhook').ir.nodes[0]!
    expect(String(verify.data.code)).toContain('if (!signature || !env.WEBHOOK_SECRET) throw')
  })

  it('encodes the Stripe meter-event form body', () => {
    expect(workflowSource('usage-sync')).toContain('body: new URLSearchParams({')
  })
})
