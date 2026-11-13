import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BrandLogo from "./BrandLogo";

const NAV_LINKS = [
  { id: "features", label: "Features" },
  { id: "roles", label: "For everyone" },
  { id: "quiz", label: "AI quizzes" },
];

export default function Header() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu when the page changes
  useEffect(() => setOpen(false), [pathname]);

  function handleLogout() {
    logout();
    navigate("/auth");
  }

  // Smooth scroll to a landing page section (works from any page)
  function goToSection(e, id) {
    e.preventDefault();
    setOpen(false);
    const scroll = () =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (pathname !== "/") {
      navigate("/");
      setTimeout(scroll, 150);
    } else {
      scroll();
    }
  }

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "border-slate-200/80 bg-white/80 shadow-sm shadow-slate-200/60 backdrop-blur-xl"
          : "border-transparent bg-white/50 backdrop-blur-md"
      }`}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
        .sc-display { font-family: 'Sora', 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
        .sc-root { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
        .sc-nav-link { position: relative; }
        .sc-nav-link::after { content: ""; position: absolute; left: 0; right: 0; bottom: -4px; height: 2px; border-radius: 2px; background: #6366f1; transform: scaleX(0); transform-origin: left; transition: transform .3s cubic-bezier(.22,1,.36,1); }
        .sc-nav-link:hover::after { transform: scaleX(1); }
      `}</style>

      <nav className="sc-root mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-6">
        <Link to="/" aria-label="SnapClass home">
          <BrandLogo />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.id}
              href={`/#${l.id}`}
              onClick={(e) => goToSection(e, l.id)}
              className="sc-nav-link transition-colors hover:text-slate-900"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {!isAuthenticated ? (
            <>
              <Link
                to="/auth"
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Sign in
              </Link>
              <Link
                to="/auth"
                className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-95"
              >
                Get started
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/dashboard"
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="cursor-pointer rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
              >
                Logout
              </button>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
          className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100 md:hidden"
        >
          <span className={`absolute h-0.5 w-5 rounded bg-current transition-all duration-300 ${open ? "rotate-45" : "-translate-y-1.5"}`} />
          <span className={`absolute h-0.5 w-5 rounded bg-current transition-all duration-300 ${open ? "opacity-0" : ""}`} />
          <span className={`absolute h-0.5 w-5 rounded bg-current transition-all duration-300 ${open ? "-rotate-45" : "translate-y-1.5"}`} />
        </button>
      </nav>

      {/* Mobile panel */}
      <div
        className={`sc-root grid overflow-hidden transition-all duration-400 ease-out md:hidden ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0">
          <div className="space-y-1 border-t border-slate-100 px-5 pt-3 pb-5">
            {NAV_LINKS.map((l) => (
              <a
                key={l.id}
                href={`/#${l.id}`}
                onClick={(e) => goToSection(e, l.id)}
                className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              >
                {l.label}
              </a>
            ))}
            <div className="pt-3">
              {!isAuthenticated ? (
                <Link
                  to="/auth"
                  className="block rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-3 text-center text-sm font-semibold text-white shadow-md"
                >
                  Get started
                </Link>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/dashboard"
                    className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700"
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="cursor-pointer rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}