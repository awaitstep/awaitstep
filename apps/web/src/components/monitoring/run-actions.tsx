import { Pause, Play, Square } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { api } from '../../lib/api-client'

interface RunActionsProps {
  workflowId: string
  runId: string
  status: string
}

export function RunActions({ workflowId, runId, status }: RunActionsProps) {
  const queryClient = useQueryClient()

  const actionMutation = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'terminate') =>
      api.controlWorkflowRun(workflowId, runId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-run', workflowId, runId] })
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['all-runs'] })
    },
  })

  const isPaused = status === 'paused'

  function handlePauseResume() {
    actionMutation.mutate(isPaused ? 'resume' : 'pause')
  }

  function handleTerminate() {
    actionMutation.mutate('terminate')
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={handlePauseResume}
      >
        {isPaused ? (
          <>
            <Play className="h-3.5 w-3.5" /> Resume
          </>
        ) : (
          <>
            <Pause className="h-3.5 w-3.5" /> Pause
          </>
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-status-error/60 hover:text-status-error"
        onClick={handleTerminate}
      >
        <Square className="h-3.5 w-3.5" /> Terminate
      </Button>
    </div>
  )
}
