import type { SearchFile } from '../../../ide/search'

/** The fixture the plan's acceptance criteria name: Charge / chargeOrder / charge. */
export const CHARGE_FILES: SearchFile[] = [
  {
    path: 'lib/payments/charge.ts',
    generated: false,
    source: [
      'export async function chargeOrder(env: Env, input: Input) {',
      '  const Charge = await env.charge(input)',
      '  return Charge',
      '}',
      'export const retry = () => chargeOrder(env, retryInput)',
    ].join('\n'),
  },
  {
    path: 'lib/errors.ts',
    generated: false,
    source: '// thrown by chargeOrder on decline\r\nexport class Decline extends Error {}\r\n',
  },
  { path: 'lib/empty.ts', generated: false, source: '' },
  {
    path: 'worker.ts',
    generated: true,
    source: 'import { chargeOrder } from "#app/lib/payments/charge"\nchargeOrder()\n',
  },
]

export const IMPORT_FILES: SearchFile[] = [
  { path: 'lib/payments/refund.ts', generated: false, source: 'export const refund = 1\n' },
  {
    path: 'handlers/refund_order.ts',
    generated: false,
    source: "import { refund } from '#app/lib/payments/refund'\n",
  },
  {
    path: 'handlers/cancel.ts',
    generated: false,
    source: 'const m = await import("#app/lib/payments/refund")\n',
  },
  {
    path: 'lib/retry.ts',
    generated: false,
    source: "import { refund } from '#app/lib/payments/refund.js'\n",
  },
  {
    path: 'lib/other.ts',
    generated: false,
    source: "import { refunds } from '#app/lib/payments/refunds'\n",
  },
  {
    path: 'worker.ts',
    generated: true,
    source: "import { refund } from '#app/lib/payments/refund'\n",
  },
]
