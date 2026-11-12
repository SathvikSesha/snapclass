import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import LandingPage from "./AuthPages/LandingPage";
import AuthPage from "./AuthPages/AuthPage";
import Dashboard from "./components/Dashboard";
import Header from "./components/Header";
import Footer from "./components/Footer";

export default function App() {
  const { isAuthenticated, isInitializing } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header />

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/auth"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <AuthPage />
              )
            }
          />
          <Route
            path="/dashboard"
            element={
              isInitializing && !isAuthenticated ? (
                <div className="flex min-h-[60vh] items-center justify-center p-8 text-center text-slate-500">
                  Restoring session...
                </div>
              ) : isAuthenticated ? (
                <Dashboard />
              ) : (
                <Navigate to="/auth" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}
