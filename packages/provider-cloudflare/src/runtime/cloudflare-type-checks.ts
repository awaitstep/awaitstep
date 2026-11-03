/**
 * Compile-time checks for the Cloudflare primitive signatures. Nothing here
 * is called; the provider package's `type-check` fails if the accessors stop
 * accepting an `interface Env` (which has no index signature — the generated
 * `Env` is exactly that shape).
 */
import { binding, kv, service, workflow } from './cloudflare.js'

interface Kvish {
  get(key: string): Promise<unknown>
}
interface Jobish {
  create(): Promise<void>
}
interface Serviceish {
  fetch(input: string): Promise<unknown>
}
interface Env {
  JOB: Jobish
  USERS: Kvish
  MAIL: Serviceish
}

const env = {} as Env

const job: Jobish = workflow(env, 'JOB')
const users: Kvish = kv(env, 'USERS')
const mail: Serviceish = service(env, 'MAIL')
const anyBinding: Kvish = binding(env, 'USERS')
const jobs: Jobish = binding(env, 'JOB')

// Every accessor must accept the same interface-shaped Env.
void [job, users, mail, anyBinding, jobs]
