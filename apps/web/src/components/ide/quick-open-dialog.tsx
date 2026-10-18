import { useMemo, useState } from 'react'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from 'cmdk'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useShallow } from 'zustand/react/shallow'
import { basename, dirname } from '../../lib/ide/file-tree'
import { rankFiles, splitHighlights, type RankedFile } from '../../lib/ide/quick-open'
import { useIdeStore } from '../../stores/ide-store'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { FileIcon } from './file-icon'

interface QuickOpenDialogProps {
  files: ReadonlyMap<string, GeneratedFile>
}

export function QuickOpenDialog({ files }: QuickOpenDialogProps) {
  const { open, closeDialog, openFile } = useIdeStore(
    useShallow((s) => ({
      open: s.dialog === 'quickOpen',
      closeDialog: s.closeDialog,
      openFile: s.openFile,
    })),
  )
  const [query, setQuery] = useState('')
  const paths = useMemo(() => [...files.keys()], [files])
  const results = useMemo(() => rankFiles(query, paths), [query, paths])

  function handleOpenChange(next: boolean) {
    if (next) return
    closeDialog()
    setQuery('')
  }

  function handleSelect(path: string) {
    openFile(path)
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="top-[20%] w-[560px] -translate-y-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Go to file</DialogTitle>
        <Command shouldFilter={false} loop className="flex flex-col">
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Go to file…"
            className="h-11 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground/50"
          />
          <CommandList className="max-h-[360px] overflow-y-auto p-1.5">
            <CommandEmpty className="px-3 py-6 text-center text-xs text-muted-foreground">
              No files match “{query}”
            </CommandEmpty>
            {results.map((result) => (
              <QuickOpenItem
                key={result.path}
                result={result}
                role={files.get(result.path)?.role ?? 'module'}
                onSelect={handleSelect}
              />
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function QuickOpenItem({
  result,
  role,
  onSelect,
}: {
  result: RankedFile
  role: GeneratedFile['role']
  onSelect: (path: string) => void
}) {
  const dir = dirname(result.path)
  const name = basename(result.path)
  const nameSegments = splitHighlights(name, result.positions, result.path.length - name.length)
  const dirSegments = splitHighlights(dir, result.positions, 0)

  function handleSelect() {
    onSelect(result.path)
  }

  return (
    <CommandItem
      value={result.path}
      onSelect={handleSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[selected=true]:bg-muted/70"
    >
      <FileIcon role={role} />
      <span className="min-w-0 truncate">
        <span className="text-foreground">
          <Highlighted segments={nameSegments} />
        </span>
        {dir && (
          <span className="ml-2 text-muted-foreground/60">
            <Highlighted segments={dirSegments} />
          </span>
        )}
      </span>
    </CommandItem>
  )
}

function Highlighted({ segments }: { segments: { text: string; hit: boolean }[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? (
          <span key={index} className="font-semibold text-primary">
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  )
}
