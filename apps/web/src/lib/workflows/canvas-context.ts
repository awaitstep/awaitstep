import { createServerFn } from '@tanstack/react-start'

/** Whether the server can run workflows locally (`ENABLE_LOCAL_DEV`), fixed for its lifetime. */
export const getCanvasContext = createServerFn({ method: 'GET' }).handler(async () => ({
  localDev: process.env['ENABLE_LOCAL_DEV'] === 'true',
}))
