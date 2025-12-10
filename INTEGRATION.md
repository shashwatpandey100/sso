# Shelfex SSO Integration Guide

Complete guide for integrating Shelfex OAuth 2.0 authentication into your Next.js application.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup (Register Your App)](#database-setup-register-your-app)
5. [Implementation Guide](#implementation-guide)
6. [Testing Your Integration](#testing-your-integration)
7. [Production Deployment](#production-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before integrating Shelfex authentication, ensure you have:

- ✅ Node.js 18+ installed
- ✅ Next.js 14+ project (App Router or Pages Router)
- ✅ Access to Shelfex Accounts backend (running locally or deployed)
- ✅ Your client app registered in the `client_apps` database table
- ✅ Basic understanding of OAuth 2.0 flow

---

## Project Setup

### 1. Create a New Next.js Project (if starting fresh)

```bash
npx create-next-app@latest my-shelfex-app
cd my-shelfex-app
```

**Configuration options:**
```
✔ Would you like to use TypeScript? Yes
✔ Would you like to use ESLint? Yes
✔ Would you like to use Tailwind CSS? Yes
✔ Would you like to use `src/` directory? No
✔ Would you like to use App Router? Yes
✔ Would you like to customize the default import alias? No
```

### 2. Install Required Dependencies

```bash
npm install axios jsonwebtoken crypto-js
npm install -D @types/jsonwebtoken
```

**Package purposes:**
- `axios` - HTTP client for API requests
- `jsonwebtoken` - Decode and verify JWT tokens
- `crypto-js` - Generate secure random strings (CSRF state)

---

## Environment Configuration

### 1. Create `.env.local` File

Create a `.env.local` file in your project root:

```bash
# Shelfex Accounts API
NEXT_PUBLIC_ACCOUNTS_API_URL=http://localhost:8000/api/v1

# Your App's Client Credentials (from database)
NEXT_PUBLIC_CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret-here

# Your App's Callback URL
NEXT_PUBLIC_CALLBACK_URL=http://localhost:3001/callback

# Session Secret (generate with: openssl rand -base64 32)
SESSION_SECRET=your-secret-key-here
```

### 2. Production Environment Variables

For production (`.env.production`):

```bash
# Production Shelfex Accounts API
NEXT_PUBLIC_ACCOUNTS_API_URL=https://api.shelfex.com/api/v1

# Your App's Client Credentials
NEXT_PUBLIC_CLIENT_ID=your-production-client-id
CLIENT_SECRET=your-production-client-secret

# Production Callback URL (must match database)
NEXT_PUBLIC_CALLBACK_URL=https://yourdomain.com/callback

# Session Secret
SESSION_SECRET=your-production-secret
```

---

## Database Setup (Register Your App)

Your app must be registered in the Shelfex Accounts database before integration.

### Option 1: Using Seed Script (Development)

The backend seed script (`backend/src/seed.ts`) automatically creates example clients:

```typescript
// Example client apps in seed.ts
{
  clientId: 'shelfscan',
  name: 'ShelfScan',
  clientSecret: await hashPassword('shelfscan_secret_123'),
  allowedRedirectUris: [
    'http://localhost:3001/callback',
    'https://shelfscan.shelfexecution.com/callback'
  ]
}
```

Run the seed:
```bash
cd backend
npm run db:seed
```

### Option 2: Manual Registration (Production)

Insert your app into the `client_apps` table:

```sql
-- 1. Hash your client secret using bcrypt (12 rounds)
-- Use an online bcrypt tool or Node.js:
-- const bcrypt = require('bcrypt');
-- const hash = await bcrypt.hash('your_secret_here', 12);

-- 2. Insert into database
INSERT INTO client_apps (
  client_id,
  name,
  client_secret,
  allowed_redirect_uris
) VALUES (
  'your-client-id',
  'Your App Name',
  '$2b$12$hashed_client_secret_here',
  ARRAY['https://yourdomain.com/callback', 'http://localhost:3001/callback']
);
```

**Important:** 
- `clientSecret` must be bcrypt hashed (12 rounds)
- `allowedRedirectUris` must include ALL your callback URLs (dev + prod)
- Keep your `CLIENT_SECRET` secure (never commit to git)

---

## Implementation Guide

### Step 1: Create API Client (`lib/auth-api.ts`)

```typescript
// lib/auth-api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_ACCOUNTS_API_URL,
  withCredentials: true, // Important: Send cookies with requests
});

export const authApi = {
  // Exchange authorization code for tokens
  exchangeCode: async (code: string, redirectUri: string) => {
    const response = await api.post('/oauth/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.NEXT_PUBLIC_CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
    });
    return response.data;
  },

  // Refresh access token
  refreshToken: async (refreshToken: string) => {
    const response = await api.post('/auth/refresh', {
      refreshToken,
    });
    return response.data;
  },

  // Get user info using access token
  getUserInfo: async (accessToken: string) => {
    const response = await api.get('/auth/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  },
};
```

### Step 2: Create Session Utilities (`lib/session.ts`)

```typescript
// lib/session.ts
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export const sessionUtils = {
  // Set access token cookie
  setAccessToken: (token: string) => {
    cookies().set('access_token', token, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24, // 1 day
    });
  },

  // Set refresh token cookie
  setRefreshToken: (token: string) => {
    cookies().set('refresh_token', token, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  },

  // Get access token from cookie
  getAccessToken: () => {
    return cookies().get('access_token')?.value;
  },

  // Get refresh token from cookie
  getRefreshToken: () => {
    return cookies().get('refresh_token')?.value;
  },

  // Clear all auth cookies
  clearTokens: () => {
    cookies().delete('access_token');
    cookies().delete('refresh_token');
  },

  // Decode JWT without verification (for user info)
  decodeToken: (token: string) => {
    try {
      return jwt.decode(token);
    } catch {
      return null;
    }
  },

  // Verify if token is valid (not expired)
  isTokenValid: (token: string) => {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) return false;
      return decoded.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  },
};
```

### Step 3: Create Middleware for Protected Routes (`middleware.ts`)

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export function middleware(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  // If no access token, redirect to OAuth flow
  if (!accessToken) {
    // Check if refresh token exists
    if (refreshToken) {
      // Could attempt refresh here, but simpler to just redirect
      // In production, you'd want a refresh endpoint
    }

    // Generate CSRF state
    const state = generateRandomState();
    
    // Store state in cookie for verification later
    const response = NextResponse.redirect(
      new URL(
        `${process.env.NEXT_PUBLIC_ACCOUNTS_API_URL}/oauth/authorize?` +
        `client_id=${process.env.NEXT_PUBLIC_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(process.env.NEXT_PUBLIC_CALLBACK_URL!)}&` +
        `response_type=code&` +
        `state=${state}`,
        request.url
      )
    );
    
    response.cookies.set('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
    });
    
    return response;
  }

  // Verify token is not expired
  try {
    const decoded = jwt.decode(accessToken) as any;
    if (!decoded || !decoded.exp) {
      return redirectToAuth(request);
    }

    // Check if expired
    if (decoded.exp * 1000 < Date.now()) {
      // Token expired, try to refresh or redirect to login
      if (refreshToken) {
        // In a real app, you'd call refresh endpoint here
        // For now, redirect to auth
      }
      return redirectToAuth(request);
    }

    // Token is valid, allow request to proceed
    return NextResponse.next();
  } catch (error) {
    return redirectToAuth(request);
  }
}

function redirectToAuth(request: NextRequest) {
  const state = generateRandomState();
  const response = NextResponse.redirect(
    new URL(
      `${process.env.NEXT_PUBLIC_ACCOUNTS_API_URL}/oauth/authorize?` +
      `client_id=${process.env.NEXT_PUBLIC_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(process.env.NEXT_PUBLIC_CALLBACK_URL!)}&` +
      `response_type=code&` +
      `state=${state}`,
      request.url
    )
  );
  
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
  });
  
  return response;
}

function generateRandomState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Specify which routes to protect
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/profile/:path*',
    '/settings/:path*',
    // Add all protected routes here
    // Exclude: /callback, /login, /api, /_next, /public
  ],
};
```

### Step 4: Create OAuth Callback Handler (`app/callback/page.tsx`)

**For App Router:**

```typescript
// app/callback/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get authorization code and state from URL
        const code = searchParams.get('code');
        const state = searchParams.get('state');

        if (!code) {
          throw new Error('No authorization code received');
        }

        // Verify state (CSRF protection)
        const response = await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Authentication failed');
        }

        // Redirect to dashboard on success
        router.push('/dashboard');
      } catch (err: any) {
        console.error('Callback error:', err);
        setError(err.message);
      }
    };

    handleCallback();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <h2 className="text-xl font-semibold text-red-800">Authentication Error</h2>
          <p className="mt-2 text-red-600">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
        <p className="text-lg text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
```

### Step 5: Create API Route for Token Exchange (`app/api/auth/callback/route.ts`)

```typescript
// app/api/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authApi } from '@/lib/auth-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, state } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Authorization code is required' },
        { status: 400 }
      );
    }

    // Verify state (CSRF protection)
    const storedState = cookies().get('oauth_state')?.value;
    if (state && state !== storedState) {
      return NextResponse.json(
        { error: 'Invalid state parameter (CSRF check failed)' },
        { status: 400 }
      );
    }

    // Exchange code for tokens
    const tokenResponse = await authApi.exchangeCode(
      code,
      process.env.NEXT_PUBLIC_CALLBACK_URL!
    );

    const { access_token, refresh_token, id_token } = tokenResponse;

    // Create response
    const response = NextResponse.json(
      { success: true },
      { status: 200 }
    );

    // Set cookies
    response.cookies.set('access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });

    response.cookies.set('refresh_token', refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    // Clear state cookie
    response.cookies.delete('oauth_state');

    return response;
  } catch (error: any) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: error.message || 'Token exchange failed' },
      { status: 500 }
    );
  }
}
```

### Step 6: Create Token Refresh API Route (`app/api/auth/refresh/route.ts`)

```typescript
// app/api/auth/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authApi } from '@/lib/auth-api';

export async function POST(request: NextRequest) {
  try {
    const refreshToken = cookies().get('refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token found' },
        { status: 401 }
      );
    }

    // Call Shelfex API to refresh token
    const tokenResponse = await authApi.refreshToken(refreshToken);
    const { accessToken } = tokenResponse;

    // Create response with new access token
    const response = NextResponse.json(
      { success: true },
      { status: 200 }
    );

    response.cookies.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Token refresh error:', error);
    
    // If refresh fails, clear cookies and require re-login
    const response = NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 401 }
    );
    
    response.cookies.delete('access_token');
    response.cookies.delete('refresh_token');
    
    return response;
  }
}
```

### Step 7: Create Logout API Route (`app/api/auth/logout/route.ts`)

```typescript
// app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // Create response
    const response = NextResponse.json(
      { success: true, message: 'Logged out successfully' },
      { status: 200 }
    );

    // Clear all auth cookies
    response.cookies.delete('access_token');
    response.cookies.delete('refresh_token');

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}
```

### Step 8: Create Protected Dashboard Page (`app/dashboard/page.tsx`)

```typescript
// app/dashboard/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import jwt from 'jsonwebtoken';

async function getUserInfo() {
  const accessToken = cookies().get('access_token')?.value;

  if (!accessToken) {
    redirect('/');
  }

  // Decode token to get user info
  const decoded = jwt.decode(accessToken) as any;
  
  return {
    id: decoded.sub,
    email: decoded.email,
    username: decoded.username,
    name: decoded.name,
  };
}

export default async function DashboardPage() {
  const user = await getUserInfo();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">My App</h1>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-2xl font-bold">Welcome, {user.name || user.username}!</h2>
          
          <div className="space-y-2">
            <p><strong>Email:</strong> {user.email}</p>
            {user.username && <p><strong>Username:</strong> {user.username}</p>}
            <p><strong>User ID:</strong> {user.id}</p>
          </div>

          <div className="mt-6 rounded-lg bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              🎉 You're authenticated via Shelfex SSO! This session works across all Shelfex apps.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
```

### Step 9: Update Home Page (`app/page.tsx`)

```typescript
// app/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default function HomePage() {
  // Check if user is already authenticated
  const accessToken = cookies().get('access_token')?.value;

  if (accessToken) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold text-gray-900">
          Welcome to My Shelfex App
        </h1>
        <p className="mb-8 text-lg text-gray-600">
          Sign in with your Shelfex account to continue
        </p>
        <a
          href="/dashboard"
          className="rounded-lg bg-blue-600 px-8 py-3 text-white hover:bg-blue-700"
        >
          Sign In with Shelfex
        </a>
      </div>
    </div>
  );
}
```

---

## Testing Your Integration

### 1. Start the Shelfex Backend

```bash
cd backend
npm run dev
```

Backend should be running on `http://localhost:8000`

### 2. Start Your Next.js App

```bash
npm run dev
```

Your app should be running on `http://localhost:3001` (or your configured port)

### 3. Test the OAuth Flow

1. **Visit Home Page:**
   - Navigate to `http://localhost:3001`
   - Click "Sign In with Shelfex"

2. **Redirect to Shelfex Login:**
   - You'll be redirected to `http://localhost:3000/login?client_id=...`
   - Enter test credentials:
     - Email: `test@shelfex.com`
     - Password: `12345`

3. **Callback Processing:**
   - After login, you'll be redirected to `/callback`
   - The app exchanges the code for tokens
   - You're redirected to `/dashboard`

4. **View Dashboard:**
   - Dashboard displays your user information
   - Check browser DevTools → Application → Cookies
   - You should see: `access_token`, `refresh_token`

5. **Test Logout:**
   - Click "Logout" button
   - Cookies are cleared
   - You're redirected to home page

### 4. Test SSO Across Multiple Apps

If you have multiple apps running (e.g., ShelfScan on port 3001, ShelfMuse on port 3002):

1. Login to ShelfScan (port 3001)
2. Open ShelfMuse (port 3002) in a new tab
3. You'll be automatically logged in without entering credentials (SSO Magic!)

---

## Production Deployment

### 1. Update Environment Variables

```bash
# .env.production
NEXT_PUBLIC_ACCOUNTS_API_URL=https://api.shelfex.com/api/v1
NEXT_PUBLIC_CLIENT_ID=your-production-client-id
CLIENT_SECRET=your-production-secret
NEXT_PUBLIC_CALLBACK_URL=https://yourdomain.com/callback
SESSION_SECRET=your-production-session-secret
```

### 2. Register Production Redirect URI

Update your client app in the database:

```sql
UPDATE client_apps
SET allowed_redirect_uris = ARRAY[
  'https://yourdomain.com/callback',
  'http://localhost:3001/callback'  -- Keep for dev testing
]
WHERE client_id = 'your-client-id';
```

### 3. Enable HTTPS

Ensure your production deployment uses HTTPS. Cookies with `secure: true` only work over HTTPS.

### 4. Configure CORS on Backend

Update backend `.env`:

```bash
ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3001
COOKIE_DOMAIN=.shelfex.com
```

### 5. Deploy

```bash
npm run build
npm run start
```

Or deploy to Vercel/Netlify:

```bash
vercel deploy --prod
```

---

## Troubleshooting

### Issue: "Invalid redirect URI"

**Cause:** Your callback URL is not registered in the `client_apps` table.

**Solution:**
1. Check `allowedRedirectUris` in database
2. Ensure URL exactly matches (including protocol and port)
3. Update database if needed

### Issue: "Client secret is incorrect"

**Cause:** The `CLIENT_SECRET` in your `.env.local` doesn't match the hashed version in the database.

**Solution:**
1. Check the database for your client's hashed secret
2. Verify you're using the correct plaintext secret
3. Re-generate and re-hash the secret if needed

### Issue: "No authorization code received"

**Cause:** User cancelled the login or backend didn't redirect properly.

**Solution:**
1. Check backend logs for errors
2. Verify CORS is configured correctly
3. Ensure backend is running and accessible

### Issue: Cookies not being set

**Cause:** 
- `secure: true` without HTTPS in development
- SameSite restrictions
- Browser blocking third-party cookies

**Solution:**
1. In development, set `secure: false` in cookie options
2. Use `sameSite: 'lax'` instead of `'strict'`
3. Test in a browser that allows cookies (disable strict tracking prevention)

### Issue: Middleware redirects infinitely

**Cause:** Callback route is protected by middleware.

**Solution:**
Update `middleware.ts` config to exclude callback:

```typescript
export const config = {
  matcher: [
    '/((?!api|callback|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

### Issue: "State parameter mismatch"

**Cause:** The state cookie expired or was modified.

**Solution:**
1. Ensure state cookie has sufficient expiry (10 minutes)
2. Complete OAuth flow quickly (within cookie expiry)
3. Check for browser extensions that modify cookies

---

## Additional Resources

- [Backend API Documentation](./backend/README.md)
- [Frontend Implementation](./frontend/README.md)
- [OAuth 2.0 Specification](https://tools.ietf.org/html/rfc6749)
- [Next.js Documentation](https://nextjs.org/docs)

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review backend logs for detailed error messages
3. Verify all environment variables are set correctly
4. Ensure your client app is properly registered in the database

---

**Happy Integrating! 🚀**
