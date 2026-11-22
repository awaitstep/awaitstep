import type { WorkflowTemplate } from './types.js'
import { edge, parallel, sendEmail, sleep, step, tryCatch, workflow } from './template-nodes.js'

const accountDeletion: WorkflowTemplate = {
  id: 'account-deletion',
  name: 'Account deletion',
  description: 'Delete a user’s data from each service at once, then confirm by email.',
  icon: 'user-x',
  category: 'accounts',
  ir: workflow(
    'Account deletion',
    'Runs when a user asks to delete their account.',
    [
      parallel('delete_everywhere', [300, 0]),
      step(
        'delete_app_data',
        [150, 120],
        `  // Start this only from your signed-in app: it deletes whoever the payload names.
  // TODO: delete the user's rows from your database.
  return { deleted: true, userId: event.payload.userId };`,
      ),
      step(
        'delete_billing',
        [450, 120],
        `  // TODO: delete the customer from your billing provider.
  return { deleted: true, customerId: event.payload.customerId };`,
      ),
      step(
        'check_deleted',
        [300, 240],
        `  // Each arm settles as { status: "fulfilled" | "rejected" }. Stop before the
  // email if any deletion failed.
  const failed = {{delete_everywhere}}.filter((result) => result.status === "rejected");
  if (failed.length > 0) throw new Error(\`\${failed.length} deletion(s) failed\`);
  return { deleted: true };`,
      ),
      sendEmail('send_confirmation', [300, 360], {
        to: '{{event.payload.email}}',
        subject: 'Your account has been deleted',
        html: '<p>Your account and data are gone. Sorry to see you go.</p>',
      }),
    ],
    [
      edge('delete_everywhere', 'delete_app_data', 'app'),
      edge('delete_everywhere', 'delete_billing', 'billing'),
      edge('delete_everywhere', 'check_deleted', 'then'),
      edge('check_deleted', 'send_confirmation'),
    ],
  ),
}

const dataExport: WorkflowTemplate = {
  id: 'data-export',
  name: 'Data export',
  description: 'Build an export, email the download link, then delete the file after 7 days.',
  icon: 'download',
  category: 'accounts',
  ir: workflow(
    'Data export',
    'Runs when a user asks for a copy of their data.',
    [
      step(
        'build_export',
        [300, 0],
        `  // TODO: look up the user's email by userId; don't trust an email in the payload.
  const email = "user@example.com";
  // TODO: gather the data, store it under this random key (e.g. in R2) and make a
  // signed link that expires. A key built from the user id can be guessed.
  const fileKey = \`exports/\${crypto.randomUUID()}.zip\`;
  return { fileKey, email, url: "https://example.com/download" };`,
      ),
      sendEmail('send_link', [300, 120], {
        to: '{{build_export.email}}',
        subject: 'Your data export is ready',
        html: '<p><a href="{{build_export.url}}">Download your data</a>. The link works for 7 days.</p>',
      }),
      sleep('keep_for_seven_days', [300, 240], '7 days'),
      step(
        'delete_export',
        [300, 360],
        `  // TODO: delete the file from storage.
  return { deleted: {{build_export.fileKey}} };`,
      ),
    ],
    [
      edge('build_export', 'send_link'),
      edge('send_link', 'keep_for_seven_days'),
      edge('keep_for_seven_days', 'delete_export'),
    ],
  ),
}

const tenantProvisioning: WorkflowTemplate = {
  id: 'tenant-provisioning',
  name: 'Tenant provisioning',
  description: 'Set up a new workspace, and undo it if any step fails.',
  icon: 'building-2',
  category: 'accounts',
  ir: workflow(
    'Tenant provisioning',
    'Runs when a customer creates a workspace.',
    [
      tryCatch('provision', [300, 0]),
      step(
        'create_workspace',
        [150, 120],
        `  // TODO: create the workspace record.
  return { workspaceId: event.payload.workspaceId };`,
      ),
      step(
        'seed_defaults',
        [150, 240],
        `  // TODO: add default settings, roles and sample data.
  return { seeded: true };`,
      ),
      step(
        'roll_back',
        [450, 120],
        `  // TODO: remove whatever was created. \`err\` is what the try arm threw.
  throw err;`,
        // Roll back once; a retry would undo twice.
        { retryLimit: 0 },
      ),
      sendEmail('send_welcome', [300, 360], {
        to: '{{event.payload.email}}',
        subject: 'Your workspace is ready',
        html: '<p>Everything is set up. Jump in.</p>',
      }),
    ],
    [
      edge('provision', 'create_workspace', 'try'),
      edge('create_workspace', 'seed_defaults'),
      edge('provision', 'roll_back', 'catch'),
      edge('provision', 'send_welcome', 'then'),
    ],
  ),
}

export const accountTemplates: WorkflowTemplate[] = [
  accountDeletion,
  dataExport,
  tenantProvisioning,
]
