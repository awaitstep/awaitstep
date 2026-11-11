import { create } from 'zustand'

interface DeployDialogState {
  workflowId: string | null
  open: boolean
  openDeploy: (workflowId: string) => void
  closeDeploy: () => void
}

export const useDeployDialogStore = create<DeployDialogState>((set) => ({
  workflowId: null,
  open: false,
  openDeploy: (workflowId) => set({ workflowId, open: true }),
  closeDeploy: () => set({ open: false }),
}))
