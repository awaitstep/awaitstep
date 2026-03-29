import type { NodeDefinition } from '../node-definition.js'

export { stepDefinition } from './step.js'
export { sleepDefinition } from './sleep.js'
export { sleepUntilDefinition } from './sleep-until.js'
export { branchDefinition } from './branch.js'
export { parallelDefinition } from './parallel.js'
export { httpRequestDefinition } from './http-request.js'
export { waitForEventDefinition } from './wait-for-event.js'
export { tryCatchDefinition } from './try-catch.js'
export { loopDefinition } from './loop.js'
export { breakDefinition } from './break.js'
export { subWorkflowDefinition } from './sub-workflow.js'
export { raceDefinition } from './race.js'

import { stepDefinition } from './step.js'
import { sleepDefinition } from './sleep.js'
import { sleepUntilDefinition } from './sleep-until.js'
import { branchDefinition } from './branch.js'
import { parallelDefinition } from './parallel.js'
import { httpRequestDefinition } from './http-request.js'
import { waitForEventDefinition } from './wait-for-event.js'
import { tryCatchDefinition } from './try-catch.js'
import { loopDefinition } from './loop.js'
import { breakDefinition } from './break.js'
import { subWorkflowDefinition } from './sub-workflow.js'
import { raceDefinition } from './race.js'

export const bundledNodeDefinitions: NodeDefinition[] = [
  stepDefinition,
  sleepDefinition,
  sleepUntilDefinition,
  branchDefinition,
  parallelDefinition,
  httpRequestDefinition,
  waitForEventDefinition,
  tryCatchDefinition,
  loopDefinition,
  breakDefinition,
  subWorkflowDefinition,
  raceDefinition,
]
