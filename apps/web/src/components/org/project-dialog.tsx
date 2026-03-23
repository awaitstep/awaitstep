import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import { api } from '../../lib/api-client'
import { slugify } from '../../lib/slug'
import { useSheetStore } from '../../stores/sheet-store'
import { useOrgStore } from '../../stores/org-store'
import { toast } from 'sonner'

const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255),
  description: z.string().max(1000).optional(),
})

type ProjectFormValues = z.infer<typeof projectSchema>

interface ProjectDialogProps {
  preventClose?: boolean
}
export function ProjectDialog({ preventClose }: ProjectDialogProps) {
  const queryClient = useQueryClient()
  const projectDialog = useSheetStore((s) => s.projectDialog)
  const closeProjectDialog = useSheetStore((s) => s.closeProjectDialog)

  const editProject = projectDialog !== null && projectDialog !== 'new' ? projectDialog : null
  const isEdit = !!editProject

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: '', description: '' },
  })


  const mutation = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      if (isEdit) {
        return api.updateProject(editProject.id, {
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
        })
      }
      return api.createProject({
        name: values.name.trim(),
        slug: slugify(values.name),
        description: values.description?.trim() || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', useOrgStore.getState().activeOrganizationId] })
      closeProjectDialog()
      toast.success(isEdit ? 'Project updated' : 'Project created')
    },
    onError: (err) => {
      setError('root', {
        message: err instanceof Error ? err.message : `Failed to ${isEdit ? 'update' : 'create'} project`,
      })
    },
  })

  function handleOpenChange(openState: boolean) {
    if (!openState && !preventClose) closeProjectDialog()
  }

  function handleInteractOutside(e: Event) {
    if (preventClose) {
      e.preventDefault()
    }
  }

  return (
    <Dialog.Root defaultOpen onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content onInteractOutside={handleInteractOutside} className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">{isEdit ? 'Edit Project' : 'New Project'}</Dialog.Title>
          {!isEdit && (
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Create a new project to organize your workflows.
            </Dialog.Description>
          )}
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-4 space-y-4">
            <div>
              <Label className="text-xs">Project name</Label>
              <Input {...register('name')} placeholder="My Project" className="mt-1" autoFocus />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div>
              <Label className="text-xs">Description <span className="text-muted-foreground/60">(optional)</span></Label>
              <Textarea {...register('description')} placeholder="What's this project for?" className="mt-1 min-h-[60px]" />
              {errors.description && <p className="mt-1 text-xs text-destructive">{errors.description.message}</p>}
            </div>
            {errors.root && <p className="text-xs text-destructive">{errors.root.message}</p>}
            <div className="flex justify-end gap-2">
              {!preventClose && (
                <Dialog.Close asChild>
                  <Button variant="ghost" size="sm">Cancel</Button>
                </Dialog.Close>
              )}
              <Button size="sm" disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : isEdit ? null : <Plus size={14} />}
                {isEdit ? 'Save' : 'Create'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
