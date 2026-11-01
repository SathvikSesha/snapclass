import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <section className="mx-auto flex min-h-[65vh] max-w-5xl flex-col items-center justify-center px-6 text-center">
      <p className="mb-3 rounded-full bg-indigo-100 px-4 py-1 text-sm font-medium text-indigo-700">
        {user?.role || "Authenticated user"}
      </p>

      <h1 className="text-4xl font-bold">DASHBOARD</h1>

      <p className="mt-3 text-slate-600">
        Welcome{user?.email ? `, ${user.email}` : ""}! Authentication was successful.
      </p>
    </section>
  );
}