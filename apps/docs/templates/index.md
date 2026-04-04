---
title: Templates
---

# Templates

Templates are ready-to-use workflow blueprints. Import any template into AwaitStep and customise it for your use case.

## Available templates

| Template                                  | Description                                                | Trigger |
| ----------------------------------------- | ---------------------------------------------------------- | ------- |
| [Order Processing](./order-processing.md) | Charge a card, handle payment failures, send a receipt     | API     |
| [Webhook Handler](./webhook-handler.md)   | Receive an HTTP event, process it durably, and acknowledge | HTTP    |
| [Scheduled Report](./scheduled-report.md) | Fetch metrics on a schedule, generate a report, email it   | Cron    |
| [Human Approval](./human-approval.md)     | Pause a workflow until a human approves or rejects         | API     |
| [AI Agent Loop](./ai-agent.md)            | Generate content with an AI model, validate quality, retry | API     |

## Using a template

1. From the dashboard, click **New Workflow**.
2. Select **Start from template**.
3. Choose a template from the list.
4. AwaitStep imports the workflow IR and opens the canvas.
5. Update node configurations — especially any secrets, email addresses, or API endpoints that are specific to your account.
6. Deploy.

## Template limitations

Templates are starting points. After import, the workflow is fully editable — you can add, remove, or rearrange nodes, change conditions, and swap node types.

Templates do not include environment variable values. You need to configure secrets (API keys, etc.) in **Settings → Environment Variables** before deploying.
