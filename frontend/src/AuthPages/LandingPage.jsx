import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <section className="mx-auto flex min-h-[75vh] max-w-7xl flex-col items-center justify-center px-6 py-16 text-center">
      <span className="rounded-full bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-700">
        Your classroom, reimagined
      </span>

      <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
        A smarter way to{" "}
        <span className="text-indigo-600">learn and teach.</span>
      </h1>

      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
        Manage courses, track attendance, access learning materials, and bring
        your classroom experience together in one place.
      </p>

      <Link
        to="/auth"
        className="mt-8 rounded-xl bg-indigo-600 px-7 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700"
      >
        Get started
      </Link>
    </section>
  );
}