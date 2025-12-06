# Shelfex Accounts - OAuth 2.0 Single Sign-On System

A production-grade centralized authentication system for Shelfex products (ShelfScan, ShelfMuse, ShelfIntel) built with OAuth 2.0 Authorization Code Flow.

## 🎯 What This Is

This is a **Google-like SSO system** (`accounts.google.com` equivalent) that allows users to:
- Sign in once and access all Shelfex products seamlessly
- Login using either email or username
- Maintain sessions across multiple domains
- Securely authenticate without sharing passwords with client apps

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Shelfex Ecosystem                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  ShelfScan   │  │  ShelfMuse   │  │  ShelfIntel  │          │
│  │   (Client)   │  │   (Client)   │  │   (Client)   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┼──────────────────┘                   │
│                            │                                       │
│                  ┌─────────▼─────────┐                           │
│                  │  Accounts Service │                           │
│                  │  (OAuth Provider) │                           │
│                  │                   │                           │
│                  │  Backend: 8000    │                           │
│                  │  Frontend: 3000   │                           │
│                  └───────────────────┘                           │
│                            │                                       │
│                  ┌─────────▼─────────┐                           │
│                  │   PostgreSQL DB   │                           │
│                  │  (Neon Serverless)│                           │
│                  └───────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Tech Stack

### Backend
- **Express 5.2.1** - Web framework
- **TypeScript 5** - Type safety
- **Drizzle ORM 0.44.7** - Database ORM
- **PostgreSQL (Neon)** - Database
- **JWT (jsonwebtoken)** - Token generation
- **bcrypt** - Password hashing
- **cookie-parser** - Cookie management
- **helmet** - Security headers
- **cors** - Cross-origin support

### Frontend
- **Next.js 16.0.7** (App Router) - React framework
- **React 19.2.0** - UI library
- **TypeScript 5** - Type safety
- **Axios 1.13.2** - HTTP client
- **TailwindCSS 4** - Utility-first CSS (minimal usage)

## 🚀 Quick Start

### 1. Clone and Install

```bash
# Backend
cd backend
npm install
cp .env.example .env
# Edit .env with your database URL and secrets

# Frontend
cd ../frontend
npm install
cp .env.example .env.local
# Edit .env.local with API URL
```

### 2. Setup Database

```bash
cd backend
npm run db:push      # Create tables
npm run db:seed      # Seed test data
```

### 3. Start Services

```bash
# Terminal 1 - Backend
cd backend
npm run dev
# Running on http://localhost:8000

# Terminal 2 - Frontend
cd frontend
npm run dev
# Running on http://localhost:3000
```

### 4. Test It Out

Visit: `http://localhost:3000`

**Test Credentials:**
- Email: `test@shelfex.com`
- Password: `12345`

## 📚 Documentation

- **[Backend README](backend/README.md)** - Complete API documentation, database schema, OAuth flow details (2,800+ lines)
- **[Frontend README](frontend/README.md)** - Frontend setup, pages overview, client integration guide
- **[Testing Guide](TESTING.md)** - Step-by-step testing scenarios with expected results

## 🔐 Features

### Authentication
- ✅ Email + Password login
- ✅ Username + Password login (dual identifier support)
- ✅ User registration with optional fields
- ✅ JWT-based access tokens (1 day expiry)
- ✅ Refresh tokens with rotation (30 days expiry)
- ✅ Global SSO session cookie (`accounts_session`)
- ✅ Logout with token revocation

### OAuth 2.0 SSO
- ✅ Authorization Code Flow
- ✅ Client app registration
- ✅ Client secret verification (bcrypt)
- ✅ One-time authorization codes (10 min expiry)
- ✅ State parameter support (CSRF protection)
- ✅ ID tokens (OpenID Connect compatible)
- ✅ Seamless SSO across domains

### Security
- ✅ Passwords hashed with bcrypt (12 rounds)
- ✅ HttpOnly cookies (XSS protection)
- ✅ SameSite=Lax cookies (CSRF protection)
- ✅ Secure flag in production (HTTPS only)
- ✅ JWT signature verification
- ✅ Token refresh rotation
- ✅ Revocable refresh tokens
- ✅ Email verification support (optional)

### Developer Experience
- ✅ TypeScript throughout
- ✅ Drizzle ORM with type safety
- ✅ Comprehensive error handling
- ✅ Detailed logging
- ✅ Database migrations
- ✅ Seed scripts for testing
- ✅ Cookie-first authentication (checks cookies, then headers)

## 🔄 OAuth Flow Overview

### Scenario 1: Cold Start (Not Logged In)

```
User → ShelfScan → OAuth Authorize → Login Page → Authenticate → Callback → ShelfScan
```

1. User clicks "Login" on ShelfScan
2. Redirected to OAuth authorize endpoint
3. Backend checks `accounts_session` cookie → **not found**
4. Redirected to login page with OAuth context
5. User enters credentials
6. Backend sets cookies and generates auth code
7. Redirected to ShelfScan callback with code
8. ShelfScan exchanges code for tokens
9. User logged into ShelfScan

### Scenario 2: SSO Magic (Already Logged In)

```
User → ShelfMuse → OAuth Authorize → [Skip Login] → Callback → ShelfMuse
```

1. User clicks "Login" on ShelfMuse
2. Redirected to OAuth authorize endpoint
3. Backend checks `accounts_session` → **valid session found**
4. Backend generates auth code instantly
5. **Skips login page** - redirected straight to callback
6. ShelfMuse exchanges code for tokens
7. User logged into ShelfMuse **without entering password**

### Scenario 3: Zombie Session (Token Expired, Session Valid)

```
User → ShelfIntel → OAuth Authorize → [Auto-Refresh] → Callback → ShelfIntel
```

1. User's access token expired (> 1 day old)
2. User's refresh token still valid (< 30 days old)
3. User's `accounts_session` still valid
4. Backend detects expired access token
5. Backend auto-generates new auth code from session
6. User logged in without password prompt

## 📋 API Endpoints

### Authentication (`/api/v1/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | No | Register new user |
| GET | `/login` | No | Get login page with OAuth context |
| POST | `/login` | No | Authenticate user (supports OAuth) |
| POST | `/refresh` | Yes | Refresh access token |
| POST | `/logout` | Yes | Logout and revoke refresh token |
| GET | `/me` | Yes | Get current user profile |

### OAuth 2.0 (`/api/v1/oauth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/authorize` | Cookie | Initiate OAuth flow |
| POST | `/token` | Secret | Exchange auth code for tokens |

## 🗄️ Database Schema

### `users`
- `id` (UUID, PK)
- `email` (unique, indexed)
- `username` (unique, indexed, optional)
- `password` (bcrypt hashed)
- `name` (optional)
- `emailVerified` (boolean)
- `createdAt`, `updatedAt`

### `refreshTokens`
- `id` (UUID, PK)
- `userId` (FK → users)
- `tokenHash` (SHA256, indexed)
- `expiresAt` (30 days)
- `isRevoked` (boolean)
- `lastUsedAt`

### `authCodes`
- `id` (UUID, PK)
- `code` (unique, indexed)
- `userId` (FK → users)
- `clientId` (FK → clientApps)
- `redirectUri`
- `expiresAt` (10 minutes)
- `isUsed` (boolean, one-time use)

### `clientApps`
- `id` (UUID, PK)
- `clientId` (unique, indexed)
- `clientSecret` (bcrypt hashed)
- `name`
- `allowedRedirectUris` (JSON array)

## 🧪 Test Data

After running `npm run db:seed` in backend:

**Test User:**
- Email: `test@shelfex.com`
- Username: `testuser`
- Password: `12345`

**Client Apps:**
| Client ID | Client Secret | Redirect URIs |
|-----------|---------------|---------------|
| `shelfscan` | `shelfscan-dev-secret-2025` | `http://localhost:3000/callback`, `https://devshelfscan.shelfexecution.com/callback` |
| `shelfmuse` | `shelfmuse-dev-secret-2025` | `http://localhost:3000/callback`, `https://dev.shelfmuse.tech/callback` |
| `shelfintel` | `shelfintel-dev-secret-2025` | `http://localhost:3000/callback` |

## 🎨 Frontend Pages

| Page | Route | Auth | Description |
|------|-------|------|-------------|
| Homepage | `/` | No | Landing with navigation and OAuth test link |
| Login | `/login` | No | Email/username + password login, OAuth support |
| Register | `/register` | No | User registration form |
| Dashboard | `/dashboard` | Yes | Protected route, displays user profile |
| Callback | `/callback` | No | OAuth callback handler, displays auth code |

## 🔧 Environment Variables

### Backend (`.env`)
```bash
DATABASE_URL=postgresql://user:pass@host/db
JWT_ACCESS_SECRET=your_secret_min_32_chars
JWT_REFRESH_SECRET=your_secret_min_32_chars
JWT_ID_SECRET=your_secret_min_32_chars
COOKIE_DOMAIN=.shelfex.com
EMAIL_VERIFICATION_REQUIRED=false
```

### Frontend (`.env.local`)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## 📦 Project Structure

```
auth-shelfex/
├── backend/
│   ├── src/
│   │   ├── controllers/       # Auth & OAuth logic
│   │   ├── db/                # Database schema & connection
│   │   ├── middlewares/       # Auth middleware
│   │   ├── routes/            # Express routes
│   │   ├── utils/             # JWT, hashing utilities
│   │   ├── app.ts             # Express app setup
│   │   ├── server.ts          # Server entry point
│   │   └── seed.ts            # Database seeding
│   ├── drizzle/               # Database migrations
│   ├── .env
│   ├── package.json
│   └── README.md              # Backend docs (2,800+ lines)
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # Homepage
│   │   ├── login/             # Login page
│   │   ├── register/          # Register page
│   │   ├── dashboard/         # Protected dashboard
│   │   └── callback/          # OAuth callback
│   ├── lib/
│   │   ├── axios.ts           # Axios config
│   │   └── api.ts             # API client
│   ├── .env.local
│   ├── package.json
│   └── README.md              # Frontend docs
└── TESTING.md                 # Testing guide
```

## 🚢 Production Deployment

### 1. Domain Setup
- Frontend: `accounts.shelfex.com`
- Backend: `api.shelfex.com`
- Client Apps: `*.shelfexecution.com`, `*.shelfmuse.tech`

### 2. Environment Configuration

**Backend `.env` (Production):**
```bash
DATABASE_URL=postgresql://prod_user:prod_pass@prod_host/prod_db
JWT_ACCESS_SECRET=generated_with_openssl_rand_hex_32
JWT_REFRESH_SECRET=generated_with_openssl_rand_hex_32
JWT_ID_SECRET=generated_with_openssl_rand_hex_32
COOKIE_DOMAIN=.shelfex.com
EMAIL_VERIFICATION_REQUIRED=true
NODE_ENV=production
```

**Frontend `.env.local` (Production):**
```bash
NEXT_PUBLIC_API_URL=https://api.shelfex.com/api/v1
```

### 3. Security Checklist
- [ ] HTTPS enabled (SSL certificates)
- [ ] Secure flag on cookies
- [ ] Update CORS `ALLOWED_ORIGINS`
- [ ] Update `allowedRedirectUris` in database
- [ ] Use strong JWT secrets (min 32 chars)
- [ ] Enable email verification
- [ ] Rate limiting on auth endpoints
- [ ] Database backups configured

### 4. Update Client Apps
Update `allowedRedirectUris` in database:
```sql
UPDATE client_apps 
SET allowed_redirect_uris = '["https://devshelfscan.shelfexecution.com/callback", "https://dev.shelfmuse.tech/callback"]'::jsonb
WHERE client_id = 'shelfscan';
```

## 🤝 Client App Integration

To integrate a client app (e.g., ShelfScan) with this OAuth system:

### 1. Frontend: Initiate OAuth Flow
```typescript
const loginUrl = `https://api.shelfex.com/api/v1/oauth/authorize?` +
  `client_id=shelfscan&` +
  `redirect_uri=${encodeURIComponent('https://devshelfscan.shelfexecution.com/callback')}&` +
  `response_type=code&` +
  `state=${generateRandomState()}`;

window.location.href = loginUrl;
```

### 2. Backend: Handle Callback
```typescript
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state (CSRF protection)
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
  
  // Create session
  req.session.userId = user.sub;
  req.session.accessToken = access_token;
  
  res.redirect('/dashboard');
});
```

### 3. Use Access Token
```typescript
// Verify token with accounts service
const userInfo = await axios.get('https://api.shelfex.com/api/v1/auth/me', {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```

See [Frontend README](frontend/README.md) for complete integration guide.

## 📊 Performance & Scaling

### Current Performance
- Auth endpoints: < 200ms response time
- JWT verification: < 10ms (no DB lookup)
- Database queries: Indexed (email, username, tokenHash, code)
- Cookie-based auth: Minimal overhead

### Scaling Considerations
1. **Database:**
   - Neon Serverless scales automatically
   - Add read replicas for high traffic
   - Consider Redis for session caching

2. **Backend:**
   - Stateless design (horizontal scaling ready)
   - Use load balancer (Nginx, AWS ALB)
   - Deploy multiple instances

3. **Frontend:**
   - Next.js on Vercel (CDN + edge caching)
   - Static pages cached globally
   - API routes serverless

## 🐛 Troubleshooting

### Common Issues

**"Network Error" on login:**
- Ensure backend is running on port 8000
- Check `NEXT_PUBLIC_API_URL` in frontend `.env.local`
- Verify CORS allows `http://localhost:3000`

**Cookies not being set:**
- Check `withCredentials: true` in Axios config
- Verify backend CORS config has `credentials: true`
- In production, ensure `COOKIE_DOMAIN` matches your domains

**OAuth redirect fails:**
- Check `allowedRedirectUris` in `clientApps` table
- Verify `client_id` exists and is correct
- Ensure `redirect_uri` is URL-encoded

See [Testing Guide](TESTING.md) for more troubleshooting tips.

## 📝 Next Steps

1. **Email Verification:**
   - Send verification email on registration
   - Add verification endpoint

2. **Password Reset:**
   - Forgot password flow
   - Reset token generation

3. **2FA (Two-Factor Auth):**
   - TOTP with speakeasy
   - QR code generation

4. **Admin Panel:**
   - Manage users
   - View sessions
   - Revoke tokens

5. **Analytics:**
   - Login attempts tracking
   - SSO usage stats
   - Session duration metrics

## 📄 License

MIT

## 🙏 Credits

Built with love for the Shelfex ecosystem.

**Technologies:**
- Express.js
- Next.js
- Drizzle ORM
- PostgreSQL (Neon)
- JWT
- bcrypt

---

**Questions?** Check the documentation:
- [Backend README](backend/README.md) - API details
- [Frontend README](frontend/README.md) - Frontend guide
- [Testing Guide](TESTING.md) - Testing scenarios
