'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function CallbackPage() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const authCode = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setError(errorDescription || errorParam);
    } else if (authCode) {
      setCode(authCode);
      setState(stateParam);
    }
  }, [searchParams]);

  return (
    <div style={{ maxWidth: '600px', margin: '100px auto', padding: '20px' }}>
      <h1 style={{ marginBottom: '30px' }}>OAuth Callback</h1>
      
      {error ? (
        <div style={{
          padding: '20px',
          backgroundColor: '#fee',
          borderRadius: '4px',
          border: '1px solid #fcc'
        }}>
          <h2 style={{ color: '#c00', marginBottom: '10px' }}>Error</h2>
          <p>{error}</p>
        </div>
      ) : code ? (
        <div>
          <div style={{
            padding: '20px',
            backgroundColor: '#efe',
            borderRadius: '4px',
            border: '1px solid #cfc',
            marginBottom: '20px'
          }}>
            <h2 style={{ color: '#0a0', marginBottom: '10px' }}>Success!</h2>
            <p>Authorization code received.</p>
          </div>
          
          <div style={{
            padding: '20px',
            backgroundColor: '#f9f9f9',
            borderRadius: '4px',
            marginBottom: '20px'
          }}>
            <h3 style={{ marginBottom: '10px' }}>Authorization Code:</h3>
            <code style={{
              display: 'block',
              padding: '10px',
              backgroundColor: '#fff',
              border: '1px solid #ddd',
              borderRadius: '4px',
              wordBreak: 'break-all',
              fontSize: '12px'
            }}>
              {code}
            </code>
          </div>

          {state && (
            <div style={{
              padding: '20px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <h3 style={{ marginBottom: '10px' }}>State:</h3>
              <code style={{
                display: 'block',
                padding: '10px',
                backgroundColor: '#fff',
                border: '1px solid #ddd',
                borderRadius: '4px',
                wordBreak: 'break-all',
                fontSize: '12px'
              }}>
                {state}
              </code>
            </div>
          )}

          <div style={{
            padding: '20px',
            backgroundColor: '#fff9e6',
            borderRadius: '4px',
            border: '1px solid #ffe066'
          }}>
            <h3 style={{ marginBottom: '10px' }}>Next Steps:</h3>
            <ol style={{ marginLeft: '20px', lineHeight: '1.8' }}>
              <li>The client app (ShelfScan) would send this code to its backend</li>
              <li>Backend calls <code>POST /oauth/token</code> with the code and client_secret</li>
              <li>Backend receives access_token, refresh_token, and id_token</li>
              <li>Backend can now access user info and authenticate the user</li>
            </ol>
          </div>
        </div>
      ) : (
        <p>Processing callback...</p>
      )}

      <div style={{ marginTop: '30px' }}>
        <a
          href="/"
          style={{
            padding: '10px 20px',
            backgroundColor: '#0070f3',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
          }}
        >
          Back to Home
        </a>
      </div>
    </div>
  );
}
