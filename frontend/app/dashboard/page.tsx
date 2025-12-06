'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, User } from '@/lib/api';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authApi.getCurrentUser();
        setUser(userData);
      } catch (err: any) {
        console.error('Failed to fetch user:', err);
        setError(err.response?.data?.message || 'Failed to load user data');
        // Redirect to login if not authenticated
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
      // Even if logout fails, redirect to login
      router.push('/login');
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '600px', margin: '100px auto', padding: '20px' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div style={{ maxWidth: '600px', margin: '100px auto', padding: '20px' }}>
        <p style={{ color: 'red' }}>{error || 'Not authenticated'}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '100px auto', padding: '20px' }}>
      <h1 style={{ marginBottom: '30px' }}>Dashboard</h1>
      
      <div style={{
        padding: '20px',
        backgroundColor: '#f9f9f9',
        borderRadius: '4px',
        marginBottom: '20px'
      }}>
        <h2 style={{ marginBottom: '15px' }}>Profile Information</h2>
        <div style={{ marginBottom: '10px' }}>
          <strong>ID:</strong> {user.id}
        </div>
        <div style={{ marginBottom: '10px' }}>
          <strong>Email:</strong> {user.email}
        </div>
        {user.username && (
          <div style={{ marginBottom: '10px' }}>
            <strong>Username:</strong> {user.username}
          </div>
        )}
        {user.name && (
          <div style={{ marginBottom: '10px' }}>
            <strong>Name:</strong> {user.name}
          </div>
        )}
        <div style={{ marginBottom: '10px' }}>
          <strong>Email Verified:</strong> {user.emailVerified ? 'Yes' : 'No'}
        </div>
        <div style={{ marginBottom: '10px' }}>
          <strong>Created:</strong> {new Date(user.createdAt).toLocaleString()}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleLogout}
          style={{
            padding: '10px 20px',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Logout
        </button>
        <a
          href="/"
          style={{
            padding: '10px 20px',
            backgroundColor: '#fff',
            color: '#0070f3',
            textDecoration: 'none',
            borderRadius: '4px',
            border: '1px solid #0070f3',
            display: 'inline-block',
          }}
        >
          Back to Home
        </a>
      </div>
    </div>
  );
}
