import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api-client'
import { missingLibraryNode, missingNodeMessage } from '../missing-node'

const NODES = [
  { id: 'entry', type: 'step', name: 'Entry' },
  { id: 'say_hello', type: 'custom:DlCLYH8m7inqK9ZYDUjRM', name: 'Say Hello' },
]

function sourceError(diagnostics: { source: string; message: string; nodeId?: string }[]) {
  return new ApiError('Bundle validation failed: Codegen not yet implemented', 422, {
    diagnostics,
  })
}

describe('missingLibraryNode', () => {
  it('names the custom node a library finding points at', () => {
    const error = sourceError([
      { source: 'library', message: 'Unknown custom node', nodeId: 'say_hello' },
      { source: 'provider', message: 'Codegen not yet implemented' },
    ])
    expect(missingLibraryNode(error, NODES)).toEqual({
      nodeId: 'say_hello',
      name: 'Say Hello',
      reason: 'Unknown custom node',
    })
  })

  it('keeps the API’s reason, which says whether the node is unreachable, unpublished or broken', () => {
    const unpublished = 'Custom node "Say Hello" has no published version yet; publish it to use it'
    const error = sourceError([{ source: 'library', message: unpublished, nodeId: 'say_hello' }])
    const node = missingLibraryNode(error, NODES)!
    expect(missingNodeMessage(node)).toBe(`Code can’t open because of “Say Hello”: ${unpublished}`)
  })

  it('ignores a library finding about a node that is not a custom node', () => {
    const error = sourceError([{ source: 'library', message: 'Unknown module', nodeId: 'entry' }])
    expect(missingLibraryNode(error, NODES)).toBeNull()
  })

  it('ignores findings from elsewhere, a node not in the graph, and other errors', () => {
    expect(
      missingLibraryNode(
        sourceError([{ source: 'provider', message: 'x', nodeId: 'say_hello' }]),
        NODES,
      ),
    ).toBeNull()
    expect(
      missingLibraryNode(sourceError([{ source: 'library', message: 'x', nodeId: 'gone' }]), NODES),
    ).toBeNull()
    expect(missingLibraryNode(new Error('network'), NODES)).toBeNull()
    expect(missingLibraryNode(sourceError([]), undefined)).toBeNull()
  })
})
