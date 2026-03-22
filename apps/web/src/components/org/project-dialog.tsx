import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import { api } from '../../lib/api-client'
import { slugify } from '../../lib/slug'
import { useSheetStore } from '../../stores/sheet-store'
import { useOrgStore, type Project } from '../../stores/org-store'
import { toast } from 'sonner'

export function ProjectDialog() {
  const projectDialog = useSheetStore((s) => s.projectDialog)
  const closeProjectDialog = useSheetStore((s) => s.closeProjectDialog)
  const projects = useOrgStore((s) => s.projects)
  const setProjects = useOrgStore((s) => s.setProjects)
  const setActiveProject = useOrgStore((s) => s.setActiveProject)

  const open = projectDialog !== null
  const editProject = projectDialog !== null && projectDialog !== 'new' ? projectDialog : null
  const isEdit = !!editProject

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(editProject?.name ?? '')
      setDescription(editProject?.description ?? '')
      setError(null)
    }
  }, [open, editProject])

  function handleOpenChange(openState: boolean) {
    if (!openState) closeProjectDialog()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      let result: Project
      if (isEdit) {
        result = await api.updateProject(editProject.id, { name: name.trim(), description: description.trim() || undefined })
        setProjects(projects.map((p) => p.id === result.id ? result : p))
      } else {
        const slug = slugify(name)
        result = await api.createProject({ name: name.trim(), slug, description: description.trim() || undefined })
        const updated = [...projects, result]
        setProjects(updated)
        if (updated.length === 1) setActiveProject(result.id)
      }
      closeProjectDialog()
      toast.success(isEdit ? 'Project updated' : 'Project created')
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${isEdit ? 'update' : 'create'} project`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">{isEdit ? 'Edit Project' : 'New Project'}</Dialog.Title>
          {!isEdit && (
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Create a new project to organize your workflows.
            </Dialog.Description>
          )}
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <Label className="text-xs">Project name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Project" className="mt-1" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Description <span className="text-muted-foreground/60">(optional)</span></Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this project for?" className="mt-1 min-h-[60px]" />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm">Cancel</Button>
              </Dialog.Close>
              <Button size="sm" disabled={!name.trim() || loading}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : isEdit ? null : <Plus size={14} />}
                {isEdit ? 'Save' : 'Create'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
