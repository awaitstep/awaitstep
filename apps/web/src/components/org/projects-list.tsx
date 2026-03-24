import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FolderKanban, Pencil, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { api } from '../../lib/api-client'
import { useOrgStore, type Project } from '../../stores/org-store'
import { useSheetStore } from '../../stores/sheet-store'
import { toast } from 'sonner'

function ProjectSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <div className="space-y-1.5">
        <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
        <div className="h-2 w-16 animate-pulse rounded bg-muted/40" />
      </div>
      <div className="flex gap-1">
        <div className="h-7 w-7 animate-pulse rounded bg-muted/40" />
        <div className="h-7 w-7 animate-pulse rounded bg-muted/40" />
      </div>
    </div>
  )
}

export function ProjectsList({ projects, loading }: { projects: Project[]; loading: boolean }) {
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const activeProjectId = useOrgStore((s) => s.activeProjectId)
  const { openProjectDialog } = useSheetStore()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['projects', useOrgStore.getState().activeOrganizationId],
      })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      toast.success('Project deleted')
      setDeleteTarget(null)
    },
    onError: (err) => toast.error(err.message),
  })

  function handleConfirmDelete() {
    if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
  }

  function handleDeleteOpenChange(open: boolean) {
    if (!open) setDeleteTarget(null)
  }

  return (
    <section className="rounded-md border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban size={14} className="text-muted-foreground/60" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Projects
          </h2>
        </div>
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => openProjectDialog()}>
          <Plus className="h-3 w-3" />
          New project
        </Button>
      </div>

      <div className="mt-3 space-y-1.5">
        {loading ? (
          <>
            <ProjectSkeleton />
            <ProjectSkeleton />
          </>
        ) : projects.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            This org has no projects.
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{project.name}</span>
                  {project.id === activeProjectId && (
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Active
                    </span>
                  )}
                </div>
                {project.description && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                    {project.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => openProjectDialog(project)}
                >
                  <Pencil size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(project)}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={handleDeleteOpenChange}
        title="Delete project"
        description={`This will permanently delete "${deleteTarget?.name}" and all its workflows. This cannot be undone.`}
        confirmLabel="Delete project"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </section>
  )
}
