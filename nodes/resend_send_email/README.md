# Resend Send Email

Sends a transactional email via the [Resend](https://resend.com) API.

## Configuration

| Field          | Type     | Required | Description                                                |
| -------------- | -------- | -------- | ---------------------------------------------------------- |
| From           | string   | Yes      | Sender email address. Must be a verified domain in Resend. |
| To             | string   | Yes      | Recipient email address.                                   |
| Subject        | string   | Yes      | Email subject line.                                        |
| HTML Body      | textarea | Yes      | Email body as HTML.                                        |
| Reply To       | string   | No       | Reply-to email address.                                    |
| CC             | string   | No       | CC email address.                                          |
| BCC            | string   | No       | BCC email address.                                         |
| Resend API Key | secret   | Yes      | Your Resend API key.                                       |

## Output

| Field | Type   | Description                                                       |
| ----- | ------ | ----------------------------------------------------------------- |
| id    | string | The Resend email ID (e.g. `49a3999c-0ce1-4ea6-ab68-afcd6dc2e794`) |

## Environment Variables

| Variable         | Description                                                         |
| ---------------- | ------------------------------------------------------------------- |
| `RESEND_API_KEY` | Your Resend API key. Found in your Resend dashboard under API Keys. |

## Example

A workflow that sends a welcome email after a user signs up:

```
[Fetch User] → [Resend Send Email]
```

Configure the Resend node with:

- **From**: `welcome@yourdomain.com`
- **To**: `{{fetch_user.email}}`
- **Subject**: `Welcome to our platform`
- **HTML Body**: `<h1>Welcome!</h1><p>Thanks for signing up.</p>`
