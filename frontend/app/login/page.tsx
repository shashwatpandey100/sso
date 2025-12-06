'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Get OAuth params from URL
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const state = searchParams.get('state');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // If OAuth params exist, use form POST to allow backend redirect
    if (clientId && redirectUri) {
      // Create a hidden form and submit it to allow backend redirect
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `${process.env.NEXT_PUBLIC_API_URL}/auth/login`;
      
      const fields = {
        identifier,
        password,
        client_id: clientId,
        redirect_uri: redirectUri,
        ...(state && { state }),
      };

      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
      return;
    }

    // Standard login without OAuth
    try {
      await authApi.login({ identifier, password });
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px' }}>
      <h1 style={{ marginBottom: '20px' }}>Shelfex Accounts - Login</h1>
      
      {clientId && (
        <div style={{ 
          padding: '10px', 
          marginBottom: '20px', 
          backgroundColor: '#f0f0f0',
          borderRadius: '4px'
        }}>
          <p className='text-black!' style={{ margin: 0, fontSize: '14px' }}>
            <strong>Logging in to:</strong> {clientId}
          </p>
        </div>
      )}

      {error && (
        <div className='text-red-600' style={{ 
          padding: '10px', 
          marginBottom: '20px', 
          backgroundColor: '#fee', 
          color: '#c00',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Email or Username
          </label>
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
            placeholder="test@shelfex.com or testuser"
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
            placeholder="Enter your password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: loading ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
          }}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <a href="/register" style={{ color: '#0070f3' }}>
          Don't have an account? Register
        </a>
      </div>

      <div className='text-black!' style={{ marginTop: '30px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
        <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>Test Credentials:</p>
        <p style={{ margin: '5px 0', fontSize: '13px' }}>Email: <code>test@shelfex.com</code></p>
        <p style={{ margin: '5px 0', fontSize: '13px' }}>Username: <code>testuser</code></p>
        <p style={{ margin: '5px 0', fontSize: '13px' }}>Password: <code>12345</code></p>
      </div>
    </div>
  );
}
