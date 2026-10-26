import { Fragment, useId, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { FieldGroup } from './form-field'
import { hasContent } from './has-content'

const CARD_CLASS =
  'flex cursor-pointer gap-3 rounded-xl border px-4 py-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring'

function cardTone(picked: boolean): string {
  return picked
    ? 'border-primary bg-primary/5'
    : 'border-input bg-background hover:border-foreground/25'
}

const CONTROL_CLASS = 'mt-0.5 size-4 shrink-0 cursor-pointer accent-primary'

export interface RadioCardOption<Value extends string> {
  value: Value
  title: string
  description?: ReactNode
  /** A dot or icon before the title. Decorative. */
  leading?: ReactNode
}

interface RadioCardGroupProps<Value extends string> {
  legend: ReactNode
  value: Value
  onChange: (value: Value) => void
  options: RadioCardOption<Value>[]
  /** `stack`: one card per line. `grid`: side by side from `sm` up. */
  layout?: 'stack' | 'grid'
  /**
   * More controls for the picked option, e.g. the people picked under "Choose
   * people now". Shown under its card (stack) or under the row (grid).
   */
  renderExtra?: (value: Value) => ReactNode
}

/** One-of-several choice drawn as cards, each with a title and a line of detail. */
export function RadioCardGroup<Value extends string>({
  legend,
  value,
  onChange,
  options,
  layout = 'stack',
  renderExtra,
}: RadioCardGroupProps<Value>) {
  const name = useId()
  const extra = renderExtra?.(value)
  const grid = layout === 'grid'

  const cards = options.map((option) => {
    const picked = option.value === value
    const titleId = `${name}-${option.value}-title`
    const descriptionId = `${name}-${option.value}-description`
    const hasDescription = hasContent(option.description)
    const card = (
      <label
        className={cn(CARD_CLASS, cardTone(picked), grid ? 'flex-col gap-1.5' : 'items-start')}
      >
        <span className="flex items-center gap-2.5">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={picked}
            onChange={() => onChange(option.value)}
            aria-labelledby={titleId}
            aria-describedby={hasDescription ? descriptionId : undefined}
            className={cn(CONTROL_CLASS, grid && 'mt-0')}
          />
          {grid && option.leading}
          {grid && (
            <span id={titleId} className="text-sm font-medium text-foreground">
              {option.title}
            </span>
          )}
        </span>
        {grid ? (
          hasDescription && (
            <span id={descriptionId} className="text-2xs text-muted-foreground">
              {option.description}
            </span>
          )
        ) : (
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              {option.leading}
              <span id={titleId} className="text-sm font-medium text-foreground">
                {option.title}
              </span>
            </span>
            {hasDescription && (
              <span id={descriptionId} className="text-2xs text-muted-foreground">
                {option.description}
              </span>
            )}
          </span>
        )}
      </label>
    )
    return (
      <Fragment key={option.value}>
        {card}
        {!grid && picked && hasContent(extra) && <div className="pl-7">{extra}</div>}
      </Fragment>
    )
  })

  return (
    <FieldGroup legend={legend}>
      {grid ? (
        <div className="grid grid-cols-1 gap-2 sm:auto-cols-fr sm:grid-flow-col">{cards}</div>
      ) : (
        <div className="flex flex-col gap-2">{cards}</div>
      )}
      {grid && hasContent(extra) && extra}
    </FieldGroup>
  )
}

interface CheckboxCardProps {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  description?: ReactNode
}

/** A single on/off choice with a line of detail, e.g. "Secret". */
export function CheckboxCard({ checked, onChange, title, description }: CheckboxCardProps) {
  const id = useId()
  const hasDescription = hasContent(description)
  return (
    <label className={cn(CARD_CLASS, cardTone(checked), 'items-start')}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-labelledby={`${id}-title`}
        aria-describedby={hasDescription ? `${id}-description` : undefined}
        className={CONTROL_CLASS}
      />
      <span className="flex flex-col gap-0.5">
        <span id={`${id}-title`} className="text-sm font-medium text-foreground">
          {title}
        </span>
        {hasDescription && (
          <span id={`${id}-description`} className="text-2xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  )
}
