import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/auth");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="text-2xl font-bold tracking-tight text-indigo-700">
          SnapClass
        </Link>

        <div className="flex items-center gap-5 text-sm font-medium">
          <Link to="/" className="text-slate-600 hover:text-indigo-700">
            Home
          </Link>

          {!isAuthenticated ? (
            <Link
              to="/auth"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
            >
              Get started
            </Link>
          ) : (
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-100"
            >
              Logout
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}