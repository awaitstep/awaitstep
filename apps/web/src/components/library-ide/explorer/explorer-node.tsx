import { dirname, type TreeNode } from '../../../lib/ide/file-tree'
import { CreateRow } from '../../ide/file-explorer-create'
import { RenameRow } from '../../ide/file-explorer-rename'
import { ExplorerLine, fileIconOf } from './explorer-line'
import { fileMenu, folderMenu, type MenuContext } from './explorer-menus'

export interface TreeContext extends MenuContext {
  dirty: ReadonlySet<string>
  activePath: string | null
  openFile: (path: string) => void
}

/** The new-file row in `folder`, while one is being named there. */
export function CreateRowIn({
  folder,
  depth,
  ctx,
}: {
  folder: string
  depth: number
  ctx: TreeContext
}) {
  const { editing } = ctx.state
  if (editing?.kind !== 'create' || editing.folder !== folder) return null
  return (
    <CreateRow
      mode="file"
      target={folder}
      existing={[]}
      relative
      validate={ctx.state.refusalIn(folder)}
      depth={depth}
      onSubmit={ctx.state.submitCreate}
      onCancel={ctx.state.stopEditing}
    />
  )
}

/** A file or folder inside an item, with its menu; a file being renamed is its name field. */
export function ExplorerNode({
  node,
  depth,
  ctx,
}: {
  node: TreeNode
  depth: number
  ctx: TreeContext
}) {
  const { index, state } = ctx
  if (node.kind === 'file') {
    const readOnly = index.files.get(node.path)?.readOnly ?? false
    if (state.editing?.kind === 'rename' && state.editing.path === node.path) {
      const folder = dirname(node.path)
      return (
        <RenameRow
          path={node.path}
          role="module"
          existing={[]}
          scope={folder}
          validate={state.refusalIn(folder)}
          depth={depth}
          onSubmit={(to) => state.submitRename(node.path, to)}
          onCancel={state.stopEditing}
        />
      )
    }
    return (
      <ExplorerLine
        label={node.name}
        depth={depth}
        active={ctx.activePath === node.path}
        dirty={ctx.dirty.has(node.path)}
        muted={readOnly}
        title={readOnly ? 'Published: read-only' : undefined}
        icon={fileIconOf(node)}
        menu={fileMenu(node.path, ctx)}
        onClick={() => ctx.openFile(node.path)}
      />
    )
  }
  const open = state.isOpen(node.path)
  const readOnly = node.children.every(
    (child) => child.kind === 'file' && (index.files.get(child.path)?.readOnly ?? false),
  )
  return (
    <div>
      <ExplorerLine
        label={node.name}
        depth={depth}
        open={open}
        muted={readOnly}
        title={readOnly ? 'Published: read-only' : undefined}
        menu={folderMenu(node.path, readOnly, ctx)}
        onClick={() => state.toggle(node.path)}
      />
      {open && <CreateRowIn folder={node.path} depth={depth + 1} ctx={ctx} />}
      {open &&
        node.children.map((child) => (
          <ExplorerNode key={child.path} node={child} depth={depth + 1} ctx={ctx} />
        ))}
    </div>
  )
}
