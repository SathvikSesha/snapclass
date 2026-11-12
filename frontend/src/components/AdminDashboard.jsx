import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getAdminDashboard,
  getAdminSubjects,
  createAdminSubject,
  getAdminSubjectRequests,
  reviewAdminSubjectRequest,
  getAdminRegistrationWindow,
  createAdminRegistrationWindow,
  updateAdminRegistrationWindow,
} from "../services/admin.service";

function getErrorMessage(error) {
  return error?.response?.data?.message ||
    error?.message ||
    "Something went wrong. Please try again.";
}

function unwrapList(result, key) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.[key])) return result[key];
  return [];
}

// Convert MySQL DATETIME or ISO strings to a datetime-local input value.
function toDateTimeLocal(value) {
  if (!value) return "";

  const text = String(value);
  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?/
  );

  return match ? `${match[1]}T${match[2]}` : "";
}

// Backend expects YYYY-MM-DD HH:mm:ss.
function toBackendDateTime(value) {
  return value ? `${value.replace("T", " ")}:00` : "";
}

function formatDateTime(value) {
  if (!value) return "—";
  return String(value).replace("T", " ");
}

export default function AdminDashboard() {
  const { user } = useAuth();

  const [dashboard, setDashboard] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requestFilter, setRequestFilter] = useState("ALL");
  const [windowData, setWindowData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const [subjectForm, setSubjectForm] = useState({
    subjectCode: "",
    name: "",
    description: "",
    credits: 3,
  });

  const [windowForm, setWindowForm] = useState({
    startsAt: "",
    endsAt: "",
  });
  const [editingWindowId, setEditingWindowId] = useState(null);

  const loadAll = useCallback(async () => {
    setPageError("");
    setLoading(true);

    const results = await Promise.allSettled([
      getAdminDashboard(),
      getAdminSubjects(),
      getAdminSubjectRequests("ALL"),
      getAdminRegistrationWindow(),
    ]);

    const [dashboardResult, subjectsResult, requestsResult, windowResult] =
      results;

    if (dashboardResult.status === "fulfilled") {
      setDashboard(dashboardResult.value);
    }

    if (subjectsResult.status === "fulfilled") {
      setSubjects(unwrapList(subjectsResult.value, "subjects"));
    }

    if (requestsResult.status === "fulfilled") {
      setRequests(unwrapList(requestsResult.value, "requests"));
    }

    if (windowResult.status === "fulfilled") {
      const result = windowResult.value;
      setWindowData(result?.registrationWindow ? result : {
        status: result?.status ?? "NOT_SCHEDULED",
        registrationWindow: result?.id ? result : null,
      });
    }

    const failed = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status === "rejected");

    if (failed.length) {
      const messages = failed.map(({ result, index }) => {
        const labels = [
          "Dashboard overview",
          "Subject list",
          "Faculty requests",
          "Registration schedule",
        ];
        return `${labels[index]}: ${getErrorMessage(result.reason)}`;
      });

      setPageError(messages.join(" | "));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const registrationWindow = windowData?.registrationWindow ?? null;

  const displayedRequests = useMemo(() => {
    if (requestFilter === "ALL") return requests;
    return requests.filter(
      (r) => String(r.status ?? "").toUpperCase() === requestFilter
    );
  }, [requests, requestFilter]);

  const pendingRequestsCount = useMemo(
    () =>
      requests.filter((r) => String(r.status ?? "").toUpperCase() === "PENDING")
        .length,
    [requests]
  );

  const handleCreateSubject = async (event) => {
    event.preventDefault();
    setActionError("");
    setNotice("");
    setBusyAction("subject");

    try {
      await createAdminSubject({
        subjectCode: subjectForm.subjectCode.trim(),
        name: subjectForm.name.trim(),
        description: subjectForm.description.trim() || null,
        credits: Number(subjectForm.credits) || 3,
      });

      setSubjectForm({
        subjectCode: "",
        name: "",
        description: "",
        credits: 3,
      });

      setNotice("Subject created successfully.");
      await loadAll();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyAction("");
    }
  };

  const handleReviewRequest = async (request, status) => {
    const requestId = request.id ?? request.requestId;
    if (!requestId) {
      setActionError("This request has no recognizable request ID.");
      return;
    }

    setActionError("");
    setNotice("");
    setBusyAction(`request-${requestId}`);

    try {
      await reviewAdminSubjectRequest(requestId, status);
      setNotice(`Request #${requestId} ${status.toLowerCase()} successfully.`);
      await loadAll();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyAction("");
    }
  };

  const handleWindowSubmit = async (event) => {
    event.preventDefault();
    setActionError("");
    setNotice("");

    if (
      !windowForm.startsAt ||
      !windowForm.endsAt ||
      windowForm.endsAt <= windowForm.startsAt
    ) {
      setActionError("Choose a valid start and end time.");
      return;
    }

    setBusyAction("window");

    try {
      const payload = {
        startsAt: toBackendDateTime(windowForm.startsAt),
        endsAt: toBackendDateTime(windowForm.endsAt),
      };

      if (editingWindowId) {
        await updateAdminRegistrationWindow(editingWindowId, payload);
        setNotice("Registration window updated successfully.");
      } else {
        await createAdminRegistrationWindow(payload);
        setNotice("Registration window created successfully.");
      }

      setEditingWindowId(null);
      setWindowForm({ startsAt: "", endsAt: "" });
      await loadAll();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyAction("");
    }
  };

  const startEditingWindow = () => {
    if (!registrationWindow?.id) {
      setActionError("No registration window is available to edit.");
      return;
    }

    if (registrationWindow.status !== "UPCOMING") {
      setActionError("Only an upcoming registration window can be edited.");
      return;
    }

    setActionError("");
    setNotice("");
    setEditingWindowId(registrationWindow.id);
    setWindowForm({
      startsAt: toDateTimeLocal(registrationWindow.startsAt),
      endsAt: toDateTimeLocal(registrationWindow.endsAt),
    });
  };

  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-6 py-12 text-center text-slate-600">
        Loading Admin dashboard...
      </section>
    );
  }

  const counts = dashboard?.counts ?? dashboard ?? {};

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            SnapClass · Admin Portal
          </p>
          <h1 className="mt-2 text-3xl font-bold">Admin dashboard</h1>
          <p className="mt-2 text-slate-600">
            Welcome{user?.email ? `, ${user.email}` : ""}. Manage subjects,
            faculty requests, and student registration.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAll}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Refresh data
        </button>
      </header>

      {pageError && (
        <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {pageError}
        </div>
      )}

      {actionError && (
        <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
          {notice}
        </div>
      )}

      {/* Overview */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Students"
            value={counts.totalStudents ?? counts.studentsCount ?? counts.students ?? "—"}
          />
          <MetricCard
            label="Faculty"
            value={counts.totalFaculty ?? counts.facultyCount ?? counts.faculty ?? "—"}
          />
          <MetricCard
            label="Subjects"
            value={counts.totalSubjects ?? counts.subjectsCount ?? counts.subjects ?? subjects.length}
          />
          <MetricCard
            label="Pending requests"
            value={counts.pendingRequests ?? counts.totalPendingRequests ?? pendingRequestsCount}
          />
        </div>
      </section>

      {/* Create subject */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Create subject</h2>

        <form onSubmit={handleCreateSubject} className="mt-4 grid gap-4 md:grid-cols-3">
          <FormField label="Subject code">
            <input
              required
              maxLength={30}
              value={subjectForm.subjectCode}
              onChange={(event) =>
                setSubjectForm((old) => ({
                  ...old,
                  subjectCode: event.target.value,
                }))
              }
              placeholder="e.g. CS301"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </FormField>

          <FormField label="Subject name">
            <input
              required
              maxLength={150}
              value={subjectForm.name}
              onChange={(event) =>
                setSubjectForm((old) => ({
                  ...old,
                  name: event.target.value,
                }))
              }
              placeholder="e.g. Database Management Systems"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </FormField>

          <FormField label="Credits (1–30)">
            <input
              type="number"
              min={1}
              max={30}
              required
              value={subjectForm.credits}
              onChange={(event) =>
                setSubjectForm((old) => ({
                  ...old,
                  credits: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </FormField>

          <div className="md:col-span-3">
            <FormField label="Description (optional)">
              <textarea
                rows={3}
                value={subjectForm.description}
                onChange={(event) =>
                  setSubjectForm((old) => ({
                    ...old,
                    description: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </FormField>
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={busyAction === "subject"}
              className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busyAction === "subject" ? "Creating..." : "Create subject"}
            </button>
          </div>
        </form>
      </section>

      {/* Subject list */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">All subjects ({subjects.length})</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="px-3 py-3 font-medium">Code</th>
                <th className="px-3 py-3 font-medium">Subject</th>
                <th className="px-3 py-3 font-medium">Credits</th>
                <th className="px-3 py-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((subject) => (
                <tr
                  key={subject.id ?? subject.subjectId}
                  className="border-b last:border-0"
                >
                  <td className="px-3 py-3 font-medium">{subject.subjectCode}</td>
                  <td className="px-3 py-3 font-medium">{subject.name ?? subject.subjectName}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{subject.credits ?? 3}</td>
                  <td className="px-3 py-3 text-slate-600">
                    {subject.description || "—"}
                  </td>
                </tr>
              ))}

              {!subjects.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    No subjects found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Faculty requests */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Faculty subject requests</h2>
            <p className="mt-1 text-sm text-slate-600">
              Review and approve subject assignment requests from faculty members.
            </p>
          </div>

          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 p-1">
            {["ALL", "PENDING", "APPROVED", "REJECTED"].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setRequestFilter(tab)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${
                  requestFilter === tab
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab === "ALL"
                  ? `All (${requests.length})`
                  : tab === "PENDING"
                  ? `Pending (${pendingRequestsCount})`
                  : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {displayedRequests.map((request) => {
            const requestId = request.id ?? request.requestId;
            const status = String(request.status ?? "").toUpperCase();
            const pending = status === "PENDING";
            const approved = status === "APPROVED";
            const rejected = status === "REJECTED";

            return (
              <article
                key={requestId}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      {request.facultyName ?? request.fullName ?? "Faculty"}
                    </p>
                    {request.facultyEmail && (
                      <span className="text-xs text-slate-500">
                        &lt;{request.facultyEmail}&gt;
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        pending
                          ? "bg-amber-100 text-amber-800"
                          : approved
                          ? "bg-green-100 text-green-800"
                          : rejected
                          ? "bg-red-100 text-red-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {status || "Unknown"}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-slate-600">
                    <span className="font-medium text-slate-800">
                      {request.subjectName ?? request.name ?? "Subject"}
                    </span>
                    {request.subjectCode ? ` (${request.subjectCode})` : ""}
                    {request.credits ? ` · ${request.credits} Credits` : ""}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Requested: {formatDateTime(request.requestedAt)}
                    {request.reviewedAt && ` · Reviewed: ${formatDateTime(request.reviewedAt)}`}
                  </p>
                </div>

                {pending && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyAction === `request-${requestId}`}
                      onClick={() => handleReviewRequest(request, "APPROVED")}
                      className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {busyAction === `request-${requestId}` ? "Processing..." : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={busyAction === `request-${requestId}`}
                      onClick={() => handleReviewRequest(request, "REJECTED")}
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {busyAction === `request-${requestId}` ? "Processing..." : "Reject"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}

          {!displayedRequests.length && (
            <p className="py-6 text-center text-sm text-slate-500">
              No faculty requests found matching the current filter.
            </p>
          )}
        </div>
      </section>

      {/* Registration window */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Student registration window</h2>

        <div className="mt-3 rounded-lg bg-slate-50 p-4">
          <p className="font-medium">
            Status: {windowData?.status ?? "NOT_SCHEDULED"}
          </p>
          {registrationWindow && (
            <>
              <p className="mt-2 text-sm text-slate-600">
                Starts: {formatDateTime(registrationWindow.startsAt)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Ends: {formatDateTime(registrationWindow.endsAt)}
              </p>
            </>
          )}
        </div>

        {registrationWindow?.status === "OPEN" && (
          <p className="mt-3 text-sm text-amber-700">
            This window has opened and cannot be edited using the current backend rules.
          </p>
        )}

        <form onSubmit={handleWindowSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
          <FormField label="Start date and time">
            <input
              required
              type="datetime-local"
              value={windowForm.startsAt}
              onChange={(event) =>
                setWindowForm((old) => ({
                  ...old,
                  startsAt: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </FormField>

          <FormField label="End date and time">
            <input
              required
              type="datetime-local"
              value={windowForm.endsAt}
              onChange={(event) =>
                setWindowForm((old) => ({
                  ...old,
                  endsAt: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </FormField>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={busyAction === "window"}
              className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busyAction === "window"
                ? "Saving..."
                : editingWindowId
                  ? "Update registration window"
                  : "Create registration window"}
            </button>

            {registrationWindow?.status === "UPCOMING" && !editingWindowId && (
              <button
                type="button"
                onClick={startEditingWindow}
                className="rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50"
              >
                Edit upcoming window
              </button>
            )}

            {editingWindowId && (
              <button
                type="button"
                onClick={() => {
                  setEditingWindowId(null);
                  setWindowForm({ startsAt: "", endsAt: "" });
                }}
                className="rounded-lg border border-slate-300 px-4 py-2"
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}
