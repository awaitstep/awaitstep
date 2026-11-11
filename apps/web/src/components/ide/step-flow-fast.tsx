import { CornerDownRight } from 'lucide-react'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { getNodeVisuals } from '../../lib/node-icon-map'
import type { PlacementChoice } from '../../lib/ide/step-placements'
import type { FlowSide } from '../../lib/ide/step-flow-choices'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { FieldGroup, FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'

interface StepFlowFastProps {
  name: string
  error: string | null
  side: FlowSide
  fastChoice: PlacementChoice | undefined
  fastChoices: readonly PlacementChoice[]
  fileStem: string
  onNameChange: (name: string) => void
  onSideChange: (side: FlowSide) => void
  onAnchorChange: (choice: PlacementChoice) => void
  onOpenMap: () => void
}

/** The quick path: one name, after/before, one step. Branches live on the map. */
function StepNameInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  const { registry } = useNodeRegistry()
  const icon = getNodeVisuals('step', registry.get('step')?.icon).icon
  return (
    <div className="relative flex items-center">
      <span
        className="pointer-events-none absolute left-3 flex h-5 w-5 items-center justify-center rounded bg-node-code/15 text-node-code"
        aria-hidden
      >
        {icon}
      </span>
      <Input {...props} className={cn('h-9 pl-9 pr-10', className)} />
      <span className="pointer-events-none absolute right-3 text-xs text-muted-foreground">
        .ts
      </span>
    </div>
  )
}

export function StepFlowFast({
  name,
  error,
  side,
  fastChoice,
  fastChoices,
  fileStem,
  onNameChange,
  onSideChange,
  onAnchorChange,
  onOpenMap,
}: StepFlowFastProps) {
  const { registry } = useNodeRegistry()

  function iconOf(choice: PlacementChoice) {
    return getNodeVisuals(choice.nodeType ?? 'step', registry.get(choice.nodeType ?? 'step')?.icon)
      .icon
  }

  function handleNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    onNameChange(event.target.value)
  }

  function handleValueChange(value: string) {
    const choice = fastChoices.find((candidate) => candidate.nodeId === value)
    if (choice) onAnchorChange(choice)
  }

  return (
    <div className="space-y-4 px-5 pt-4">
      <FormField
        label={<span className="sr-only">Step name</span>}
        hint={`Saved as steps/${fileStem}.ts`}
        error={error}
      >
        <StepNameInput
          autoFocus
          aria-label="Step name"
          value={name}
          maxLength={256}
          onChange={handleNameChange}
          placeholder="notify_ops"
        />
      </FormField>

      <FieldGroup
        legend={
          <span className="text-3xs font-medium uppercase tracking-wider text-muted-foreground">
            Place it
          </span>
        }
      >
        <div className="space-y-2">
          <Tabs
            value={side}
            onValueChange={(value) => onSideChange(value as FlowSide)}
            aria-label="Place it"
          >
            <TabsList className="h-auto w-fit gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
              <TabsTrigger
                value="after"
                className="h-7 rounded border-0 px-3 text-xs capitalize data-[state=active]:border-0 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                After
              </TabsTrigger>
              <TabsTrigger
                value="before"
                className="h-7 rounded border-0 px-3 text-xs capitalize data-[state=active]:border-0 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                Before
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {fastChoice !== undefined ? (
            <Select
              id="step-anchor"
              aria-label="Place it"
              value={fastChoice.nodeId ?? ''}
              onValueChange={handleValueChange}
              options={fastChoices.map((choice) => ({
                value: choice.nodeId ?? '',
                label: choice.nodeName ?? choice.label,
                icon: iconOf(choice),
              }))}
            />
          ) : (
            <p className="rounded-md border border-border px-2.5 py-2 text-2xs text-muted-foreground">
              No step can take a new step on this side. Pick on the map instead.
            </p>
          )}
        </div>
      </FieldGroup>

      <Button
        type="button"
        variant="link"
        onClick={onOpenMap}
        className="h-auto justify-start gap-1.5 p-0 text-2xs text-primary"
      >
        <CornerDownRight className="h-3 w-3" />
        Into a branch? Pick on the map
      </Button>
    </div>
  )
}
