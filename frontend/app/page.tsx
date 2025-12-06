export default function Home() {
  return (
    <div style={{ maxWidth: '600px', margin: '100px auto', padding: '20px' }}>
      <h1 style={{ marginBottom: '30px' }}>Shelfex Accounts</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ marginBottom: '15px' }}>OAuth 2.0 Single Sign-On System</h2>
        <p style={{ lineHeight: '1.6', color: '#666' }}>
          This is the centralized authentication service for all Shelfex products 
          (ShelfScan, ShelfMuse, ShelfIntel).
        </p>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginTop: '30px',
        flexWrap: 'wrap'
      }}>
        <a 
          href="/login"
          style={{
            padding: '10px 20px',
            backgroundColor: '#0070f3',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
          }}
        >
          Login
        </a>
        <a 
          href="/register"
          style={{
            padding: '10px 20px',
            backgroundColor: '#fff',
            color: '#0070f3',
            textDecoration: 'none',
            borderRadius: '4px',
            border: '1px solid #0070f3',
          }}
        >
          Register
        </a>
        <a 
          href="/dashboard"
          style={{
            padding: '10px 20px',
            backgroundColor: '#fff',
            color: '#10b981',
            textDecoration: 'none',
            borderRadius: '4px',
            border: '1px solid #10b981',
          }}
        >
          Dashboard (Protected)
        </a>
      </div>

      <div style={{ 
        marginTop: '40px', 
        padding: '20px', 
        backgroundColor: '#f9f9f9',
        borderRadius: '4px'
      }}>
        <h3 style={{ marginBottom: '10px' }}>Test OAuth Flow</h3>
        <p style={{ fontSize: '14px', marginBottom: '15px', color: '#666' }}>
          Test the SSO flow by clicking the link below:
        </p>
        <a
          href="http://localhost:8000/api/v1/oauth/authorize?client_id=shelfscan&redirect_uri=http://localhost:3000/callback&response_type=code"
          style={{
            display: 'inline-block',
            padding: '8px 15px',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            textDecoration: 'none',
            color: '#333',
            fontSize: '14px',
          }}
        >
          Test ShelfScan Login
        </a>
      </div>

      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#fff9e6',
        borderRadius: '4px',
        border: '1px solid #ffe066',
        color: '#000000'
      }}>
        <p style={{ margin: 0, fontSize: '13px', color: '#000' }}>
          <strong>Test Credentials:</strong> test@shelfex.com / 12345
        </p>
      </div>
    </div>
  );
}
