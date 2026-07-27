import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import UserLoginScreen from './pages/Login';
import UserApp from './pages/UserApp';

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [studentId, setStudentId] = useState('');

    const handleLogin = (id) => {
        setStudentId(id);
        setIsAuthenticated(true);
    };

    const handleLogout = () => {
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
