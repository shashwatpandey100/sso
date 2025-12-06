# Shelfex Accounts - OAuth 2.0 SSO Authentication System

A production-grade Single Sign-On (SSO) authentication system built with **Express**, **TypeScript**, **Drizzle ORM**, and **PostgreSQL**. This system enables seamless authentication across multiple Shelfex products (ShelfScan, ShelfMuse, ShelfIntel) similar to how Google's `accounts.google.com` works for Gmail, YouTube, and Drive.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Authentication Flow](#authentication-flow)
4. [API Endpoints Reference](#api-endpoints-reference)
5. [SSO Flow Examples](#sso-flow-examples)
6. [Token Management](#token-management)
7. [Security Features](#security-features)
8. [Configuration](#configuration)

---

## Architecture Overview

### Core Concept

This system implements the **OAuth 2.0 Authorization Code Flow** with a centralized Identity Provider (IdP). When a user logs into any Shelfex product, they authenticate through `accounts.shelfex.com`, which then issues authorization codes that client applications exchange for tokens.

### Key Components

```
┌─────────────────────────────────────────────────────────────┐
│                    accounts.shelfex.com                     │
│                  (Identity Provider - IdP)                  │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Auth API  │  │  OAuth API   │  │  Token Mgmt  │        │
│  │             │  │              │  │              │        │
│  │ /register   │  │ /authorize   │  │ JWT Utils    │        │
│  │ /login      │  │ /token       │  │ Refresh      │        │
│  │ /refresh    │  │              │  │ Validation   │        │
│  │ /logout     │  │              │  │              │        │
│  └─────────────┘  └──────────────┘  └──────────────┘        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │             PostgreSQL Database (Neon)               │   │
│  │  - users           - refresh_tokens                  │   │
│  │  - client_apps     - auth_codes                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│  shelfscan   │      │  shelfmuse   │     │  shelfintel  │
│   .com       │      │    .com      │     │    .com      │
│              │      │              │     │              │
│ Client App 1 │      │ Client App 2 │     │ Client App 3 │
└──────────────┘      └──────────────┘     └──────────────┘
```

### Cookie Strategy

The system uses **three types of cookies** for authentication:

1. **`accounts_session`** (Global SSO Cookie)
   - Domain: `.shelfexecution.com` (works across all subdomains)
   - Purpose: Enables "silent" authentication when visiting new apps
   - Set by: `POST /auth/login`
   - Read by: `GET /oauth/authorize`

2. **`access_token`** (Local Access Token)
   - Domain: `accounts.shelfex.com` only
   - Purpose: API authentication for accounts service
   - Expiry: 1 day

3. **`refresh_token`** (Local Refresh Token)
   - Domain: `accounts.shelfex.com` only
   - Purpose: Obtain new access tokens without re-login
   - Expiry: 30 days

---

## Database Schema

### `users` Table
Stores user identity and credentials.

```typescript
{
  id: UUID (PK)
  email: string (unique, indexed)
  username: string | null (unique, indexed)
  password: string (bcrypt hashed)
  name: string | null
  emailVerified: boolean (default: false)
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Key Features:**
- Users can login with **email OR username**
- Passwords hashed with bcrypt (12 salt rounds)
- Email verification support (configurable via `EMAIL_VERIFICATION_REQUIRED` env)

---

### `refresh_tokens` Table
Stores long-lived refresh tokens for session management.

```typescript
{
  id: UUID (PK)
  userId: UUID (FK -> users.id, cascade delete)
  tokenHash: string (unique, indexed) // SHA256 hash of actual token
  expiresAt: timestamp // 30 days from creation
  isRevoked: boolean (default: false)
  createdAt: timestamp
  lastUsedAt: timestamp | null
}
```

**Key Features:**
- Tokens are **hashed** before storage (never store raw tokens)
- Can be revoked manually (logout) or automatically (expiry)
- `lastUsedAt` tracks token usage patterns

---

### `auth_codes` Table
Stores temporary OAuth authorization codes.

```typescript
{
  id: UUID (PK)
  code: string (unique, indexed) // Random 32-byte base64url
  userId: UUID (FK -> users.id, cascade delete)
  clientId: string (FK -> client_apps.clientId)
  redirectUri: string // Must match on token exchange
  expiresAt: timestamp // 10 minutes from creation
  isUsed: boolean (default: false) // One-time use only
  createdAt: timestamp
}
```

**Key Features:**
- **Short-lived** (10 minutes)
- **One-time use** (marked as used after exchange)
- **Bound to redirect_uri** (prevents interception attacks)

---

### `client_apps` Table
Registers allowed client applications (ShelfScan, ShelfMuse, etc.).

```typescript
{
  id: UUID (PK)
  clientId: string (unique, indexed) // e.g., "shelfscan"
  clientSecret: string // bcrypt hashed
  name: string // Display name, e.g., "ShelfScan"
  allowedRedirectUris: string[] // JSON array of valid callback URLs
  createdAt: timestamp
}
```

**Key Features:**
- Each app has unique `clientId` and `clientSecret`
- Secrets are **hashed** (like passwords)
- Redirect URIs are **whitelisted** (security)

**Example Client App:**
```json
{
  "clientId": "shelfscan",
  "name": "ShelfScan",
  "allowedRedirectUris": [
    "http://localhost:3001/callback",
    "https://shelfscan.com/callback"
  ]
}
```

---

## Authentication Flow

### Token Types

The system issues **three types of JWT tokens**:

#### 1. Access Token
- **Purpose:** Authenticate API requests
- **Expiry:** 1 day
- **Payload:**
  ```typescript
  {
    userId: string
    email: string
    emailVerified: boolean
    iss: "accounts.shelfex.com"
    aud: "shelfex-services"
    exp: timestamp
  }
  ```
- **Storage:** Cookie (`access_token`) or Authorization header
- **Usage:** Every protected API call

#### 2. Refresh Token
- **Purpose:** Obtain new access tokens without re-login
- **Expiry:** 30 days
- **Payload:**
  ```typescript
  {
    userId: string
    tokenId: string // Unique ID for this refresh token
    iss: "accounts.shelfex.com"
    exp: timestamp
  }
  ```
- **Storage:** Cookie (`refresh_token`) or request body
- **Usage:** `POST /auth/refresh`

#### 3. ID Token (OpenID Connect)
- **Purpose:** User profile information for client apps
- **Expiry:** 1 day
- **Payload:**
  ```typescript
  {
    userId: string
    email: string
    name: string | null
    emailVerified: boolean
    iss: "accounts.shelfex.com"
    aud: "shelfex-services"
    exp: timestamp
  }
  ```
- **Storage:** Not stored, returned once during token exchange
- **Usage:** Client apps decode this to display user info

---

## API Endpoints Reference

### Base URL
```
http://localhost:8000/api/v1
```

---

## Authentication Endpoints

### 1. POST `/auth/register`

**Description:** Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "johndoe" // Optional
  "password": "SecurePass123!",
  "name": "John Doe" // Optional
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "username": "johndoe",
    "name": "John Doe",
    "emailVerified": false
  }
}
```

**Error Responses:**

**400 - Validation Error:**
```json
{
  "success": false,
  "message": "Email and password are required"
}
```

**409 - Duplicate User:**
```json
{
  "success": false,
  "message": "User with this email already exists"
}
```

**409 - Username Taken:**
```json
{
  "success": false,
  "message": "Username already taken"
}
```

---

### 2. POST `/auth/login`

**Description:** Authenticate user and issue tokens. Supports both regular login and OAuth flow.

**Request Body (Regular Login):**
```json
{
  "identifier": "user@example.com", // Can be email or username
  "password": "SecurePass123!"
}
```

**Request Body (OAuth Login):**
```json
{
  "identifier": "user@example.com",
  "password": "SecurePass123!",
  "client_id": "shelfscan", // Optional OAuth params
  "redirect_uri": "https://shelfscan.com/callback",
  "state": "random_csrf_token" // Optional
}
```

**Success Response - Regular Login (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "user@example.com",
      "name": "John Doe",
      "emailVerified": false
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Cookies Set:**
- `access_token` (HttpOnly, 1 day)
- `refresh_token` (HttpOnly, 30 days)
- `accounts_session` (HttpOnly, 1 day, domain: `.shelfex.com`)

**Success Response - OAuth Login (302):**
```
Redirect: /api/v1/oauth/authorize?client_id=shelfscan&redirect_uri=https://shelfscan.com/callback&response_type=code&state=xyz
```

**Error Responses:**

**400 - Missing Fields:**
```json
{
  "success": false,
  "message": "Email/username and password are required"
}
```

**401 - Invalid Credentials:**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

### 3. GET `/auth/login`

**Description:** Get login page data with OAuth context.

**Query Parameters:**
```
?client_id=shelfscan
&redirect_uri=https://shelfscan.com/callback
&state=random_csrf_token
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login page",
  "data": {
    "client_id": "shelfscan",
    "redirect_uri": "https://shelfscan.com/callback",
    "state": "random_csrf_token"
  }
}
```

**Usage:** Frontend calls this to get OAuth params and render login form accordingly.

---

### 4. POST `/auth/refresh`

**Description:** Exchange refresh token for a new access token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." // Optional if cookie present
}
```

**Alternatively:** Send `refresh_token` cookie (automatic).

**Success Response (200):**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Cookies Updated:**
- `access_token` (new token)

**Error Responses:**

**401 - No Token:**
```json
{
  "success": false,
  "message": "Refresh token required"
}
```

**401 - Invalid Token:**
```json
{
  "success": false,
  "message": "Invalid refresh token"
}
```

**401 - Revoked:**
```json
{
  "success": false,
  "message": "Refresh token has been revoked"
}
```

**401 - Expired:**
```json
{
  "success": false,
  "message": "Refresh token expired"
}
```

---

### 5. POST `/auth/logout`

**Description:** Revoke refresh token and clear cookies.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." // Optional if cookie present
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Cookies Cleared:**
- `access_token`
- `refresh_token`

**Database Update:**
- Marks refresh token as `isRevoked: true`

---

### 6. GET `/auth/me`

**Description:** Get current authenticated user details.

**Headers Required:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Or Cookie:**
```
Cookie: access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": false,
    "createdAt": "2025-12-05T10:30:00.000Z"
  }
}
```

**Error Responses:**

**401 - No Token:**
```json
{
  "success": false,
  "message": "Authentication required",
  "error": "No token provided"
}
```

**401 - Invalid Token:**
```json
{
  "success": false,
  "message": "Invalid token",
  "error": "Token is malformed or invalid"
}
```

**401 - Expired Token:**
```json
{
  "success": false,
  "message": "Token expired",
  "error": "Please refresh your token"
}
```

**403 - Email Not Verified (if `EMAIL_VERIFICATION_REQUIRED=true`):**
```json
{
  "success": false,
  "message": "Email verification required",
  "error": "Please verify your email before accessing this resource"
}
```

---

## OAuth Endpoints

### 7. GET `/oauth/authorize`

**Description:** OAuth 2.0 authorization endpoint. Entry point for SSO flow.

**Query Parameters:**
```
?client_id=shelfscan (required)
&redirect_uri=https://shelfscan.com/callback (required)
&response_type=code (required, must be "code")
&state=random_csrf_token (optional)
```

**Flow Decision Tree:**

```
┌───────────────────────────────┐
│ Check accounts_session cookie │
└──────────────┬────────────────┘
               │
       ┌───────┴────────┐
       │                │
   ❌ Missing      ✅ Exists
       │                │
       ▼                ▼
Redirect to      Verify Token
/login?...           │
                 ┌───┴────┐
                 │        │
             ❌ Invalid  ✅ Valid
                 │        │
                 ▼        ▼
          Redirect to  Generate
          /login?...   Auth Code
                          │
                          ▼
                    Redirect to
                    client app
                    with code
```

**Success Response - User Logged In (302):**
```
Redirect: https://shelfscan.com/callback?code=abc123xyz...&state=random_csrf_token
```

**Response - User Not Logged In (302):**
```
Redirect: /login?client_id=shelfscan&redirect_uri=https://shelfscan.com/callback&state=random_csrf_token
```

**Error Responses:**

**400 - Missing Parameters:**
```json
{
  "success": false,
  "message": "Invalid OAuth request",
  "error": "Required params: client_id, redirect_uri, response_type=code"
}
```

**400 - Invalid Client:**
```json
{
  "success": false,
  "message": "Invalid client_id",
  "error": "Client 'invalid-client' not registered"
}
```

**400 - Invalid Redirect URI:**
```json
{
  "success": false,
  "message": "Invalid redirect_uri",
  "error": "Redirect URI not registered for this client"
}
```

**403 - Email Not Verified (if enabled):**
```json
{
  "success": false,
  "message": "Email verification required",
  "error": "Please verify your email before accessing other apps"
}
```

**Behind the Scenes:**

1. Validates `client_id` exists in `client_apps` table
2. Checks if `redirect_uri` is in the app's `allowedRedirectUris` array
3. Reads `accounts_session` cookie
4. If cookie missing → redirect to login
5. If cookie exists → verify JWT signature and expiry
6. Generate random authorization code (32 bytes, base64url)
7. Store code in `auth_codes` table with:
   - `userId` from token
   - `clientId` from query
   - `redirectUri` from query
   - `expiresAt` = now + 10 minutes
   - `isUsed` = false
8. Redirect user to `redirect_uri` with code in query string

---

### 8. POST `/oauth/token`

**Description:** Exchange authorization code for tokens. Called by **client app backends** (not browsers).

**Request Body:**
```json
{
  "code": "abc123xyz...",
  "client_id": "shelfscan",
  "client_secret": "secret-key-for-shelfscan",
  "redirect_uri": "https://shelfscan.com/callback",
  "grant_type": "authorization_code"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "id_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 86400 // 1 day in seconds
}
```

**Token Details:**

| Token | Purpose | Where to Store |
|-------|---------|----------------|
| `access_token` | API authorization | Client's cookie/localStorage |
| `refresh_token` | Get new access tokens | Client's HttpOnly cookie |
| `id_token` | User profile info | Decode and display, don't store |

**Error Responses:**

**400 - Missing Parameters:**
```json
{
  "success": false,
  "message": "Invalid token request",
  "error": "Required: code, client_id, client_secret, redirect_uri, grant_type=authorization_code"
}
```

**401 - Invalid Client Credentials:**
```json
{
  "success": false,
  "message": "Invalid client credentials",
  "error": "Client not found"
}
```

**401 - Wrong Client Secret:**
```json
{
  "success": false,
  "message": "Invalid client credentials",
  "error": "Client secret is incorrect"
}
```

**400 - Invalid Code:**
```json
{
  "success": false,
  "message": "Invalid authorization code",
  "error": "Code not found or does not belong to this client"
}
```

**400 - Code Already Used:**
```json
{
  "success": false,
  "message": "Authorization code already used",
  "error": "This code has been exchanged already"
}
```

**400 - Code Expired:**
```json
{
  "success": false,
  "message": "Authorization code expired",
  "error": "Code is no longer valid"
}
```

**400 - Redirect URI Mismatch:**
```json
{
  "success": false,
  "message": "Invalid redirect_uri",
  "error": "Redirect URI does not match the one used in authorization"
}
```

**Security Validations Performed:**

1. ✅ Verify `client_id` exists in database
2. ✅ Verify `client_secret` matches hashed version (bcrypt compare)
3. ✅ Verify auth code exists and belongs to this client
4. ✅ Check if code is already used (prevent replay attacks)
5. ✅ Check if code expired (10 min window)
6. ✅ Verify `redirect_uri` matches the one used in `/authorize`
7. ✅ Mark code as used immediately after validation
8. ✅ Generate fresh tokens for the user

---

## SSO Flow Examples

### Scenario 1: Cold Start (User NOT Logged In)

**Context:** User opens a fresh browser and visits `shelfscan.com` for the first time.

```
┌────────────────────────────────────────────────────────────────┐
│ Step 1: User Opens ShelfScan                                   │
└────────────────────────────────────────────────────────────────┘

User Browser → shelfscan.com/dashboard
                    │
                    ▼
ShelfScan Middleware: "No shelfscan_session cookie"
                    │
                    ▼
Redirect (302): accounts.shelfex.com/api/v1/oauth/authorize
                ?client_id=shelfscan
                &redirect_uri=https://shelfscan.com/callback
                &response_type=code

┌────────────────────────────────────────────────────────────────┐
│ Step 2: Accounts Checks for Session                            │
└────────────────────────────────────────────────────────────────┘

User Browser → accounts.shelfex.com/api/v1/oauth/authorize
                    │
                    ▼
OAuth Controller: Check cookies.accounts_session
                    │
                    ▼
                ❌ NOT FOUND
                    │
                    ▼
Redirect (302): /login
                ?client_id=shelfscan
                &redirect_uri=https://shelfscan.com/callback

┌────────────────────────────────────────────────────────────────┐
│ Step 3: User Sees Login Page                                   │
└────────────────────────────────────────────────────────────────┘

User Browser → accounts.shelfex.com/login?client_id=shelfscan...
                    │
                    ▼
Frontend: Renders login form
                    │
User enters:
  - identifier: "john@example.com"
  - password: "SecurePass123!"
                    │
                    ▼
POST /api/v1/auth/login
{
  "identifier": "john@example.com",
  "password": "SecurePass123!",
  "client_id": "shelfscan",
  "redirect_uri": "https://shelfscan.com/callback"
}

┌────────────────────────────────────────────────────────────────┐
│ Step 4: Login Success                                          │
└────────────────────────────────────────────────────────────────┘

Auth Controller:
  1. Validate credentials ✅
  2. Generate access_token
  3. Generate refresh_token
  4. Set cookies:
     - accounts_session (domain: .shelfex.com) ⭐
     - access_token
     - refresh_token
  5. Detect client_id exists
  6. Redirect to: /api/v1/oauth/authorize
                  ?client_id=shelfscan
                  &redirect_uri=https://shelfscan.com/callback
                  &response_type=code

┌────────────────────────────────────────────────────────────────┐
│ Step 5: OAuth Authorize (Retry)                                │
└────────────────────────────────────────────────────────────────┘

User Browser → accounts.shelfex.com/api/v1/oauth/authorize
               (now has accounts_session cookie!)
                    │
                    ▼
OAuth Controller: Check cookies.accounts_session
                    │
                    ▼
                ✅ FOUND
                    │
                    ▼
  1. Verify JWT signature ✅
  2. Extract userId from token
  3. Generate auth code: "xyz_abc_123"
  4. Store in database:
     - code: "xyz_abc_123"
     - userId: "user-id-from-token"
     - clientId: "shelfscan"
     - redirectUri: "https://shelfscan.com/callback"
     - expiresAt: now + 10 minutes
     - isUsed: false
  5. Redirect (302): https://shelfscan.com/callback?code=xyz_abc_123

┌────────────────────────────────────────────────────────────────┐
│ Step 6: ShelfScan Callback                                     │
└────────────────────────────────────────────────────────────────┘

User Browser → shelfscan.com/callback?code=xyz_abc_123
                    │
                    ▼
ShelfScan Backend:
  POST accounts.shelfex.com/api/v1/oauth/token
  {
    "code": "xyz_abc_123",
    "client_id": "shelfscan",
    "client_secret": "shelfscan-secret-key",
    "redirect_uri": "https://shelfscan.com/callback",
    "grant_type": "authorization_code"
  }
                    │
                    ▼
OAuth Token Controller:
  1. Validate client_id & client_secret ✅
  2. Find auth code in database ✅
  3. Verify code not used ✅
  4. Verify code not expired ✅
  5. Verify redirect_uri matches ✅
  6. Mark code as used
  7. Generate tokens:
     - access_token (userId, email, emailVerified)
     - refresh_token (userId, tokenId)
     - id_token (userId, email, name, emailVerified)
  8. Return tokens

ShelfScan Backend receives:
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "id_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 86400
}

ShelfScan Backend:
  1. Decode id_token to get user info
  2. Set shelfscan_session cookie
  3. Redirect user to /dashboard

┌────────────────────────────────────────────────────────────────┐
│ Step 7: User Sees Dashboard                                    │
└────────────────────────────────────────────────────────────────┘

User Browser → shelfscan.com/dashboard
               (has shelfscan_session cookie)
                    │
                    ▼
ShelfScan Middleware: Validates session ✅
                    │
                    ▼
Render Dashboard: "Welcome, John!"

✅ LOGIN COMPLETE
```

**Total Redirects:** 5
**Total Time:** ~2-3 seconds

---

### Scenario 2: SSO (User Already Logged In)

**Context:** User just finished logging into ShelfScan (Scenario 1). Now they open a new tab and visit `shelfmuse.com`.

```
┌────────────────────────────────────────────────────────────────┐
│ Step 1: User Opens ShelfMuse                                   │
└────────────────────────────────────────────────────────────────┘

User Browser → shelfmuse.com/dashboard
                    │
                    ▼
ShelfMuse Middleware: "No shelfmuse_session cookie"
                    │
                    ▼
Redirect (302): accounts.shelfex.com/api/v1/oauth/authorize
                ?client_id=shelfmuse
                &redirect_uri=https://shelfmuse.com/callback
                &response_type=code

┌────────────────────────────────────────────────────────────────┐
│ Step 2: Accounts Finds Existing Session (SSO Magic!)           │
└────────────────────────────────────────────────────────────────┘

User Browser → accounts.shelfex.com/api/v1/oauth/authorize
               (still has accounts_session cookie from earlier!)
                    │
                    ▼
OAuth Controller: Check cookies.accounts_session
                    │
                    ▼
                ✅ FOUND!
                    │
                    ▼
  1. Verify JWT ✅
  2. Extract userId
  3. ⚡ SKIP LOGIN SCREEN (user already authenticated)
  4. Generate new auth code: "muse_code_456"
  5. Store in database:
     - code: "muse_code_456"
     - clientId: "shelfmuse" (different app!)
     - redirectUri: "https://shelfmuse.com/callback"
  6. Redirect (302): https://shelfmuse.com/callback?code=muse_code_456

┌────────────────────────────────────────────────────────────────┐
│ Step 3: ShelfMuse Token Exchange                               │
└────────────────────────────────────────────────────────────────┘

ShelfMuse Backend:
  POST accounts.shelfex.com/api/v1/oauth/token
  {
    "code": "muse_code_456",
    "client_id": "shelfmuse",
    "client_secret": "shelfmuse-secret-key", // Different secret!
    "redirect_uri": "https://shelfmuse.com/callback",
    "grant_type": "authorization_code"
  }
                    │
                    ▼
OAuth Token Controller validates and returns tokens

ShelfMuse Backend:
  1. Decode id_token
  2. Set shelfmuse_session cookie
  3. Redirect to /dashboard

┌────────────────────────────────────────────────────────────────┐
│ Step 4: Instant Access!                                        │
└────────────────────────────────────────────────────────────────┘

User Browser → shelfmuse.com/dashboard
                    │
                    ▼
Render Dashboard: "Welcome, John!"

✅ SSO COMPLETE (No password prompt!)
```

**Total Redirects:** 3
**Total Time:** ~500ms (seamless!)

**Key Difference from Scenario 1:**
- ❌ NO login page shown
- ❌ NO password entry
- ✅ Instant authentication via `accounts_session` cookie

---

### Scenario 3: Local Session Only (Zombie Session)

**Context:** User is logged into ShelfScan. Their `accounts_session` cookie expired (or they cleared it), but `shelfscan_session` still exists.

```
┌────────────────────────────────────────────────────────────────┐
│ Step 1: User Revisits ShelfScan                                │
└────────────────────────────────────────────────────────────────┘

User Browser → shelfscan.com/dashboard
               Cookies:
                 - shelfscan_session ✅ (still valid)
                 - accounts_session ❌ (expired/deleted)
                    │
                    ▼
ShelfScan Middleware:
  1. Check shelfscan_session cookie ✅
  2. Validate JWT signature ✅
  3. Check expiry ✅
  4. Allow access (no need to contact accounts server!)
                    │
                    ▼
Render Dashboard: "Welcome, John!"

✅ ACCESS GRANTED (No network call to accounts.shelfex.com)
```

**Key Point:** Each client app can validate its own session tokens independently. The accounts server is only contacted when:
1. User has no local session
2. User's local session expired
3. User explicitly logs out

This is why it's called a "Zombie Session" - the local app session survives even if the global accounts session dies.

**What Happens When Zombie Session Expires?**

```
User Browser → shelfscan.com/dashboard
               shelfscan_session expired
                    │
                    ▼
ShelfScan Middleware: JWT expired ❌
                    │
                    ▼
Redirect: accounts.shelfex.com/api/v1/oauth/authorize
          (restarts Scenario 1 or 2 depending on accounts_session)
```

---

## Token Management

### Token Validation Priority

The auth middleware checks tokens in this order:

```typescript
// 1. Check cookies first (browser requests)
if (req.cookies?.access_token) {
  token = req.cookies.access_token;
}
// 2. Check Authorization header (API clients)
else if (req.headers.authorization?.startsWith('Bearer ')) {
  token = req.headers.authorization.substring(7);
}
```

### Token Refresh Flow

When an access token expires, clients should use the refresh token:

```
Client App:
  POST accounts.shelfex.com/api/v1/auth/refresh
  Cookie: refresh_token=eyJhbGci...
                    │
                    ▼
Accounts Server:
  1. Read refresh_token from cookie
  2. Hash token with SHA256
  3. Find hashed token in database
  4. Check if revoked ❌
  5. Check if expired ❌
  6. Get user from database
  7. Generate NEW access_token
  8. Update lastUsedAt timestamp
  9. Return new access_token
                    │
                    ▼
Client App:
  - Update access_token cookie
  - Retry original request with new token
```

**Refresh Token Rotation (Optional Enhancement):**

For maximum security, implement refresh token rotation:
1. On each refresh, issue a NEW refresh token
2. Revoke the OLD refresh token
3. Store token family ID to detect theft

---

## Security Features

### 1. Password Security
- **Bcrypt hashing** with 12 salt rounds
- Passwords never stored in plain text
- Bcrypt automatically handles salts

### 2. Token Security
- **JWT signatures** prevent tampering
- **Short-lived access tokens** (1 day) limit exposure
- **Refresh tokens hashed** before storage (SHA256)
- **HttpOnly cookies** prevent XSS attacks
- **SameSite=lax** prevents CSRF attacks

### 3. OAuth Security
- **Authorization codes** expire in 10 minutes
- **One-time use** codes (marked as used)
- **Redirect URI validation** prevents code interception
- **Client secret verification** (bcrypt)
- **State parameter** support for CSRF protection

### 4. Database Security
- **Foreign key constraints** with cascade delete
- **Unique constraints** on tokens/codes
- **Indexed fields** for performance
- **Prepared statements** via Drizzle (SQL injection prevention)

### 5. Cookie Security
```typescript
res.cookie('access_token', token, {
  httpOnly: true,        // JavaScript cannot access
  secure: isProduction,  // HTTPS only in production
  sameSite: 'lax',       // CSRF protection
  domain: '.shelfex.com', // Cross-subdomain (SSO cookie)
  maxAge: 86400000       // 1 day
});
```

### 6. Email Verification (Optional)

Control via environment variable:
```env
EMAIL_VERIFICATION_REQUIRED=false
```

When enabled:
- Unverified users get `403 Forbidden` on protected routes
- Middleware checks `emailVerified` field in JWT

---

## Configuration

### Environment Variables

```env
# Server
NODE_ENV=development
PORT=8000

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# CORS
CORS_ORIGIN=http://localhost:3000

# JWT Secrets (Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
ACCESS_TOKEN_SECRET=your-secret-key-here
REFRESH_TOKEN_SECRET=your-secret-key-here

# Email Verification
EMAIL_VERIFICATION_REQUIRED=false

# Cookie Domain (use .shelfex.com in production for SSO)
COOKIE_DOMAIN=localhost
```

### Generating Secure Secrets

```bash
# Generate a random 512-bit secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Output example:
```
a3f7c8e9d2b4f6a1c8e7d3b9f2a6c4e8d1b7f9a2c5e8d4b1f7a9c3e6d2b8f4a7c9e1d5b3f8a6c2e9d7b4f1a8c5e3d9b6f2a7c4e1d8b5f9a3c7e2d6b1f4a9c8e5d3b7
```

### Production Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong, unique secrets for `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET`
- [ ] Set `COOKIE_DOMAIN=.shelfex.com` for cross-subdomain cookies
- [ ] Enable HTTPS (`secure: true` in cookies)
- [ ] Set up SSL certificates
- [ ] Configure CORS properly (whitelist specific origins)
- [ ] Enable email verification (`EMAIL_VERIFICATION_REQUIRED=true`)
- [ ] Implement rate limiting (e.g., express-rate-limit)
- [ ] Set up monitoring and logging
- [ ] Backup database regularly
- [ ] Rotate secrets periodically

---

## Client App Integration Guide

### For ShelfScan, ShelfMuse, etc.

#### Step 1: Register Client App

Insert into `client_apps` table:

```sql
INSERT INTO client_apps (client_id, client_secret, name, allowed_redirect_uris)
VALUES (
  'shelfscan',
  '$2b$12$hashed_secret_here', -- bcrypt hash of actual secret
  'ShelfScan',
  '["http://localhost:3001/callback", "https://shelfscan.com/callback"]'::json
);
```

#### Step 2: Client Middleware (Detect Unauthenticated Users)

```typescript
// shelfscan backend
app.use((req, res, next) => {
  if (!req.cookies.shelfscan_session) {
    // No local session - redirect to accounts
    const authorizeUrl = new URL('https://accounts.shelfex.com/api/v1/oauth/authorize');
    authorizeUrl.searchParams.set('client_id', 'shelfscan');
    authorizeUrl.searchParams.set('redirect_uri', 'https://shelfscan.com/callback');
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('state', generateRandomState()); // CSRF protection
    
    return res.redirect(authorizeUrl.toString());
  }
  next();
});
```

#### Step 3: Callback Handler (Exchange Code for Tokens)

```typescript
// shelfscan backend
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state (CSRF protection)
  if (!verifyState(state)) {
    return res.status(400).send('Invalid state');
  }
  
  // Exchange code for tokens
  const response = await fetch('https://accounts.shelfex.com/api/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: 'shelfscan',
      client_secret: process.env.SHELFSCAN_CLIENT_SECRET,
      redirect_uri: 'https://shelfscan.com/callback',
      grant_type: 'authorization_code'
    })
  });
  
  const tokens = await response.json();
  
  // Decode ID token to get user info
  const userInfo = jwt.decode(tokens.id_token);
  console.log('User:', userInfo); // { userId, email, name, emailVerified }
  
  // Set local session cookie
  res.cookie('shelfscan_session', tokens.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 86400000 // 1 day
  });
  
  // Store refresh token securely
  res.cookie('shelfscan_refresh', tokens.refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 2592000000 // 30 days
  });
  
  // Redirect to dashboard
  res.redirect('/dashboard');
});
```

#### Step 4: Token Refresh

```typescript
// shelfscan backend
async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://accounts.shelfex.com/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  
  const { data } = await response.json();
  return data.accessToken;
}
```

---

## Troubleshooting

### Common Issues

#### 1. "Invalid client_id" Error

**Cause:** Client app not registered in database.

**Solution:**
```sql
SELECT * FROM client_apps WHERE client_id = 'your-client-id';
```

If empty, insert the client app.

---

#### 2. "Invalid redirect_uri" Error

**Cause:** Redirect URI not in `allowedRedirectUris` array.

**Solution:**
```sql
UPDATE client_apps
SET allowed_redirect_uris = '["http://localhost:3001/callback", "https://yourapp.com/callback"]'::json
WHERE client_id = 'your-client-id';
```

---

#### 3. "Authorization code expired" Error

**Cause:** Code took more than 10 minutes to exchange.

**Solution:** Ensure client app exchanges codes immediately after receiving them.

---

#### 4. "Authorization code already used" Error

**Cause:** Code was exchanged twice (possible replay attack).

**Solution:** This is expected behavior. Each code can only be used once. Request a new code by restarting the OAuth flow.

---

#### 5. Cookies Not Working in Development

**Cause:** Browser blocking cross-site cookies.

**Temporary Solution (Dev Only):**
```typescript
// Set sameSite: 'none' and secure: false for local development
res.cookie('accounts_session', token, {
  httpOnly: true,
  secure: false, // Allow HTTP in dev
  sameSite: 'none' // Allow cross-site
});
```

**Production Solution:** Use same domain (e.g., `accounts.shelfex.com` and `app.shelfex.com`).

---

#### 6. "Client secret is incorrect" Error

**Cause:** Plain text secret sent instead of hashed version, or wrong secret.

**Check:**
```typescript
// Correct: Send plain text secret (backend hashes it for comparison)
client_secret: "my-secret-key"

// Wrong: Sending bcrypt hash
client_secret: "$2b$12$..."
```

---

## Database Maintenance

### Cleanup Expired Codes

Run periodically (e.g., daily cron job):

```sql
DELETE FROM auth_codes
WHERE expires_at < NOW();
```

### Cleanup Revoked Tokens

```sql
DELETE FROM refresh_tokens
WHERE is_revoked = true
  AND created_at < NOW() - INTERVAL '30 days';
```

### Monitor Active Sessions

```sql
SELECT
  u.email,
  COUNT(rt.id) as active_sessions,
  MAX(rt.last_used_at) as last_activity
FROM users u
LEFT JOIN refresh_tokens rt ON u.id = rt.user_id
WHERE rt.is_revoked = false
  AND rt.expires_at > NOW()
GROUP BY u.id, u.email
ORDER BY last_activity DESC;
```

---

## API Testing with cURL

### 1. Register User

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "SecurePass123!",
    "name": "Test User"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "identifier": "test@example.com",
    "password": "SecurePass123!"
  }'
```

### 3. Get Current User (with Cookie)

```bash
curl -X GET http://localhost:8000/api/v1/auth/me \
  -b cookies.txt
```

### 4. Get Current User (with Header)

```bash
curl -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

### 5. Refresh Token

```bash
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -b cookies.txt \
  -c cookies.txt
```

### 6. OAuth Authorize (Manual Test)

```bash
curl -X GET "http://localhost:8000/api/v1/oauth/authorize?client_id=shelfscan&redirect_uri=http://localhost:3001/callback&response_type=code" \
  -b cookies.txt \
  -L # Follow redirects
```

### 7. OAuth Token Exchange

```bash
curl -X POST http://localhost:8000/api/v1/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "code": "YOUR_AUTH_CODE_HERE",
    "client_id": "shelfscan",
    "client_secret": "shelfscan-secret",
    "redirect_uri": "http://localhost:3001/callback",
    "grant_type": "authorization_code"
  }'
```

---

## Architecture Decisions

### Why OAuth 2.0 Authorization Code Flow?

**Alternatives Considered:**
1. **Implicit Flow** - Tokens in URL (insecure)
2. **Password Grant** - Client apps see user passwords (bad)
3. **Client Credentials** - No user context

**Why Authorization Code:**
- ✅ Most secure for server-side apps
- ✅ Client never sees user password
- ✅ Tokens never exposed in URL
- ✅ Supports refresh tokens
- ✅ Industry standard (Google, GitHub, Auth0)

### Why Separate Access + Refresh Tokens?

**Alternatives Considered:**
1. **Single long-lived token** - If leaked, valid for 30 days
2. **Session IDs in database** - Requires DB lookup on every request

**Why Dual Tokens:**
- ✅ Access token short-lived (1 day) - limits damage if leaked
- ✅ Refresh token rarely used - can be revoked
- ✅ Stateless access tokens - no DB lookup needed
- ✅ Can revoke all sessions by clearing refresh tokens

### Why Hash Refresh Tokens in Database?

**If leaked:** Attacker can't use database dump to impersonate users.

**Trade-off:** Slightly slower token validation (SHA256 hash on each refresh).

### Why `accounts_session` Cookie?

**Enables SSO:** When user visits new app, accounts server can detect existing login without password prompt.

**Domain Strategy:**
- Set `domain: .shelfex.com`
- Cookie accessible on `accounts.shelfex.com`, `shelfscan.shelfex.com`, `shelfmuse.shelfex.com`

---

## Performance Considerations

### Database Indexes

All critical fields are indexed:
- `users.email` (login lookups)
- `users.username` (login lookups)
- `refresh_tokens.token_hash` (refresh validation)
- `refresh_tokens.user_id` (user session queries)
- `auth_codes.code` (OAuth code validation)
- `client_apps.client_id` (OAuth client validation)

### Token Validation

Access tokens are **stateless JWTs**:
- No database lookup on every request
- Only signature verification (fast)
- Trade-off: Can't revoke immediately (wait for expiry)

Refresh tokens require **database lookup**:
- Check if revoked
- Check if expired
- Update `lastUsedAt`

### Caching Opportunities

**Client Apps:** Load once, cache in memory (rarely change).

```typescript
// Example: In-memory cache
const clientCache = new Map();

async function getClient(clientId) {
  if (clientCache.has(clientId)) {
    return clientCache.get(clientId);
  }
  
  const client = await db.query.clientApps.findFirst({
    where: eq(clientApps.clientId, clientId)
  });
  
  clientCache.set(clientId, client);
  return client;
}
```

---

## Future Enhancements

### 1. Email Verification
- Send verification email on registration
- `POST /auth/verify-email?token=xyz`
- Update `emailVerified` field

### 2. Password Reset
- `POST /auth/forgot-password` - Send reset email
- `POST /auth/reset-password` - Update password with token

### 3. Two-Factor Authentication (2FA)
- TOTP (Time-based One-Time Password)
- SMS codes
- Backup codes

### 4. OAuth Scopes
- Fine-grained permissions (e.g., `read:profile`, `write:data`)
- Store in `auth_codes` table
- Return in ID token

### 5. Refresh Token Rotation
- Issue new refresh token on each use
- Revoke old refresh token
- Detect token theft

### 6. Rate Limiting
- Prevent brute force attacks on `/login`
- Limit token exchange attempts
- Use `express-rate-limit`

### 7. Audit Logs
- Track all login attempts
- Record token usage
- Monitor suspicious activity

### 8. Social Login
- "Login with Google"
- "Login with GitHub"
- Federated identity

---

## Conclusion

This authentication system provides **enterprise-grade security** with **seamless user experience**. The OAuth 2.0 flow ensures passwords never leave the accounts service, while the SSO cookie enables instant authentication across all Shelfex products.

**Key Takeaways:**
- 🔒 **Secure** - Hashed passwords, signed JWTs, one-time codes
- ⚡ **Fast** - Stateless access tokens, indexed database, SSO cookies
- 🎯 **Scalable** - Supports unlimited client apps, horizontal scaling
- 🛠️ **Maintainable** - TypeScript, Drizzle ORM, clear separation of concerns

For questions or contributions, please open an issue on GitHub.

---

**Built with ❤️ by the Shelfex Team**
