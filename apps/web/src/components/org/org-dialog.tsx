import * as Dialog from '@radix-ui/react-dialog'
import { authError } from '../../data/dashboard/errors'
import { Loader2, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { actionToast, failureLine } from '../../lib/action-toast'
import { authClient } from '../../lib/auth-client'
import { slugify } from '@awaitstep/ir'
import { useSheetStore } from '../../stores/sheet-store'
import { useOrgStore } from '../../stores/org-store'
import { cn } from '../../lib/utils'

const orgSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(255),
})
type OrgFormValues = z.infer<typeof orgSchema>

interface OrgDialogProps {
  hasOrgs?: boolean
}

export function OrgDialog({ hasOrgs }: OrgDialogProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: '' },
  })

  const { addOrganization } = useOrgStore()
  const { closeOrgDialog } = useSheetStore()
  const mutation = useMutation({
    meta: {
      toast: {
        // Your first organization reloads the app; the toast waits for the new page.
        success: hasOrgs ? 'Organization created' : null,
        error: 'Couldn’t create the organization',
      },
    },
    mutationFn: async (values: OrgFormValues) => {
      const res = await authClient.organization.create({
        name: values.name.trim(),
        slug: slugify(values.name, 'org'),
      })
      if (res.error) throw authError(res.error, 'Could not create the organization')
      return res.data
    },
    onSuccess: (newOrg) => {
      addOrganization(newOrg)
      closeOrgDialog()
      if (!hasOrgs) {
        actionToast.successAfterReload('Organization created')
        window.location.reload()
      }
    },
    onError: (err) => {
      setError('root', {
        message: failureLine(err, 'Couldn’t create the organization'),
      })
    },
  })

  function handleOpenChange(openState: boolean) {
    if (!openState && hasOrgs) closeOrgDialog()
  }

  function handleInteractOutside(e: Event) {
    if (!hasOrgs) {
      e.preventDefault()
    }
  }

  return (
    <Dialog.Root defaultOpen onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          onEscapeKeyDown={handleInteractOutside}
          onInteractOutside={handleInteractOutside}
          className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg"
        >
          <Dialog.Title className="text-base font-semibold">New Organization</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Create a new organization for your team.
          </Dialog.Description>
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-4 space-y-4">
            <div>
              <Label className="text-xs">Organization name</Label>
              <Input {...register('name')} placeholder="Acme Inc." className="mt-1" autoFocus />
              {errors.name && (
                <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            {errors.root && <p className="text-xs text-destructive">{errors.root.message}</p>}
            <div className="flex justify-end gap-2">
              {hasOrgs && (
                <Dialog.Close asChild>
                  <Button variant="ghost">Cancel</Button>
                </Dialog.Close>
              )}
              <Button
                className={cn(!hasOrgs && 'w-full')}
                type="submit"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Create
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
