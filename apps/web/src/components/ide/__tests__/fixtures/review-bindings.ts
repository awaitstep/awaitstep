import { vi } from 'vitest'
import type { SourceFile } from '../../../../lib/api-client'
import type { ReviewBindings } from '../../review-bindings'

export function sourceFile(path: string, source: string, hash?: string): SourceFile {
  return { path, source, role: 'module', ...(hash !== undefined && { hash }) }
}

/** Review bindings with every action a spy; the files default to none. */
export function makeReviewBindings(overrides: Partial<ReviewBindings> = {}): ReviewBindings {
  return {
    workflowId: 'wf',
    files: new Map(),
    baseline: new Map(),
    canEdit: true,
    busy: false,
    editabilityOf: () => ({ readOnly: false, message: null }),
    onChange: vi.fn(),
    onRevert: vi.fn(),
    onSave: vi.fn().mockResolvedValue(true),
    onSaveAll: vi.fn(),
    onCompare: vi.fn(),
    onOverwrite: vi.fn().mockResolvedValue(true),
    onUseServerVersion: vi.fn(),
    onRecreate: vi.fn().mockResolvedValue(true),
    onDiscardDeleted: vi.fn(),
    ...overrides,
  }
}
