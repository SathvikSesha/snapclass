import { Link } from "react-router-dom";
import BrandLogo from "./BrandLogo";

export default function Footer() {
  function goTo(e, id) {
    const el = document.getElementById(id);
    if (!el) return; // not on the landing page; let the Link navigate home
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <footer className="sc-root relative overflow-hidden border-t border-slate-200/80 bg-gradient-to-b from-white to-slate-50">
      <div className="pointer-events-none absolute -bottom-24 left-1/2 h-48 w-[40rem] -translate-x-1/2 rounded-full bg-indigo-100/60 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <BrandLogo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
            An AI-powered classroom platform for attendance, study materials and
            quizzes, built for admins, faculty and students.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">Explore</p>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
            {[
              { id: "features", label: "Features" },
              { id: "roles", label: "For everyone" },
              { id: "quiz", label: "AI quizzes" },
            ].map((l) => (
              <li key={l.id}>
                <Link
                  to="/"
                  onClick={(e) => goTo(e, l.id)}
                  className="inline-block transition duration-200 hover:translate-x-1 hover:text-indigo-600"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">Portals</p>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
            {["Student", "Faculty", "Admin"].map((r) => (
              <li key={r}>
                <Link
                  to="/auth"
                  className="inline-block transition duration-200 hover:translate-x-1 hover:text-indigo-600"
                >
                  {r} sign in
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="relative border-t border-slate-200/80 px-6 py-5 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} SnapClass. Learn smarter, together.
      </div>
    </footer>
  );
}