# Email Setup Guide

Luminatick is built on Cloudflare Workers, a serverless, event-driven architecture. Because of this, email integration works differently than traditional helpdesk software that continuously polls an email server in the background.

This guide explains the three distinct ways you can approach email setup with Luminatick.

---

## Case 1: Custom Domain in Cloudflare (Native Routing)

This is the most direct approach if your domain's DNS is already managed by Cloudflare and you do not have an existing email hosting provider (like Google Workspace or Microsoft 365) for that specific domain.

### Inbound (Receiving Emails)
Cloudflare makes inbound routing incredibly simple. 
1. Enable **Cloudflare Email Routing** in your Cloudflare Dashboard.
2. Create a custom address (e.g., `support@yourdomain.com`).
3. Set the action to **Send to Worker** and select your Luminatick Worker.
4. When a customer emails `support@yourdomain.com`, Cloudflare instantly triggers the Worker to process the email and create a ticket.

### Outbound (Sending Emails)
**Important:** Cloudflare does *not* natively send outbound emails. You cannot simply tell Cloudflare to send an email back to the customer. 
To send replies, notifications, or Magic Link OTPs, you must integrate a third-party transactional email service.
1. Sign up for a provider like **Resend** or **Mailchannels**.
2. Verify your domain in their dashboard.
3. Add the provider's API key into Luminatick's settings. Luminatick will use their API to send outbound emails seamlessly.

---

## Case 2: Shared Mailbox (Office 365 / Google Workspace)

If your business already uses a dedicated support mailbox hosted on Google Workspace (Gmail) or Microsoft Office 365 (Exchange), you can keep your existing infrastructure while utilizing Luminatick.

### Inbound (Receiving Emails)
Instead of Cloudflare catching the email first, your provider does. You set up a **Forwarding/Redirection Model**:
1. Create a hidden Cloudflare routing address (e.g., `inbound-worker@yourdomain.com`) that triggers the Luminatick Worker.
2. In Gmail or Office 365, configure your support mailbox (`support@yourcompany.com`) to automatically forward all incoming mail to `inbound-worker@yourdomain.com`.
3. Customers email your normal address, your provider applies its standard spam filtering, and then pushes a copy to the Cloudflare Worker to create the ticket.

### Outbound (Sending Emails)
For outbound emails, you have two choices:
1. **API Provider (Recommended):** Use a service like **Resend**. Ensure `support@yourcompany.com` is verified as a sender. Luminatick will send replies via Resend, and they will appear to the customer as coming from your standard support address.
2. **Provider API/SMTP:** You can configure Luminatick to use your provider's specific API or standard SMTP settings to send outgoing mail directly through your Google Workspace/O365 account.

---

### Step-by-Step: Gmail Forwarding Example (Case 2)

If you are using Gmail (Google Workspace), follow these exact steps to implement Case 2:

#### 1. Cloudflare Email Routing Configuration
1. Log in to the Cloudflare Dashboard and select your domain.
2. In the left sidebar, click **Email** > **Email Routing**. Enable it if you haven't.
3. In the **Routing rules** tab, click **Create rule**.
4. **Custom address:** Enter a hidden address (e.g., `inbound-worker@yourdomain.com`).
5. **Action:** Select **Send to Worker** and choose your Luminatick Worker.
6. Click **Save**.

#### 2. Gmail Forwarding Configuration
1. Log in to your support Gmail account.
2. Click the **Settings** (gear icon) > **See all settings**.
3. Go to the **Forwarding and POP/IMAP** tab.
4. Click **Add a forwarding address**.
5. Enter the Cloudflare custom address you created in Step 1.
6. Click **Next** > **Proceed** > **OK**.

#### 3. Verification Process
1. Wait 1-2 minutes for the email to be processed.
2. Log in to your **Luminatick Dashboard** (Admin Portal).
3. Go to the **Tickets** page. You should see a new ticket with the subject **Gmail Forwarding Confirmation - Receive Mail from support@yourcompany.com**.
4. Open the ticket and find the numeric **confirmation code** in the message body.
5. Go back to your Gmail Settings (**Forwarding and POP/IMAP**).
6. Enter the code in the verification box and click **Verify**.
7. Select **Forward a copy of incoming mail to...** and ensure the Cloudflare address is selected.
8. Scroll to the bottom and click **Save Changes**.

#### 4. Outbound Configuration (Resend)
1. Ensure your domain is verified in your [Resend dashboard](https://resend.com/domains).
2. Set the `RESEND_FROM_EMAIL` secret in your Cloudflare Worker:
   ```bash
   npx wrangler secret put RESEND_FROM_EMAIL
   # Enter: Support <support@yourcompany.com>
   ```
3. **Important:** The email address in `RESEND_FROM_EMAIL` must be a verified sender in Resend and should match your public-facing support address.

---

## Case 3: Traditional IMAP/SMTP Polling

**Luminatick does NOT support traditional IMAP polling.**

### Why IMAP is Not Supported
Traditional helpdesk systems (like Zammad or Zendesk) run as continuous background processes on a dedicated server. They log into your email server via IMAP every few minutes, check for new messages, and download them.

Luminatick is built on **Cloudflare Workers**. Workers are ephemeral, serverless functions that spin up, do a job, and spin down. They do not run continuously in the background to poll external servers. 

### The Solution: Push, Not Pull
Because of this serverless architecture, Luminatick requires a **push-based** model for inbound mail (as described in Case 1 and Case 2). An event (an incoming email) must trigger the Worker via a webhook or Cloudflare Email Routing.

### Outbound via SMTP
While inbound IMAP is not possible, **outbound via SMTP** is fully supported. You can configure Luminatick to send outgoing ticket replies using traditional SMTP credentials (Host, Port, Username, Password) provided by your email host, allowing you to use almost any email provider for sending.

---

## Summary

| Setup Type | Inbound (Receiving) | Outbound (Sending) | Best For |
| :--- | :--- | :--- | :--- |
| **Custom Domain (Cloudflare)** | Cloudflare Email Routing -> Worker | Requires 3rd Party API (Resend, etc.) | New projects, domains without existing email hosting. |
| **Shared Mailbox (O365/Gmail)** | Auto-Forward to Cloudflare Worker | Resend or Provider API/SMTP | Established businesses with existing support mailboxes. |
| **Traditional IMAP** | ❌ **Not Supported** (Requires Push) | ✅ Supported via SMTP configuration | N/A - Must switch to a forwarding (push) model for inbound. |
