# Shelfex Accounts Frontend

This is the frontend application for the Shelfex centralized authentication system. It provides the user interface for login, registration, and OAuth 2.0 Single Sign-On flows.

## Tech Stack

- **Next.js 16.0.7** (App Router)
- **React 19.2.0**
- **TypeScript 5**
- **Axios 1.13.2** (API client with credentials support)
- **TailwindCSS 4** (minimal usage, inline styles for simplicity)

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx              # Homepage with navigation and OAuth test link
│   ├── login/
│   │   └── page.tsx          # Login page with OAuth context support
│   ├── register/
│   │   └── page.tsx          # User registration page
│   ├── dashboard/
│   │   └── page.tsx          # Protected route example (requires auth)
│   └── callback/
│       └── page.tsx          # OAuth callback handler (displays auth code)
├── lib/
│   ├── axios.ts              # Axios instance with withCredentials
│   └── api.ts                # Typed API client (authApi, oauthApi)
├── .env.local                # Environment variables
└── package.json
```

## Environment Variables

Create a `.env.local` file in the frontend root:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

**Production:**
```bash
NEXT_PUBLIC_API_URL=https://api.shelfex.com/api/v1
```

## Installation

```bash
cd frontend
npm install
```

## Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## Pages Overview

### 1. Homepage (`/`)
- Landing page with navigation
- Links to Login, Register, and Dashboard
- OAuth test link to initiate SSO flow with ShelfScan
- Displays test credentials for development

### 2. Login (`/login`)
- Email/username + password login
- Supports OAuth context via query parameters:
  - `client_id`: OAuth client identifier
  - `redirect_uri`: Where to redirect after login
  - `state`: CSRF protection token
- If OAuth params present, displays client app info
- Redirects to backend OAuth flow on successful login
- Sets cookies: `access_token`, `refresh_token`, `accounts_session`

**OAuth Login URL Example:**
```
http://localhost:3000/login?client_id=shelfscan&redirect_uri=http://localhost:3000/callback&state=random_state_123
```

### 3. Register (`/register`)
- Email (required)
- Username (optional)
- Password (required)
- Name (optional)
- Redirects to login page on success

### 4. Dashboard (`/dashboard`)
- Protected route example
- Displays user profile information
- Fetches `/auth/me` on mount
- Redirects to `/login` if not authenticated
- Logout button (revokes refresh token)

### 5. Callback (`/callback`)
- OAuth callback handler
- Displays authorization code received from backend
- Shows state parameter for CSRF verification
- Explains next steps in OAuth flow
- In production, client apps would parse this and exchange code for tokens

## API Client (`lib/api.ts`)

### Auth API

```typescript
// Register new user
const response = await authApi.register({
  email: 'user@example.com',
  username: 'myusername', // optional
  password: 'securepass',
  name: 'John Doe' // optional
});

// Login
const response = await authApi.login({
  identifier: 'user@example.com', // or username
  password: 'securepass',
  // Optional OAuth params
  client_id: 'shelfscan',
  redirect_uri: 'http://localhost:3000/callback',
  state: 'random_state'
});

// Get current user (requires auth)
const user = await authApi.getCurrentUser();

// Logout
await authApi.logout();

// Refresh access token
const response = await authApi.refresh();
```

### OAuth API

```typescript
// Get login page data with OAuth context
const data = await oauthApi.getLoginPageData({
  client_id: 'shelfscan',
  redirect_uri: 'http://localhost:3000/callback',
  response_type: 'code',
  state: 'random_state'
});
```

## Authentication Flow

### Standard Login Flow

1. User visits `/login`
2. Enters email/username + password
3. Frontend calls `POST /auth/login`
4. Backend sets cookies: `access_token`, `refresh_token`, `accounts_session`
5. Frontend redirects to `/dashboard`

### OAuth SSO Flow (3 Scenarios)

#### Scenario 1: Cold Start (Not Logged In)

1. User visits ShelfScan: `https://devshelfscan.shelfexecution.com`
2. User clicks "Login"
3. ShelfScan redirects to:
   ```
   http://localhost:8000/api/v1/oauth/authorize?client_id=shelfscan&redirect_uri=http://localhost:3000/callback&response_type=code&state=abc123
   ```
4. Backend checks `accounts_session` cookie → **Not found**
5. Backend redirects to:
   ```
   http://localhost:3000/login?client_id=shelfscan&redirect_uri=http://localhost:3000/callback&state=abc123
   ```
6. User enters credentials on `/login`
7. Frontend calls `POST /auth/login` with OAuth params
8. Backend sets cookies and redirects to:
   ```
   http://localhost:3000/callback?code=xyz789&state=abc123
   ```
9. Callback page displays auth code
10. ShelfScan backend exchanges code for tokens via `POST /oauth/token`

#### Scenario 2: SSO Magic (Already Logged In)

1. User already logged into accounts.shelfex.com (has `accounts_session` cookie)
2. User visits ShelfMuse: `https://dev.shelfmuse.tech`
3. User clicks "Login"
4. ShelfMuse redirects to OAuth authorize endpoint
5. Backend checks `accounts_session` → **Valid session found**
6. Backend generates auth code instantly
7. Backend redirects to:
   ```
   http://localhost:3000/callback?code=xyz789&state=def456
   ```
8. **No login page shown** - seamless SSO!

#### Scenario 3: Zombie Session (Access Token Expired, Refresh Token Valid)

1. User's `access_token` expired (1 day passed)
2. User's `refresh_token` still valid (within 30 days)
3. User's `accounts_session` cookie still valid
4. User visits ShelfIntel
5. Backend checks `accounts_session` → **Found but access token expired**
6. Backend auto-generates new auth code using session
7. ShelfIntel backend exchanges code for new tokens
8. User authenticated without login prompt

## Cookie Management

The frontend automatically sends cookies with every request via `withCredentials: true` in Axios.

### Cookies Set by Backend

| Cookie | Domain | HttpOnly | SameSite | Expiry | Purpose |
|--------|--------|----------|----------|--------|---------|
| `accounts_session` | `.shelfex.com` | Yes | Lax | 30 days | Global SSO session |
| `access_token` | `accounts.shelfex.com` | Yes | Lax | 1 day | API authorization |
| `refresh_token` | `accounts.shelfex.com` | Yes | Lax | 30 days | Token refresh |

### Production Cookie Domain

In production, set `COOKIE_DOMAIN` in backend `.env`:
```bash
COOKIE_DOMAIN=.shelfex.com
```

This allows `accounts_session` to work across:
- accounts.shelfex.com
- devshelfscan.shelfexecution.com
- dev.shelfmuse.tech

## Security Best Practices

### 1. **Credentials Management**
- ✅ All API requests use `withCredentials: true`
- ✅ Cookies are HttpOnly (not accessible via JavaScript)
- ✅ SameSite=Lax prevents CSRF attacks
- ✅ Secure flag set in production (HTTPS only)

### 2. **Token Storage**
- ✅ Tokens stored in HttpOnly cookies (not localStorage)
- ✅ Access token: 1 day expiry
- ✅ Refresh token: 30 days expiry with rotation
- ✅ Refresh tokens can be revoked

### 3. **OAuth Security**
- ✅ State parameter for CSRF protection
- ✅ Authorization codes are one-time use
- ✅ Auth codes expire in 10 minutes
- ✅ Client secrets verified with bcrypt

### 4. **Password Security**
- ✅ Passwords hashed with bcrypt (12 rounds)
- ✅ Minimum password length enforced on backend
- ✅ Passwords never stored in plain text

### 5. **Protected Routes**
- ✅ Dashboard checks auth on mount
- ✅ Redirects to login if not authenticated
- ✅ Uses `/auth/me` endpoint to verify session

## Testing the SSO Flow

### Prerequisites
1. Backend running on `http://localhost:8000`
2. Frontend running on `http://localhost:3000`
3. Database seeded with test user and client apps

### Test Steps

1. **Start both servers:**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev

   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

2. **Test Standard Login:**
   - Visit: `http://localhost:3000/login`
   - Enter: `test@shelfex.com` / `12345`
   - Should redirect to homepage or dashboard
   - Check cookies in DevTools (Application → Cookies)

3. **Test OAuth Flow:**
   - Visit: `http://localhost:3000`
   - Click "Test ShelfScan Login" link
   - Should redirect to login page with OAuth context
   - Login with test credentials
   - Should redirect to callback page with auth code

4. **Test SSO (Already Logged In):**
   - Complete step 3 above (now logged in)
   - Click "Test ShelfScan Login" again
   - **Should skip login page** and go straight to callback

5. **Test Protected Route:**
   - Visit: `http://localhost:3000/dashboard`
   - If not logged in, redirects to login
   - If logged in, displays user profile

6. **Test Logout:**
   - Go to dashboard
   - Click "Logout"
   - Should revoke refresh token
   - Redirects to login

## Troubleshooting

### Issue: "Network Error" on API calls

**Solution:**
- Ensure backend is running on port 8000
- Check `NEXT_PUBLIC_API_URL` in `.env.local`
- Verify CORS is enabled on backend

### Issue: Cookies not being sent

**Solution:**
- Check `withCredentials: true` in `lib/axios.ts`
- Ensure backend allows credentials in CORS config
- In production, verify `COOKIE_DOMAIN` matches your domain structure

### Issue: OAuth redirect not working

**Solution:**
- Check `allowedRedirectUris` in `clientApps` table
- Verify `client_id` matches database
- Ensure `redirect_uri` is URL-encoded
- Check backend logs for validation errors

### Issue: Dashboard redirects to login even when logged in

**Solution:**
- Check if `access_token` cookie is set
- Verify token hasn't expired (1 day)
- Try refreshing with `/auth/refresh` endpoint
- Check browser console for error messages

### Issue: "Invalid client" error

**Solution:**
- Verify `client_id` exists in `clientApps` table
- Check if client is active (not disabled)
- Run `npm run db:seed` in backend to recreate clients

## Production Deployment

### Environment Variables

```bash
NEXT_PUBLIC_API_URL=https://api.shelfex.com/api/v1
```

### Build

```bash
npm run build
npm run start
```

### Considerations

1. **Domain Setup:**
   - Frontend: `accounts.shelfex.com`
   - Backend: `api.shelfex.com`
   - Set `COOKIE_DOMAIN=.shelfex.com` on backend

2. **HTTPS Required:**
   - Secure cookies require HTTPS
   - Use a reverse proxy (Nginx, Caddy)
   - Enable SSL certificates

3. **CORS Configuration:**
   - Update backend `ALLOWED_ORIGINS` to include production domains:
     ```
     ALLOWED_ORIGINS=https://accounts.shelfex.com,https://devshelfscan.shelfexecution.com,https://dev.shelfmuse.tech
     ```

4. **Redirect URIs:**
   - Update `allowedRedirectUris` in database for each client app
   - Use production domains instead of localhost

## Client App Integration

When building client apps (ShelfScan, ShelfMuse, etc.), follow this pattern:

### 1. Initiate OAuth Flow (Frontend)

```typescript
const loginUrl = `https://api.shelfex.com/api/v1/oauth/authorize?client_id=shelfscan&redirect_uri=${encodeURIComponent('https://devshelfscan.shelfexecution.com/callback')}&response_type=code&state=${generateRandomState()}`;

window.location.href = loginUrl;
```

### 2. Handle Callback (Backend)

```typescript
// In your /callback route handler
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state matches what you sent
  if (!verifyState(state)) {
    return res.status(400).send('Invalid state');
  }
  
  // Exchange code for tokens
  const response = await axios.post('https://api.shelfex.com/api/v1/oauth/token', {
    grant_type: 'authorization_code',
    code,
    redirect_uri: 'https://devshelfscan.shelfexecution.com/callback',
    client_id: 'shelfscan',
    client_secret: process.env.CLIENT_SECRET
  });
  
  const { access_token, refresh_token, id_token } = response.data;
  
  // Decode id_token to get user info
  const user = jwt.decode(id_token);
  
  // Create session for user in your app
  req.session.userId = user.sub;
  req.session.accessToken = access_token;
  req.session.refreshToken = refresh_token;
  
  res.redirect('/dashboard');
});
```

### 3. Use Access Token

```typescript
// Make authenticated requests to your backend
app.get('/api/protected', authenticateUser, async (req, res) => {
  // Access token is available in session
  const accessToken = req.session.accessToken;
  
  // Optional: Verify token with accounts backend
  const userInfo = await axios.get('https://api.shelfex.com/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  res.json({ user: userInfo.data });
});
```

### 4. Refresh Tokens

```typescript
async function refreshAccessToken(refreshToken: string) {
  const response = await axios.post('https://api.shelfex.com/api/v1/auth/refresh', 
    {}, 
    {
      headers: { Cookie: `refresh_token=${refreshToken}` }
    }
  );
  
  return response.data.accessToken;
}
```

## Test Credentials

**Email:** test@shelfex.com  
**Username:** testuser  
**Password:** 12345

**Client Apps:**
- **ShelfScan:** `client_id=shelfscan`, `client_secret=shelfscan-dev-secret-2025`
- **ShelfMuse:** `client_id=shelfmuse`, `client_secret=shelfmuse-dev-secret-2025`
- **ShelfIntel:** `client_id=shelfintel`, `client_secret=shelfintel-dev-secret-2025`

## Further Reading

- [Backend README](../backend/README.md) - Complete API documentation
- [OAuth 2.0 Spec](https://tools.ietf.org/html/rfc6749)
- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [Axios Documentation](https://axios-http.com/docs/intro)
