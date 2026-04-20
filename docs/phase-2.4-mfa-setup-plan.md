# MFA Setup Page Implementation Plan

## 1. Overview
The application currently uses TOTP (Time-Based One-Time Password) as its MFA mechanism. Since TOTP is a universal standard, a single setup process and QR code will work across all major authenticator applications (e.g., Google Authenticator, Microsoft Authenticator, Authy, 1Password, etc.). 

The goal is to provide a dedicated, user-friendly security profile page where users can manage their MFA settings, with the UI clearly presenting these common apps as options during the setup flow.

## 2. Backend API Updates
The core MFA logic is already implemented in `mfa.service.ts` and utilized in `auth.handler.ts`. We need to expose a complete lifecycle for MFA management and ensure the frontend has the necessary state.

* **Update User Payload**: The frontend needs to know if MFA is currently active. The `user` object returned by `POST /api/auth/login`, `POST /api/auth/mfa/verify`, and `POST /api/auth/mfa/confirm` must be updated to include the `mfa_enabled` boolean from the database.
* **Existing Endpoints to Utilize**:
  * `POST /api/auth/mfa/setup`: Requires authentication. Generates a temporary secret, updates `mfa_secret` in the database, and returns the base32 `secret` along with an `otpauth://` provisioning URI.
  * `POST /api/auth/mfa/confirm` (Enable): Requires authentication. Verifies a submitted 6-digit code against the decrypted secret. On success, it sets `mfa_enabled = true` for the user.
* **New Endpoint Required**:
  * `POST /api/auth/mfa/disable`: Requires authentication. Verifies the user's intent to remove 2FA. It will execute `UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = ?` and return the updated user payload.

## 3. Frontend UI Implementation
We will introduce a new page focused on user-specific security settings, easily accessible from the main navigation.

### Dependencies
* Add `qrcode.react` to `apps/dashboard/package.json` to generate SVG QR codes from the `provisioning_uri` directly on the client.

### Layout & Navigation Updates
* Update `apps/dashboard/src/components/layout/Layout.tsx`.
* Currently, the user avatar in the bottom-left of the sidebar is static. We will convert this into an interactive popover/dropdown menu containing:
  * **Security Profile** (navigates to `/profile/security`)
  * **Logout** (moves the current logout action inside this menu)

### New Page: `SecurityProfilePage.tsx`
* **Location**: Create `apps/dashboard/src/pages/SecurityProfilePage.tsx` and register the route `/profile/security` in `App.tsx`.
* **UI Flow**:
  * **Header**: Display "Security Profile" or "Account Security".
  * **Section: Two-Factor Authentication (2FA)**
    * **State 1: MFA Disabled (`user.mfa_enabled === false`)**
      * Display a warning/info banner encouraging the user to secure their account.
      * Show a **"Setup MFA"** button.
      * Clicking the button opens a Setup Modal/Wizard:
        1. Calls `POST /api/auth/mfa/setup` to fetch the URI.
        2. Renders the QR code using `qrcode.react`.
        3. Displays helper text: *"Scan this QR code using a supported app like Google Authenticator, Microsoft Authenticator, or Authy."*
        4. Provides an input field for the 6-digit verification code.
        5. A **"Verify & Enable"** button submits the code to `POST /api/auth/mfa/confirm`.
        6. On success, the modal closes, `user.mfa_enabled` updates in the local Zustand store, and a success toast appears.
    * **State 2: MFA Enabled (`user.mfa_enabled === true`)**
      * Display a green success badge indicating "MFA is Active".
      * Show a **"Disable MFA"** (or "Remove 2FA") button, styled destructively.
      * Clicking the button opens a Confirmation Modal warning the user about the security implications.
      * Confirming calls `POST /api/auth/mfa/disable`, updates the Zustand store, and reverts the UI to State 1.
