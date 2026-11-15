import { NodeSettingsPanel, type NodeWriter } from '../canvas/node-config-panel'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/sheet'

interface NodeSettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeId: string
  nodeName: string
  readOnly: boolean
  writer: NodeWriter
}

/**
 * The canvas's node panel, as Code opens it from a node's details: the same
 * header, fields, arms and branches, beside the code. Each change is a
 * pending edit, written with the workspace's Save.
 */
export function NodeSettingsSheet({
  open,
  onOpenChange,
  nodeId,
  nodeName,
  readOnly,
  writer,
}: NodeSettingsSheetProps) {
  function handleClose() {
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" layout="sectioned">
        <SheetTitle className="sr-only">{nodeName} settings</SheetTitle>
        <SheetDescription className="sr-only">
          {readOnly ? 'Read-only.' : 'Changes wait for Save.'}
        </SheetDescription>
        <NodeSettingsPanel
          nodeId={nodeId}
          readOnly={readOnly}
          writer={writer}
          onClose={handleClose}
        />
      </SheetContent>
    </Sheet>
  )
}
