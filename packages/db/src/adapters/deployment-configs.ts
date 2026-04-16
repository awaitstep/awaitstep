import { eq, and } from 'drizzle-orm'
import type { DeploymentConfig } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class DeploymentConfigsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
  ) {}

  async get(workflowId: string, connectionId: string): Promise<DeploymentConfig | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.workflowId, workflowId), eq(this.table.connectionId, connectionId)))
      .limit(1)
    return rows[0] ?? null
  }

  async upsert(data: {
    id: string
    workflowId: string
    connectionId: string
    provider: string
    config: string
    updatedBy?: string
  }): Promise<DeploymentConfig> {
    const now = new Date().toISOString()
    const row: DeploymentConfig = {
      id: data.id,
      workflowId: data.workflowId,
      connectionId: data.connectionId,
      provider: data.provider,
      config: data.config,
      updatedAt: now,
      updatedBy: data.updatedBy ?? null,
    }
    await this.db
      .insert(this.table)
      .values(row)
      .onConflictDoUpdate({
        target: [this.table.workflowId, this.table.connectionId],
        set: {
          provider: data.provider,
          config: data.config,
          updatedAt: now,
          updatedBy: data.updatedBy ?? null,
        },
      })
    return row
  }

  async listByWorkflow(workflowId: string): Promise<DeploymentConfig[]> {
    return this.db.select().from(this.table).where(eq(this.table.workflowId, workflowId))
  }

  async delete(workflowId: string, connectionId: string): Promise<void> {
    await this.db
      .delete(this.table)
      .where(and(eq(this.table.workflowId, workflowId), eq(this.table.connectionId, connectionId)))
  }
}
