
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getStudentDashboard,
  getStudentSubjects,
  registerForSubject,
  getStudentAttendance,
  getStudentAttendanceHistory,
} from "../services/student.service";

function formatDate(value) {
  if (!value) return "—";

  // MySQL DATE values may arrive as YYYY-MM-DD.
  const dateString =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00`
      : value;

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(
    typeof value === "string" && value.includes(" ")
      ? value.replace(" ", "T")
      : value
  );

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

function getErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

const registrationMessages = {
  NOT_SCHEDULED: "Registration has not been scheduled by Admin yet.",
  UPCOMING: "Registration has not opened yet.",
  OPEN: "Registration is open. You can register for available subjects.",
  CLOSED: "The registration window is currently closed.",
};

export default function StudentDashboard() {
  const { user } = useAuth();

  const [dashboard, setDashboard] = useState(null);
  const [subjectData, setSubjectData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [registeringSubjectId, setRegisteringSubjectId] = useState(null);

  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [attendance, setAttendance] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");

  const loadDashboard = useCallback(async () => {
    setPageError("");

    try {
      const results = await Promise.allSettled([
        getStudentDashboard(),
        getStudentSubjects(),
      ]);

      const dashboardResult = results[0];
      const subjectsResult = results[1];

      if (dashboardResult.status === "fulfilled") {
        setDashboard(dashboardResult.value);
      }

      if (subjectsResult.status === "fulfilled") {
        setSubjectData(subjectsResult.value);
      }

      if (
        dashboardResult.status === "rejected" &&
        subjectsResult.status === "rejected"
      ) {
        throw dashboardResult.reason;
      }

      if (subjectsResult.status === "rejected") {
        setPageError(
          `Could not load the subject catalog: ${getErrorMessage(
            subjectsResult.reason
          )}`
        );
      } else if (dashboardResult.status === "rejected") {
        setPageError(
          `Could not load dashboard details: ${getErrorMessage(
            dashboardResult.reason
          )}`
        );
      }
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const subjects = subjectData?.subjects ?? [];

  const registeredSubjects = useMemo(
    () => subjects.filter((subject) => subject.isRegistered),
    [subjects]
  );

  const registeredCredits =
    subjectData?.registeredCredits ??
    dashboard?.registeredCredits ??
    0;

  const creditLimit =
    subjectData?.creditLimit ??
    dashboard?.creditLimit ??
    30;

  const remainingCredits =
    subjectData?.remainingCredits ??
    Math.max(0, creditLimit - registeredCredits);

  const registrationWindow = subjectData?.registrationWindow ?? {
    status: dashboard?.registrationStatus ?? "NOT_SCHEDULED",
    startsAt: null,
    endsAt: null,
  };

  const registrationStatus = registrationWindow.status;
  const registrationOpen = registrationStatus === "OPEN";

  const handleRegister = async (subject) => {
    setActionError("");
    setSuccessMessage("");
    setRegisteringSubjectId(subject.subjectId);

    try {
      await registerForSubject(subject.subjectId);

      setSuccessMessage(
        `${subject.subjectName} registered successfully.`
      );

      // Refresh server data so credits and registration state stay accurate.
      await loadDashboard();

      // If the selected subject was affected, refresh its attendance view
      // only when it remains registered.
      if (String(selectedSubjectId) === String(subject.subjectId)) {
        await loadAttendance(subject.subjectId);
      }
    } catch (error) {
      setActionError(getErrorMessage(error));

      // Refresh the registration status in case the window closed
      // between page load and the registration request.
      await loadDashboard();
    } finally {
      setRegisteringSubjectId(null);
    }
  };

  const loadAttendance = async (subjectId) => {
    setAttendance(null);
    setAttendanceHistory([]);
    setAttendanceError("");

    if (!subjectId) return;

    setAttendanceLoading(true);

    try {
      const [summary, history] = await Promise.all([
        getStudentAttendance(subjectId),
        getStudentAttendanceHistory(subjectId),
      ]);

      setAttendance(summary);
      setAttendanceHistory(history?.records ?? []);
    } catch (error) {
      setAttendanceError(getErrorMessage(error));
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleAttendanceSubjectChange = async (event) => {
    const subjectId = event.target.value;
    setSelectedSubjectId(subjectId);
    await loadAttendance(subjectId);
  };

  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-slate-600">Loading student dashboard...</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      {/* Header */}
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
          Student Portal
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Welcome{user?.email ? `, ${user.email}` : ""}
        </h1>

        <p className="mt-2 text-slate-600">
          Manage your subjects, registration, and attendance.
        </p>
      </header>

      {pageError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {pageError}
        </div>
      )}

      {/* Credit summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Registered subjects"
          value={subjectData?.registeredSubjects ?? registeredSubjects.length}
        />
        <SummaryCard
          label="Credits registered"
          value={`${registeredCredits} / ${creditLimit}`}
        />
        <SummaryCard
          label="Credits remaining"
          value={remainingCredits}
        />
      </div>

      {/* Registration window */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Subject registration</h2>
            <p className="mt-1 text-sm text-slate-600">
              {registrationMessages[registrationStatus] ??
                "Registration status is unavailable."}
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              registrationOpen
                ? "bg-green-100 text-green-700"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {registrationStatus.replaceAll("_", " ")}
          </span>
        </div>

        {registrationWindow.startsAt && (
          <p className="mt-3 text-sm text-slate-600">
            Starts: {formatDateTime(registrationWindow.startsAt)}
          </p>
        )}

        {registrationWindow.endsAt && (
          <p className="mt-1 text-sm text-slate-600">
            Ends: {formatDateTime(registrationWindow.endsAt)}
          </p>
        )}

        {actionError && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {actionError}
          </p>
        )}

        {successMessage && (
          <p role="status" className="mt-4 text-sm text-green-700">
            {successMessage}
          </p>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-medium">Subject</th>
                <th className="px-3 py-3 font-medium">Code</th>
                <th className="px-3 py-3 font-medium">Credits</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Action</th>
              </tr>
            </thead>

            <tbody>
              {subjects.map((subject) => (
                <tr
                  key={subject.subjectId}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-4 font-medium text-slate-800">
                    {subject.subjectName}
                  </td>
                  <td className="px-3 py-4 text-slate-600">
                    {subject.subjectCode}
                  </td>
                  <td className="px-3 py-4">{subject.credits}</td>
                  <td className="px-3 py-4">
                    {subject.isRegistered ? "Registered" : "Not registered"}
                  </td>
                  <td className="px-3 py-4">
                    {subject.isRegistered ? (
                      <button
                        type="button"
                        disabled
                        className="rounded-lg bg-slate-100 px-3 py-2 text-slate-500"
                      >
                        Registered
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          !registrationOpen ||
                          registeringSubjectId !== null
                        }
                        onClick={() => handleRegister(subject)}
                        className="rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {registeringSubjectId === subject.subjectId
                          ? "Registering..."
                          : "Register"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {subjects.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-slate-500"
                  >
                    No subjects are available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!registrationOpen && subjects.some(
          (subject) => !subject.isRegistered
        ) && (
          <p className="mt-3 text-sm text-slate-500">
            Registration buttons become available when Admin opens the
            registration window.
          </p>
        )}
      </section>

      {/* Attendance */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">My attendance</h2>
        <p className="mt-1 text-sm text-slate-600">
          Select a registered subject to view your attendance.
        </p>

        <div className="mt-4 max-w-md">
          <label
            htmlFor="attendance-subject"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Select subject
          </label>

          <select
            id="attendance-subject"
            value={selectedSubjectId}
            onChange={handleAttendanceSubjectChange}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">Choose a subject</option>
            {registeredSubjects.map((subject) => (
              <option
                key={subject.subjectId}
                value={subject.subjectId}
              >
                {subject.subjectCode} — {subject.subjectName}
              </option>
            ))}
          </select>
        </div>

        {attendanceLoading && (
          <p className="mt-5 text-slate-600">Loading attendance...</p>
        )}

        {attendanceError && (
          <p role="alert" className="mt-5 text-sm text-red-600">
            {attendanceError}
          </p>
        )}

        {attendance && !attendanceLoading && (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-4">
              <SummaryCard
                label="Attendance"
                value={`${attendance.attendancePercentage}%`}
              />
              <SummaryCard
                label="Total sessions"
                value={attendance.totalSessions}
              />
              <SummaryCard
                label="Present"
                value={attendance.presentCount}
              />
              <SummaryCard
                label="Absent"
                value={attendance.absentCount}
              />
            </div>

            <h3 className="mt-7 font-semibold">Daily attendance history</h3>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[400px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {attendanceHistory.map((record) => (
                    <tr
                      key={record.sessionId}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-3 py-3">
                        {formatDate(record.attendanceDate)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            record.status === "PRESENT"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {attendanceHistory.length === 0 && (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-3 py-6 text-center text-slate-500"
                      >
                        No attendance records are available for this subject.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!selectedSubjectId && (
          <p className="mt-5 text-sm text-slate-500">
            Select a subject to load its attendance summary and daily history.
          </p>
        )}

        {selectedSubjectId &&
          !attendance &&
          !attendanceLoading &&
          !attendanceError && (
            <p className="mt-5 text-sm text-slate-500">
              No attendance summary is available yet.
            </p>
          )}
      </section>
    </section>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
