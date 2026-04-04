---
title: Quickstart
---

# Quickstart

Get AwaitStep running and deploy your first workflow in under 5 minutes.

## 1. Run the install script

```bash
curl -fsSL https://raw.githubusercontent.com/awaitstep/awaitstep/main/scripts/install.sh -o install.sh && bash install.sh
```

The script creates a directory, writes a `docker-compose.yml` and `.env`, generates secrets, and starts the container. When it finishes, AwaitStep is available at `http://localhost:8080`.

## 2. Sign in

Open `http://localhost:8080` in your browser.

AwaitStep supports the following authentication methods:

- **Magic link** — enter your email and click the link sent to your inbox (requires `RESEND_API_KEY`)
- **GitHub OAuth** — requires `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- **Google OAuth** — requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

:::info
There is no email/password authentication. At least one auth method must be configured before you can sign in.
:::

## 3. Connect your Cloudflare account

1. Go to **Settings → Cloudflare**.
2. Paste your Cloudflare API token. See [Cloudflare Connection](../installation/cloudflare-connection) for how to create one with the correct permissions.
3. Select the account you want to deploy workflows to.
4. Click **Save**.

## 4. Create a Hello World workflow

1. Click **New Workflow** from the dashboard.
2. Give it a name, e.g. `Hello World`.
3. The canvas opens. From the node panel (click **+** top-left), drag a **Step** node onto the canvas.
4. Connect nodes by dragging from one handle to another.
5. Click the **Step** node to configure it — give it a name and add your code.

![A simple workflow on the canvas](/images/canvas-simple.png)

## 5. Deploy

Click **Deploy** in the top toolbar. AwaitStep will:

1. Compile the canvas to TypeScript
2. Bundle it with `wrangler`
3. Upload the Worker to your Cloudflare account

When the deploy finishes, the toolbar shows a green **Deployed** badge.

## 6. Trigger the workflow

1. Go to the **Runs** tab.
2. Click **Trigger**.
3. Leave the payload empty and click **Run**.
4. A new row appears in the runs table. Click it to see the step-by-step execution trace.

:::tip
You can also trigger a workflow via HTTP from outside AwaitStep. Each deployed workflow exposes a trigger URL shown in the **Runs** tab.
:::
