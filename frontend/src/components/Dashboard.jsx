import { useAuth } from "../context/AuthContext";
import StudentDashboard from "./StudentDashboard";
import AdminDashboard from "./AdminDashboard";
import FacultyDashboard from "./FacultyDashboard";

export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role?.toUpperCase();

  switch (role) {
    case "STUDENT":
      return <StudentDashboard />;

    case "ADMIN":
      return <AdminDashboard />;

    case "FACULTY":
      return <FacultyDashboard />;

    default:
      return (
        <section className="mx-auto max-w-5xl px-6 py-12 text-center">
          <h1 className="text-2xl font-bold">Unknown role</h1>
          <p className="mt-2 text-slate-600">
            Your account role could not be identified.
          </p>
        </section>
      );
  }
}
