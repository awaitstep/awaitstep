import type { SourceMode } from '@awaitstep/codegen'
import type { WorkflowSourceMode } from '@awaitstep/db'

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

/**
 * @awaitstep/db is standalone and declares its own persistence union for a
 * version's source mode; @awaitstep/codegen declares the contract the API
 * and web share. The API is the one place both packages meet, so this pins
 * the two unions to each other: adding a mode to one without the other fails
 * type-check here instead of surfacing at runtime in the web.
 */
export const sourceModesAligned: MutuallyAssignable<SourceMode, WorkflowSourceMode> = true
