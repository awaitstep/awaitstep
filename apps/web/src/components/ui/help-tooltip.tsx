import { Info } from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'

interface HelpTooltipProps {
  title: string
  description: string
  learnMoreUrl?: string
}

export function HelpTooltip({ title, description, learnMoreUrl }: HelpTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
          >
            <Info size={14} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            className="z-50 max-w-xs rounded-lg border border-border bg-card p-3 shadow-lg"
          >
            <p className="text-xs font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            {learnMoreUrl && (
              <a
                href={learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-primary hover:text-primary/80"
              >
                Learn more &rarr;
              </a>
            )}
            <Tooltip.Arrow className="fill-card" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
