# Phase 3.2: Cloudflare Turnstile Integration Plan

## Objective
To protect the Luminatick Customer Portal's authentication endpoints (specifically `/api/v1/customer/auth/request` for Magic Links and OTPs) against abuse and bots by integrating Cloudflare Turnstile. The configuration must be dynamic, manageable via the Admin Dashboard, and the secret key must be encrypted at rest using `APP_MASTER_KEY`.

## Architecture & Data Flow
1. **Admin Configuration:** Admins configure `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in the Dashboard (`apps/dashboard`). These are saved to the `config` table in the D1 database. The secret key is automatically encrypted at rest by the backend because its key name ends with `_KEY` (handled by existing `utils/crypto.ts` and `settings.handler.ts` logic).
2. **Portal Initialization:** The Customer Portal (`apps/portal`) fetches the public configuration via `GET /api/v1/customer/config`. If `TURNSTILE_SITE_KEY` is present, it renders the Turnstile widget on the login form.
3. **Authentication Request:** The user submits their email. The Turnstile widget generates a `turnstileToken` which is sent along with the email and auth type in the `POST /api/v1/customer/auth/request` payload.
4. **Backend Validation:** The Server (`apps/server`) receives the request. It fetches and decrypts `TURNSTILE_SECRET_KEY` from D1. If configured, it makes a backend-to-backend verification request to Cloudflare's Turnstile API. If the token is invalid, it rejects the authentication request with a `400 Bad Request`.

## Task Breakdown

### 1. Backend Engineer Tasks (`apps/server`)
- **Update Sensitive Key Logic (`handlers/settings.handler.ts`)**:
  - Update the `isSensitiveKey` helper function to explicitly exclude `TURNSTILE_SITE_KEY` so it remains visible in the dashboard and unencrypted in the database, while `TURNSTILE_SECRET_KEY` gets automatically encrypted.
    ```typescript
    function isSensitiveKey(key: string): boolean {
      if (key === 'TURNSTILE_SITE_KEY') return false;
      return key.endsWith('_TOKEN') || key.endsWith('_KEY') || ...;
    }
    ```
- **Update Public Config Endpoint (`handlers/customer.handler.ts`)**:
  - Modify `GET /config` to also query and return `TURNSTILE_SITE_KEY` from the `config` table.
- **Update Auth Request Endpoint (`handlers/customer.handler.ts`)**:
  - Modify `POST /auth/request` to accept an optional `turnstileToken` in the JSON body.
  - Query the `config` table for `TURNSTILE_SECRET_KEY`.
  - If the secret key exists, decrypt it using `decryptString(encryptedValue, c.env.APP_MASTER_KEY)`.
  - If a secret key is configured but `turnstileToken` is missing in the request, return `400 Bad Request` (`{ error: 'Turnstile token is required' }`).
  - Validate the token by making a POST request to `https://challenges.cloudflare.com/turnstile/v0/siteverify` passing the `secret` and `response` (the `turnstileToken`) as form data. Optionally include `remoteip` using `c.req.header('CF-Connecting-IP')`.
  - If the Turnstile API returns `success: false`, return `400 Bad Request` (`{ error: 'Turnstile validation failed' }`).
  - If successful, proceed with the existing `CustomerAuthService.requestAuth` logic.

### 2. Frontend Engineer Tasks (`apps/portal` & `apps/dashboard`)
- **Portal Package Setup (`apps/portal`)**:
  - Install `@marsidev/react-turnstile` dependency: `npm install @marsidev/react-turnstile` inside `apps/portal`.
- **Portal Login Page (`apps/portal/src/pages/LoginPage.tsx`)**:
  - Add state for `siteKey` and `turnstileToken`.
  - Add a `useEffect` hook to fetch `/config` on mount and set `siteKey` if `TURNSTILE_SITE_KEY` is returned.
  - Import and render `<Turnstile siteKey={siteKey} onSuccess={(token) => setTurnstileToken(token)} />` right above the submit button, but only if `siteKey` is populated.
  - Update the `handleSubmit` function to include `turnstileToken` in the `portalApi.post('/auth/request')` payload.
  - Disable the Submit button if `siteKey` is present but `turnstileToken` is not yet acquired.
- **Dashboard Settings Page (`apps/dashboard/src/pages/SettingsPage.tsx`)**:
  - Add a new "Security & Authentication" section to the General Settings form.
  - Add two input fields for `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
  - Bind them to the settings state so they are saved via the existing `PUT /api/v1/settings` endpoint. The backend will automatically handle encrypting `TURNSTILE_SECRET_KEY` and returning `••••••••` to the UI.

### 3. Security Reviewer Tasks
- **Verify Secret Management:** Ensure `TURNSTILE_SECRET_KEY` is not exposed in any API response except as `••••••••` to authenticated admins.
- **Verify Cryptography:** Confirm that the existing `encryptString` and `decryptString` mechanisms in `utils/crypto.ts` are correctly applied to `TURNSTILE_SECRET_KEY`.
- **Verify Validation Logic:** Ensure that the authentication endpoint correctly fails closed (rejects login) if Turnstile is enabled in the backend but the token is missing, invalid, or expired.
- **Verify Public Exposure:** Ensure that ONLY `TURNSTILE_SITE_KEY` (and non-sensitive config like `TICKET_PREFIX`) is exposed on the public `/config` endpoint.

### 4. Tester Tasks
- **Test Case 1: Turnstile Disabled:** With no keys configured in the Admin Dashboard, verify that the Portal login functions normally without displaying the Turnstile widget.
- **Test Case 2: Configuration & Rendering:** Configure test site and secret keys in the Dashboard. Reload the Portal login page and verify that the Turnstile widget renders correctly.
- **Test Case 3: Successful Validation:** Complete the Turnstile challenge and submit a Magic Link or OTP request. Verify that the request succeeds and the email/OTP is sent.
- **Test Case 4: Failed Validation:** Attempt to bypass the widget (e.g., using curl/Postman to send a request without a `turnstileToken` when keys are configured) and verify the backend rejects it with a 400 error.
- **Test Case 5: Settings Persistence:** Verify that the secret key is masked (`••••••••`) when revisiting the Settings Page in the Admin Dashboard, and that the site key remains visible.
