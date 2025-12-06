# Testing Guide - Shelfex Accounts

Quick reference guide for testing the complete OAuth 2.0 SSO system.

## Prerequisites

### 1. Database Setup
```bash
cd backend
npm run db:seed
```

**Expected Output:**
```
✓ Test user created: test@shelfex.com
✓ Client apps created: shelfscan, shelfmuse, shelfintel
```

### 2. Start Backend
```bash
cd backend
npm run dev
```

**Expected Output:**
```
Server running on http://localhost:8000
```

### 3. Start Frontend
```bash
cd frontend
npm run dev
```

**Expected Output:**
```
Local: http://localhost:3000
```

## Test Scenarios

### Scenario 1: Standard Login/Logout

#### Steps:
1. Visit: `http://localhost:3000`
2. Click "Login"
3. Enter credentials:
   - **Email:** test@shelfex.com
   - **Password:** 12345
4. Click "Login" button
5. Should redirect to homepage
6. Click "Dashboard (Protected)"
7. Should see user profile
8. Click "Logout"
9. Should redirect to login

#### Expected Results:
- ✅ Login successful without errors
- ✅ Dashboard shows user info: email, username, name
- ✅ Cookies set: `access_token`, `refresh_token`, `accounts_session`
- ✅ Logout clears session and redirects

#### What to Check:
```
DevTools → Application → Cookies → http://localhost:3000
- access_token (HttpOnly, 1 day expiry)
- refresh_token (HttpOnly, 30 days expiry)
- accounts_session (HttpOnly, 30 days expiry)
```

---

### Scenario 2: OAuth Flow - Cold Start

Simulates user logging into ShelfScan for the first time (not logged into accounts).

#### Steps:
1. **Clear cookies** (important for fresh start)
   - DevTools → Application → Cookies → Clear all
2. Visit: `http://localhost:3000`
3. Click "Test ShelfScan Login" link
4. Should redirect to login page with OAuth context:
   ```
   http://localhost:3000/login?client_id=shelfscan&redirect_uri=http://localhost:3000/callback&...
   ```
5. Notice the blue info box showing OAuth context
6. Enter credentials: test@shelfex.com / 12345
7. Click "Login"
8. Should redirect to callback page with authorization code
9. Note the auth code displayed

#### Expected Results:
- ✅ Login page shows OAuth context: "You are logging in to ShelfScan"
- ✅ After login, redirected to callback with auth code in URL
- ✅ Callback page displays:
   - Authorization code (long base64url string)
   - State parameter (if provided)
   - Next steps explanation
- ✅ All three cookies are set

#### What to Check:
```
URL after login should be:
http://localhost:3000/callback?code=ABC123XYZ...&state=...

Backend logs should show:
POST /api/v1/auth/login → 200 OK
User authenticated: test@shelfex.com
```

---

### Scenario 3: OAuth Flow - SSO Magic

Simulates user already logged into accounts, then logging into ShelfMuse (seamless SSO).

#### Steps:
1. **First, login via standard flow** (Scenario 1) or **complete Scenario 2**
   - This sets the `accounts_session` cookie
2. Visit: `http://localhost:3000`
3. Click "Test ShelfScan Login" again
4. **MAGIC:** Should bypass login page entirely
5. Should go straight to callback page with new auth code

#### Expected Results:
- ✅ **NO login page shown** - direct redirect to callback
- ✅ New authorization code generated
- ✅ State parameter preserved (if provided)
- ✅ User never prompted for password

#### What to Check:
```
Backend logs should show:
GET /api/v1/oauth/authorize
Session cookie found: user already authenticated
Generating auth code...
Redirecting to callback

Network tab:
1. GET /oauth/authorize → 302 Found (immediate redirect)
2. GET /callback?code=... (no login page in between)
```

---

### Scenario 4: Protected Route (Unauthenticated)

Tests that protected routes correctly redirect to login.

#### Steps:
1. **Clear all cookies** (or use incognito mode)
2. Visit: `http://localhost:3000/dashboard`
3. Should redirect to login page

#### Expected Results:
- ✅ Immediate redirect to `/login`
- ✅ Console shows: "Failed to fetch user"
- ✅ No user profile displayed

---

### Scenario 5: Protected Route (Authenticated)

Tests that authenticated users can access protected routes.

#### Steps:
1. Login via standard flow (Scenario 1)
2. Visit: `http://localhost:3000/dashboard`
3. Should display user profile

#### Expected Results:
- ✅ Dashboard loads without redirect
- ✅ User profile displayed with all fields
- ✅ No console errors

---

### Scenario 6: Token Refresh (Advanced)

Tests automatic token refresh when access token expires.

#### Setup:
1. Edit `backend/src/utils/jwt.ts`:
   ```typescript
   // Temporarily change access token expiry to 10 seconds
   expiresIn: '10s' // instead of '1d'
   ```
2. Restart backend

#### Steps:
1. Login via standard flow
2. Wait 11 seconds
3. Visit: `http://localhost:3000/dashboard`
4. Should either:
   - Auto-refresh and display profile (if refresh logic implemented)
   - Or redirect to login (if access token expired and no refresh)

#### Expected Results:
- Access token expires after 10 seconds
- Refresh token still valid (30 days)
- Either auto-refresh works or user must re-login

**Note:** Full auto-refresh requires additional frontend logic. Current implementation will redirect to login after access token expires.

---

### Scenario 7: Registration

Tests user registration flow.

#### Steps:
1. Visit: `http://localhost:3000/register`
2. Fill in form:
   - **Email:** newuser@shelfex.com
   - **Username:** newuser
   - **Password:** securepass123
   - **Name:** New User
3. Click "Register"
4. Should redirect to login page
5. Login with new credentials

#### Expected Results:
- ✅ Registration successful
- ✅ Redirect to login page
- ✅ Can login with new credentials
- ✅ New user in database

#### Verify in Database:
```bash
cd backend
npm run db:studio
# Check users table for new user
```

---

## Common Issues & Solutions

### Issue: "Network Error" on login

**Cause:** Backend not running or wrong API URL

**Solution:**
```bash
# Check backend is running
curl http://localhost:8000/api/v1/auth/me

# Check frontend .env.local
cat frontend/.env.local
# Should show: NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

---

### Issue: Cookies not being set

**Cause:** CORS configuration issue

**Solution:**
```typescript
// backend/src/app.ts
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
```

```typescript
// frontend/lib/axios.ts
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true // Must be true
});
```

---

### Issue: Dashboard always redirects to login

**Cause:** Access token cookie not found or expired

**Solution:**
1. Check cookies in DevTools
2. Verify token hasn't expired (1 day default)
3. Check backend logs for JWT verification errors
4. Try logging in again

---

### Issue: OAuth redirect shows "Invalid client"

**Cause:** Client app not in database or wrong client_id

**Solution:**
```bash
cd backend
npm run db:seed

# Verify clients exist
npm run db:studio
# Check clientApps table for: shelfscan, shelfmuse, shelfintel
```

---

### Issue: State parameter not matching

**Cause:** State validation issue (CSRF protection)

**Note:** Current implementation passes state through but doesn't validate. For production:

```typescript
// Client app should:
1. Generate random state: const state = crypto.randomBytes(32).toString('hex')
2. Store in session: req.session.oauthState = state
3. Pass to OAuth: ?state=${state}
4. Verify in callback: if (req.query.state !== req.session.oauthState) throw error
```

---

## API Testing with cURL

### Register User
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "curl@shelfex.com",
    "username": "curluser",
    "password": "curlpass123",
    "name": "cURL User"
  }'
```

### Login
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "identifier": "test@shelfex.com",
    "password": "12345"
  }'
```

### Get Current User
```bash
curl -X GET http://localhost:8000/api/v1/auth/me \
  -b cookies.txt
```

### OAuth Authorize (with existing session)
```bash
curl -X GET "http://localhost:8000/api/v1/oauth/authorize?client_id=shelfscan&redirect_uri=http://localhost:3000/callback&response_type=code&state=test123" \
  -b cookies.txt \
  -L
```

### Exchange Code for Tokens
```bash
curl -X POST http://localhost:8000/api/v1/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "YOUR_AUTH_CODE_HERE",
    "redirect_uri": "http://localhost:3000/callback",
    "client_id": "shelfscan",
    "client_secret": "shelfscan-dev-secret-2025"
  }'
```

### Refresh Token
```bash
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -b cookies.txt
```

### Logout
```bash
curl -X POST http://localhost:8000/api/v1/auth/logout \
  -b cookies.txt
```

---

## Performance Checklist

- [ ] Backend responds within 200ms for auth endpoints
- [ ] Frontend loads in under 2 seconds
- [ ] OAuth redirect happens instantly (< 500ms)
- [ ] Database queries use indexed columns (email, username, code)
- [ ] JWT verification is fast (no database lookups for access tokens)
- [ ] Cookies are HttpOnly (check in DevTools)
- [ ] HTTPS in production (Secure flag on cookies)

---

## Security Checklist

- [ ] Passwords hashed with bcrypt (12 rounds)
- [ ] JWTs signed with secure secret (min 32 chars)
- [ ] Cookies are HttpOnly (not accessible via JS)
- [ ] SameSite=Lax on all cookies
- [ ] Secure flag in production (HTTPS only)
- [ ] Authorization codes are one-time use
- [ ] Auth codes expire in 10 minutes
- [ ] Client secrets verified with bcrypt
- [ ] Refresh tokens can be revoked
- [ ] State parameter used for CSRF protection (client side)
- [ ] No sensitive data in JWT payload (user ID only)
- [ ] Access tokens expire in 1 day
- [ ] Refresh tokens expire in 30 days

---

## Next Steps

1. **Add Email Verification:**
   - Send verification email on registration
   - Add `emailVerificationToken` to users table
   - Create `/verify-email?token=...` endpoint

2. **Add Password Reset:**
   - Create "Forgot Password" link on login
   - Generate reset token and send email
   - Create `/reset-password?token=...` page

3. **Add 2FA (Two-Factor Authentication):**
   - Add `twoFactorSecret` to users table
   - Install `speakeasy` for TOTP generation
   - Create 2FA setup page in dashboard

4. **Client App Examples:**
   - Build example ShelfScan client app
   - Demonstrate full OAuth integration
   - Show token refresh logic

5. **Production Deployment:**
   - Set up domain: accounts.shelfex.com
   - Configure HTTPS with SSL certificate
   - Set `COOKIE_DOMAIN=.shelfex.com`
   - Update allowed redirect URIs to production domains

---

## Resources

- [Backend README](backend/README.md) - Complete API documentation
- [Frontend README](frontend/README.md) - Frontend setup and usage
- [OAuth 2.0 RFC](https://tools.ietf.org/html/rfc6749)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
