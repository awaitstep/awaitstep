import { useEffect, useRef, type ComponentType } from 'react'
import { Copy, Files, Trash2, ClipboardPaste } from 'lucide-react'

export type ContextMenuAction = 'duplicate' | 'copy' | 'delete' | 'paste'

interface CanvasContextMenuProps {
  x: number
  y: number
  type: 'node' | 'pane'
  onAction: (action: ContextMenuAction) => void
  onClose: () => void
}

const isMac =
  typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform || '')
const mod = isMac ? '⌘' : 'Ctrl+'

export function CanvasContextMenu({ x, y, type, onAction, onClose }: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-[180px] rounded-md border border-border bg-card py-1 shadow-lg"
      onContextMenu={(e) => e.preventDefault()}
    >
      {type === 'node' ? (
        <>
          <MenuItem
            icon={Files}
            label="Duplicate"
            shortcut={`${mod}D`}
            onClick={() => onAction('duplicate')}
          />
          <MenuItem
            icon={Copy}
            label="Copy"
            shortcut={`${mod}C`}
            onClick={() => onAction('copy')}
          />
          <div className="my-1 h-px bg-border" />
          <MenuItem
            icon={Trash2}
            label="Delete"
            shortcut="⌫"
            destructive
            onClick={() => onAction('delete')}
          />
        </>
      ) : (
        <MenuItem
          icon={ClipboardPaste}
          label="Paste"
          shortcut={`${mod}V`}
          onClick={() => onAction('paste')}
        />
      )}
    </div>
  )
}

interface MenuItemProps {
  icon: ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  destructive?: boolean
  onClick: () => void
}

function MenuItem({ icon: Icon, label, shortcut, destructive, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60 ${
        destructive ? 'text-destructive' : 'text-foreground'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[10px] text-muted-foreground">{shortcut}</span>}
    </button>
  )
}
