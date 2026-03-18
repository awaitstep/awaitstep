import type { NodeDefinition } from '../node-definition.js'

export { stepDefinition } from './step.js'
export { sleepDefinition } from './sleep.js'
export { sleepUntilDefinition } from './sleep-until.js'
export { branchDefinition } from './branch.js'
export { parallelDefinition } from './parallel.js'
export { httpRequestDefinition } from './http-request.js'
export { waitForEventDefinition } from './wait-for-event.js'

import { stepDefinition } from './step.js'
import { sleepDefinition } from './sleep.js'
import { sleepUntilDefinition } from './sleep-until.js'
import { branchDefinition } from './branch.js'
import { parallelDefinition } from './parallel.js'
import { httpRequestDefinition } from './http-request.js'
import { waitForEventDefinition } from './wait-for-event.js'

export const bundledNodeDefinitions: NodeDefinition[] = [
  stepDefinition,
  sleepDefinition,
  sleepUntilDefinition,
  branchDefinition,
  parallelDefinition,
  httpRequestDefinition,
  waitForEventDefinition,
]
