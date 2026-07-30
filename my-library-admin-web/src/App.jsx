import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLoginScreen from './pages/Login';
import AdminDashboardScreen from './pages/Home';

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red' }}>
          <h2>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  // Session Persistence — ดึง token จาก sessionStorage เมื่อโหลดหน้า
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!sessionStorage.getItem('admin_token');
  });
  const [adminData, setAdminData] = useState(() => {
    const stored = sessionStorage.getItem('admin_data');
    return stored ? JSON.parse(stored) : null;
  });

  const handleLoginSuccess = (data, token) => {
    sessionStorage.setItem('admin_token', token);
    sessionStorage.setItem('admin_data', JSON.stringify(data));
    setAdminData(data);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_data');
    setAdminData(null);
    setIsAuthenticated(false);
  };

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route 
            path="/login" 
            element={
              isAuthenticated ? 
                <Navigate to="/home" replace /> : 
                <AdminLoginScreen onLoginSuccess={handleLoginSuccess} />
            } 
          />
          <Route 
            path="/home" 
            element={
              isAuthenticated ? 
                <AdminDashboardScreen adminData={adminData} onLogout={handleLogout} /> : 
                <Navigate to="/login" replace />
            } 
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
