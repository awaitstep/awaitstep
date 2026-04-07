import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { useAuthStore } from '../../stores/auth-store'
import { authClient } from '../../lib/auth-client'
import { formatMonthYear } from '../../lib/time'

export function ProfileSection({
  user,
}: {
  user: { name: string; email: string; createdAt: Date }
}) {
  const [name, setName] = useState(user.name)
  const setSession = useAuthStore((s) => s.setSession)

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.updateUser({ name })
      if (res.error) throw new Error(res.error.message)
      return res
    },
    onSuccess: async () => {
      const session = await authClient.getSession()
      if (session.data) setSession(session.data)
    },
  })

  const memberSince = formatMonthYear(user.createdAt)

  return (
    <section className="rounded-md border border-border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        Profile
      </h2>

      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary/50"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Email</label>
          <input
            type="email"
            value={user.email}
            disabled
            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm text-muted-foreground"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground/60">Member since {memberSince}</p>
        <Button
          size="sm"
          disabled={name === user.name || !name.trim() || updateMutation.isPending}
          onClick={() => updateMutation.mutate()}
        >
          {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Update
        </Button>
      </div>
    </section>
  )
}
