import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import UserLoginScreen from './pages/Login';
import UserApp from './pages/UserApp';

function App() {
    // Session Persistence — ดึง token จาก sessionStorage เมื่อโหลดหน้า
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        return !!sessionStorage.getItem('user_token');
    });
    const [studentId, setStudentId] = useState(() => {
        return sessionStorage.getItem('user_student_id') || '';
    });

    const handleLogin = (id, token) => {
        sessionStorage.setItem('user_token', token);
        sessionStorage.setItem('user_student_id', id);
        setStudentId(id);
        setIsAuthenticated(true);
    };

    const handleLogout = () => {
        sessionStorage.removeItem('user_token');
        sessionStorage.removeItem('user_student_id');
        setIsAuthenticated(false);
        setStudentId('');
    };

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route
                    path="/login"
                    element={
                        isAuthenticated ?
                            <Navigate to="/home" replace /> :
                            <UserLoginScreen onLoginSuccess={handleLogin} />
                    }
                />
                <Route
                    path="/home"
                    element={
                        isAuthenticated ?
                            <UserApp studentId={studentId} onLogout={handleLogout} /> :
                            <Navigate to="/login" replace />
                    }
                />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
