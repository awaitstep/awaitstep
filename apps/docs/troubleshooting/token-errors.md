---
title: Token Errors
---

# Token Errors

## `Invalid API token`

**Error message:** `Credential verification failed: Invalid API token`

**Cause:** The Cloudflare API token you entered is incorrect, has been revoked, or was never valid.

**Fix:**

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).
2. Confirm the token exists and is active.
3. If unsure, create a new token (see below) and update the connection in **Settings → Connections**.

---

## `Token does not have required permissions`

**Error message:** `Credential verification failed: Token missing permissions: Workers Scripts:Edit`

**Cause:** The API token exists but is missing one or more of the permissions AwaitStep requires.

**Fix:** Create a new token with all required permissions (listed below), or edit the existing token to add the missing permissions.

---

## Required Cloudflare API Token Permissions

When creating an API token for AwaitStep, you must grant all five of the following permissions:

| Permission             | Type | Description                                  |
| ---------------------- | ---- | -------------------------------------------- |
| **Workers Scripts**    | Edit | Deploy and update Worker scripts             |
| **Workers Workflows**  | Edit | Create and manage Workflow instances         |
| **Workers KV Storage** | Edit | Read and write KV namespace data             |
| **Workers R2 Storage** | Edit | Read and list R2 bucket objects              |
| **Account Settings**   | Read | Verify the account ID and account membership |

### How to create the token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).
2. Click **Create Token**.
3. Select **Create Custom Token**.
4. Add each of the five permissions above.
5. Under **Account Resources**, select the specific account you want to deploy to (or **All accounts**).
6. Click **Continue to summary**, then **Create Token**.
7. Copy the token — it is shown only once.

:::warning
Token values are shown only once at creation. If you lose it, you must create a new one. Store it in a password manager before saving it in AwaitStep.
:::

---

## `Account ID not found`

**Error message:** `No Cloudflare account found for this token`

**Cause:** The token is valid but the account ID stored in the connection no longer matches any account the token has access to.

**Fix:**

1. Go to **Settings → Connections**.
2. Edit the connection.
3. Re-enter the API token and click **Verify**. AwaitStep will fetch the list of accounts associated with the token.
4. Select the correct account from the dropdown.
5. Save.

---

## `Token expired`

**Error message:** `Credential verification failed: Token is expired`

**Cause:** The API token was created with an expiry date and has since expired.

**Fix:** Create a new token with a longer or no expiry date, and update the connection.

---

## AwaitStep API key errors

AwaitStep API keys (`ask_...`) are separate from Cloudflare API tokens. If you receive authentication errors when calling the AwaitStep REST API:

| Error                                       | Cause                                  | Fix                                                        |
| ------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| `401 Unauthorized`                          | Missing or invalid API key             | Check the `Authorization: Bearer ask_...` header           |
| `403 Forbidden`                             | API key lacks required scope           | Use a key with `write` or `deploy` scope as appropriate    |
| `401 Unauthorized` on session-only endpoint | Using API key for a session-only route | These endpoints require browser session auth, not API keys |

To manage API keys, go to **Settings → API Keys** (requires browser login — API keys cannot be managed via API key authentication).
