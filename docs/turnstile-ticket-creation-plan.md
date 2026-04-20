# Phase 3.2: Turnstile Integration for Ticket Creation

## Overview
This specification details the architecture and implementation steps for integrating Cloudflare Turnstile (invisible widget) into the Customer Portal's ticket creation flow.

## 1. Backend Implementation
- Extract the existing Turnstile validation logic from `POST /auth/request` into a reusable utility.
- Update `POST /tickets` to validate the `turnstileToken` if the server is configured with a `TURNSTILE_SECRET_KEY`.

### Tasks for Backend Engineer
1. **Create Utility Function (`apps/server/src/utils/turnstile.ts`)**
   - Implement `verifyTurnstileToken(env: Env, token?: string, ip?: string): Promise<boolean>`.
   - Query `TURNSTILE_SECRET_KEY` from the `config` table.
   - If missing, return `true` (Turnstile is disabled).
   - If present, verify `env.APP_MASTER_KEY`, decrypt the secret, and call `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
   - Return `true` if successful, throw an error or return `false` otherwise.
2. **Refactor Auth Route (`apps/server/src/handlers/customer.handler.ts`)**
   - Replace the inline Turnstile validation in `POST /auth/request` with the new utility function.
3. **Secure Ticket Creation (`apps/server/src/handlers/customer.handler.ts`)**
   - Update `POST /tickets` to optionally extract `turnstileToken` from the JSON body.
   - Call `verifyTurnstileToken` using the token and the client IP (`c.req.header('CF-Connecting-IP')`).
   - If validation fails, return a `400 Bad Request` with an appropriate error message.

## 2. Frontend Implementation
- The Customer Portal (`TicketListPage.tsx` or equivalent) will fetch the `TURNSTILE_SITE_KEY` from the `/config` endpoint.
- An invisible Turnstile widget will be rendered in the Create Ticket form.
- Form submission will be intercepted to execute the widget and append the token to the ticket payload.

### Tasks for Frontend Engineer
1. **Fetch Configuration (`apps/portal/src/pages/TicketListPage.tsx`)**
   - Ensure the `/config` call fetches and stores `TURNSTILE_SITE_KEY` in the component state (`siteKey`).
2. **Integrate Invisible Widget**
   - Import `Turnstile` and `TurnstileInstance` from `@marsidev/react-turnstile`.
   - Add a `useRef<TurnstileInstance>(null)` to hold the widget reference.
   - Render the component inside the Create Ticket form conditionally if `siteKey` exists:
     ```tsx
     <Turnstile
       ref={turnstileRef}
       siteKey={siteKey}
       options={{ size: 'invisible', execution: 'execute' }}
       onSuccess={(token) => handleTicketSubmit(token)}
     />
     ```
3. **Update Form Submission Logic**
   - When the user clicks "Create Ticket", prevent default.
   - If `siteKey` exists, call `turnstileRef.current?.execute()` (this triggers `onSuccess` with the token).
   - If `siteKey` does not exist, directly call the backend `/tickets` endpoint.
   - In `handleTicketSubmit(token)`, send `{ subject, message, turnstileToken: token }` to the `/tickets` endpoint.
   - After completion (success or error), call `turnstileRef.current?.reset()` to prepare for the next submission.

## 3. Testing Requirements
### Tasks for Tester
1. **Configuration Checks:** Verify that if `TURNSTILE_SECRET_KEY` is not set in the database, ticket creation proceeds smoothly without a token.
2. **Validation Checks:** Configure a valid `TURNSTILE_SECRET_KEY`. Attempt to create a ticket without a token using API tools (e.g., cURL/Postman). Verify that it returns a 400 error.
3. **UI Integration:** Using the Customer Portal, ensure the widget does not visually disrupt the layout (it must be fully invisible).
4. **End-to-End Flow:** Create a ticket via the UI when Turnstile is enabled. Ensure the widget executes, obtains a token, and the ticket is successfully created. 
5. **Multiple Submissions:** Test creating two tickets consecutively to ensure the widget is properly reset after the first submission.
