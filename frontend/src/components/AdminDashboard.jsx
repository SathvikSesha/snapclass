import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  createAdminRegistrationWindow,
  createAdminSubject,
  disableAdminFacultyAccount,
  disableAdminStudentAccount,
  getAdminDashboard,
  getAdminFaculty,
  getAdminFacultySubjects,
  getAdminRegistrationWindow,
  getAdminStudents,
  getAdminStudentSubjects,
  getAdminSubjectRequests,
  getAdminSubjects,
  reviewAdminSubjectRequest,
  updateAdminRegistrationWindow,
} from "../services/admin.service";

// ==========================================
// HELPER UTILITIES (unchanged logic)
// ==========================================
function getErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

function unwrapList(result, key) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.[key])) return result[key];
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.[key])) return result.data[key];
  return [];
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?/);
  return match ? `${match[1]}T${match[2]}` : "";
}

function toBackendDateTime(value) {
  if (!value) return "";
  const clean = value.replace("T", " ");
  return clean.length === 16 ? `${clean}:00` : clean;
}

function formatReadableDateTime(value) {
  if (!value) return "—";
  const normalized = String(value).replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).replace("T", " ");
  }
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getTimeBasedGreeting(dateObj) {
  const hour = dateObj.getHours();
  if (hour < 12) {
    return { salutation: "Good morning", subtitle: "Here is how your institution is doing this morning." };
  }
  if (hour < 17) {
    return { salutation: "Good afternoon", subtitle: "Classes and faculty work are running smoothly." };
  }
  return { salutation: "Good evening", subtitle: "A calm moment to review requests and schedules." };
}

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
}

const icon = (d) => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const NAV_ITEMS = [
  {
    id: "overview",
    label: "Overview",
    shortDesc: "Numbers at a glance",
    icon: icon("M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"),
  },
  {
    id: "subjects",
    label: "Subjects",
    shortDesc: "Create and view courses",
    icon: icon("M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13"),
  },
  {
    id: "requests",
    label: "Faculty requests",
    shortDesc: "Approve or reject",
    icon: icon("M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"),
  },
  {
    id: "window",
    label: "Registration",
    shortDesc: "When students can enroll",
    icon: icon("M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z"),
  },
  {
    id: "students",
    label: "Students",
    shortDesc: "Subjects and access",
    icon: icon("M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0"),
  },
  {
    id: "faculty",
    label: "Faculty",
    shortDesc: "Teaching and access",
    icon: icon("M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 14a6.5 6.5 0 013.5 6"),
  },
];

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition duration-200 focus:border-rose-400 focus:ring-4 focus:ring-rose-100";

const primaryBtn =
  "cursor-pointer rounded-xl bg-gradient-to-r from-fuchsia-500 to-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-200/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

const ghostBtn =
  "cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition duration-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[.98] disabled:opacity-50";

export default function AdminDashboard() {
  const { user, logout } = useAuth();

  // Navigation & UI State
  const [activeTab, setActiveTab] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Core Data State
  const [dashboard, setDashboard] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [requests, setRequests] = useState([]);
  const [windowData, setWindowData] = useState(null);
  const [students, setStudents] = useState([]);
  const [facultyList, setFacultyList] = useState([]);

  // Filter & Search State
  const [requestFilter, setRequestFilter] = useState("ALL");
  const [reviewNotes, setReviewNotes] = useState({});
  const [subjectSearch, setSubjectSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [facultySearch, setFacultySearch] = useState("");

  // Forms State
  const [subjectForm, setSubjectForm] = useState({
    subjectCode: "",
    name: "",
    description: "",
    credits: 3,
  });

  const [windowForm, setWindowForm] = useState({ startsAt: "", endsAt: "" });
  const [editingWindowId, setEditingWindowId] = useState(null);

  // Slide-over Inspector
  const [inspector, setInspector] = useState({
    open: false,
    type: null, // "student" | "faculty"
    person: null,
    loading: false,
    error: "",
    subjects: [],
  });

  // Confirm Account Disable
  const [confirmDisable, setConfirmDisable] = useState(null);

  // Global Status & Loading State
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState("");

  // Live Clock Update every 30s
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Load All 6 Admin Data Streams in Parallel
  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    setPageError("");

    const results = await Promise.allSettled([
      getAdminDashboard(),
      getAdminSubjects(),
      getAdminSubjectRequests("ALL"),
      getAdminRegistrationWindow(),
      getAdminStudents(),
      getAdminFaculty(),
    ]);

    const [dashboardRes, subjectsRes, requestsRes, windowRes, studentsRes, facultyRes] = results;

    if (dashboardRes.status === "fulfilled") setDashboard(dashboardRes.value);
    if (subjectsRes.status === "fulfilled") setSubjects(unwrapList(subjectsRes.value, "subjects"));
    if (requestsRes.status === "fulfilled") setRequests(unwrapList(requestsRes.value, "requests"));
    if (windowRes.status === "fulfilled") {
      const val = windowRes.value;
      setWindowData(
        val?.registrationWindow !== undefined
          ? val
          : {
              status: val?.status ?? "NOT_SCHEDULED",
              registrationWindow: val?.id ? val : null,
            }
      );
    }
    if (studentsRes.status === "fulfilled") setStudents(unwrapList(studentsRes.value, "students"));
    if (facultyRes.status === "fulfilled") setFacultyList(unwrapList(facultyRes.value, "faculty"));

    const failed = results
      .map((res, idx) => ({ res, idx }))
      .filter(({ res }) => res.status === "rejected");

    if (failed.length > 0) {
      const labels = ["Dashboard", "Subjects", "Faculty Requests", "Registration Window", "Students", "Faculty"];
      setPageError(
        failed.map(({ res, idx }) => `${labels[idx]}: ${getErrorMessage(res.reason)}`).join(" • ")
      );
    }

    setLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Auto-clear flash notices
  useEffect(() => {
    if (!notice && !actionError) return;
    const t = setTimeout(() => {
      setNotice("");
      setActionError("");
    }, 5500);
    return () => clearTimeout(t);
  }, [notice, actionError]);

  function switchFeatureTab(tabId) {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
    setActionError("");
    setNotice("");
  }

  // ==========================================
  // COMPUTED DATA & METRICS
  // ==========================================
  const greeting = useMemo(() => getTimeBasedGreeting(now), [now]);
  const counts = dashboard?.counts ?? dashboard ?? {};
  const recentLogs = useMemo(
    () => unwrapList(dashboard?.recentLogs ?? dashboard, "recentLogs"),
    [dashboard]
  );

  const registrationWindow = windowData?.registrationWindow ?? null;
  const windowStatus = String(
    windowData?.status ?? registrationWindow?.status ?? "NOT_SCHEDULED"
  ).toUpperCase();

  const pendingRequestsCount = useMemo(
    () => requests.filter((r) => String(r.status ?? "").toUpperCase() === "PENDING").length,
    [requests]
  );

  const filteredRequests = useMemo(() => {
    if (requestFilter === "ALL") return requests;
    return requests.filter((r) => String(r.status ?? "").toUpperCase() === requestFilter);
  }, [requests, requestFilter]);

  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(
      (s) =>
        String(s.subjectCode ?? "").toLowerCase().includes(q) ||
        String(s.name ?? s.subjectName ?? "").toLowerCase().includes(q) ||
        String(s.description ?? "").toLowerCase().includes(q)
    );
  }, [subjects, subjectSearch]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        String(s.fullName ?? s.name ?? "").toLowerCase().includes(q) ||
        String(s.email ?? "").toLowerCase().includes(q) ||
        String(s.studentId ?? s.id ?? "").toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  const filteredFaculty = useMemo(() => {
    const q = facultySearch.trim().toLowerCase();
    if (!q) return facultyList;
    return facultyList.filter(
      (f) =>
        String(f.fullName ?? f.name ?? "").toLowerCase().includes(q) ||
        String(f.email ?? "").toLowerCase().includes(q) ||
        String(f.facultyId ?? f.id ?? "").toLowerCase().includes(q)
    );
  }, [facultyList, facultySearch]);

  // ==========================================
  // ACTION HANDLERS (unchanged logic)
  // ==========================================
  async function handleCreateSubject(e) {
    e.preventDefault();
    setActionError("");
    setNotice("");

    if (!subjectForm.subjectCode.trim() || !subjectForm.name.trim()) {
      setActionError("Subject code and name are both required.");
      return;
    }

    setBusyAction("create-subject");
    try {
      const res = await createAdminSubject(subjectForm);
      setSubjectForm({ subjectCode: "", name: "", description: "", credits: 3 });
      setNotice(res?.message || "Subject created and added to catalog.");
      await loadAll(true);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusyAction("");
    }
  }

  async function handleReviewRequest(request, decision) {
    const requestId = request.id ?? request.requestId;
    if (!requestId) {
      setActionError("Missing request ID.");
      return;
    }

    setActionError("");
    setNotice("");
    setBusyAction(`request-${requestId}`);

    try {
      const note = reviewNotes[requestId] || "";
      const res = await reviewAdminSubjectRequest(requestId, decision, note);
      setNotice(res?.message || `Request #${requestId} marked as ${decision.toLowerCase()}.`);
      setReviewNotes((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      await loadAll(true);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusyAction("");
    }
  }

  async function handleWindowSubmit(e) {
    e.preventDefault();
    setActionError("");
    setNotice("");

    if (!windowForm.startsAt || !windowForm.endsAt) {
      setActionError("Please select both start and end timestamps.");
      return;
    }

    if (windowForm.endsAt <= windowForm.startsAt) {
      setActionError("End timestamp must be strictly after the start timestamp.");
      return;
    }

    const endMs = new Date(windowForm.endsAt).getTime();
    if (!Number.isNaN(endMs) && endMs <= Date.now()) {
      setActionError("End date and time must be in the future.");
      return;
    }

    setBusyAction("save-window");
    try {
      const payload = {
        startsAt: toBackendDateTime(windowForm.startsAt),
        endsAt: toBackendDateTime(windowForm.endsAt),
      };

      if (editingWindowId) {
        const res = await updateAdminRegistrationWindow(editingWindowId, payload);
        setNotice(res?.message || "Registration window updated successfully.");
      } else {
        const res = await createAdminRegistrationWindow(payload);
        setNotice(res?.message || "Registration window scheduled successfully.");
      }

      setEditingWindowId(null);
      setWindowForm({ startsAt: "", endsAt: "" });
      await loadAll(true);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusyAction("");
    }
  }

  function startEditingWindow() {
    if (!registrationWindow?.id) {
      setActionError("No scheduled window ID found to edit.");
      return;
    }
    if (windowStatus !== "UPCOMING") {
      setActionError("Only an UPCOMING registration window can be modified.");
      return;
    }
    setEditingWindowId(registrationWindow.id);
    setWindowForm({
      startsAt: toDateTimeLocal(registrationWindow.startsAt),
      endsAt: toDateTimeLocal(registrationWindow.endsAt),
    });
    setNotice("Loaded upcoming window into editor below.");
  }

  async function openSubjectInspector(type, person) {
    const id =
      type === "student"
        ? person.studentId ?? person.id ?? person.userId
        : person.facultyId ?? person.id ?? person.userId;

    if (!id) {
      setActionError(`Unable to determine ${type} ID for inspection.`);
      return;
    }

    setInspector({ open: true, type, person, loading: true, error: "", subjects: [] });

    try {
      const data =
        type === "student"
          ? await getAdminStudentSubjects(id)
          : await getAdminFacultySubjects(id);

      const list = unwrapList(data, "subjects");
      setInspector((prev) => ({
        ...prev,
        loading: false,
        person: { ...person, ...(data?.student || data?.faculty || {}) },
        subjects: list,
      }));
    } catch (err) {
      setInspector((prev) => ({ ...prev, loading: false, error: getErrorMessage(err) }));
    }
  }

  function closeInspector() {
    setInspector({ open: false, type: null, person: null, loading: false, error: "", subjects: [] });
  }

  async function executeAccountDisable() {
    if (!confirmDisable) return;
    const { role, accountId, name } = confirmDisable;

    setBusyAction(`disable-${role}-${accountId}`);
    setActionError("");
    setNotice("");

    try {
      const res =
        role === "student"
          ? await disableAdminStudentAccount(accountId)
          : await disableAdminFacultyAccount(accountId);

      setNotice(
        res?.message ||
          `${role.toUpperCase()} account for ${name} disabled & active sessions revoked.`
      );
      setConfirmDisable(null);
      await loadAll(true);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusyAction("");
    }
  }

  const adminDisplayName = useMemo(() => {
    if (user?.fullName) return user.fullName;
    if (user?.email) return user.email.split("@")[0];
    return "Administrator";
  }, [user]);

  const pendingList = requests.filter((r) => String(r.status ?? "").toUpperCase() === "PENDING");

  return (
    <div className="sc-root relative min-h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
        .sc-root { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
        .sc-display { font-family: 'Sora', 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
        @keyframes sc-enter { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes sc-slide { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: none; } }
        @keyframes sc-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sc-pop { from { opacity: 0; transform: scale(.94) translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes sc-blob { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(24px,-26px,0) scale(1.06); } }
        @keyframes sc-spin { to { transform: rotate(360deg); } }
        .sc-enter { animation: sc-enter .5s cubic-bezier(.22,1,.36,1) both; }
        .sc-slide { animation: sc-slide .45s cubic-bezier(.22,1,.36,1) both; }
        .sc-fade { animation: sc-fade .3s ease-out both; }
        .sc-pop { animation: sc-pop .35s cubic-bezier(.22,1,.36,1) both; }
        .sc-blob { animation: sc-blob 16s ease-in-out infinite; }
        .sc-spin { animation: sc-spin .9s linear infinite; }
        .sc-stagger > * { animation: sc-enter .5s cubic-bezier(.22,1,.36,1) both; }
        .sc-stagger > *:nth-child(2) { animation-delay: .06s; }
        .sc-stagger > *:nth-child(3) { animation-delay: .12s; }
        .sc-stagger > *:nth-child(4) { animation-delay: .18s; }
        .sc-stagger > *:nth-child(5) { animation-delay: .24s; }
        .sc-stagger > *:nth-child(6) { animation-delay: .3s; }
        .sc-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .sc-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
        @media (prefers-reduced-motion: reduce) {
          .sc-root *, .sc-root *::before, .sc-root *::after { animation: none !important; transition-duration: .01ms !important; }
        }
      `}</style>

      {/* Ambient color */}
      <div className="sc-blob pointer-events-none fixed -top-32 left-1/4 h-96 w-96 rounded-full bg-rose-100/70 blur-3xl" />
      <div className="sc-blob pointer-events-none fixed right-0 bottom-0 h-96 w-96 rounded-full bg-fuchsia-100/70 blur-3xl [animation-delay:-7s]" />

      <div className="relative z-10 mx-auto flex max-w-[1440px] flex-col lg:flex-row">
        {/* ================= SIDEBAR ================= */}
        <aside className="border-b border-slate-200/80 bg-white/70 backdrop-blur-xl lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:w-72 lg:shrink-0 lg:self-start lg:overflow-y-auto lg:border-r lg:border-b-0 sc-scroll">
          <div className="flex items-center justify-between p-4 lg:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-400 to-rose-400 text-sm font-bold text-white shadow-md shadow-rose-200">
                {initials(adminDisplayName)}
              </div>
              <div>
                <p className="sc-display text-sm font-bold text-slate-800">Admin space</p>
                <p className="text-xs text-slate-500">SnapClass</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 lg:hidden"
            >
              {mobileMenuOpen ? "Close" : "Menu"}
            </button>
          </div>

          <nav
            className={`${mobileMenuOpen ? "block sc-enter" : "hidden"} space-y-1 px-3 pb-5 lg:block lg:px-4`}
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;

              let badgeValue = null;
              if (item.id === "subjects") badgeValue = subjects.length;
              if (item.id === "requests" && pendingRequestsCount > 0) {
                badgeValue = pendingRequestsCount;
              }
              if (item.id === "students") {
                badgeValue = counts.totalStudents ?? counts.students ?? students.length;
              }
              if (item.id === "faculty") {
                badgeValue = counts.totalFaculty ?? counts.faculty ?? facultyList.length;
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchFeatureTab(item.id)}
                  className={`group flex w-full cursor-pointer items-center justify-between rounded-2xl px-3 py-2.5 text-left transition-all duration-300 ${
                    isActive
                      ? "bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white shadow-lg shadow-rose-200/80"
                      : "text-slate-600 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-xl p-2 transition-colors duration-300 ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-500 group-hover:bg-rose-50 group-hover:text-rose-500"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className={`text-xs ${isActive ? "text-rose-50" : "text-slate-400"}`}>
                        {item.shortDesc}
                      </p>
                    </div>
                  </div>

                  {badgeValue !== null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        isActive
                          ? "bg-white text-rose-600"
                          : item.id === "requests"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {badgeValue}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Registration quick card */}
            <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Student registration</span>
                <StatusBadge status={windowStatus} />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {registrationWindow
                  ? `${formatReadableDateTime(registrationWindow.startsAt)}`
                  : "No window scheduled"}
              </p>
              <button
                type="button"
                onClick={() => switchFeatureTab("window")}
                className="mt-3 w-full cursor-pointer rounded-xl bg-rose-50 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 active:scale-[.98]"
              >
                Manage schedule
              </button>
            </div>

            {/* Session card */}
            <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <p className="truncate text-sm font-semibold text-slate-800">
                {user?.email || "admin@snapclass.edu"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Signed in as {user?.role || "ADMIN"}</p>
              {logout && (
                <button
                  type="button"
                  onClick={logout}
                  className={`${ghostBtn} mt-3 w-full py-2 text-xs`}
                >
                  Sign out
                </button>
              )}
            </div>
          </nav>
        </aside>

        {/* ================= MAIN ================= */}
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {/* Greeting */}
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white bg-white/80 p-6 shadow-lg shadow-slate-200/60 backdrop-blur">
            <div>
              <p className="text-xs font-medium text-slate-400">
                {now.toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                ·{" "}
                {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <h1 className="sc-display mt-1.5 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
                {greeting.salutation},{" "}
                <span className="bg-gradient-to-r from-fuchsia-500 to-rose-500 bg-clip-text text-transparent">
                  {adminDisplayName}
                </span>
              </h1>
              <p className="mt-1 text-sm text-slate-500">{greeting.subtitle}</p>
            </div>

            <button
              type="button"
              onClick={() => loadAll(true)}
              disabled={loading || isRefreshing}
              className={`${ghostBtn} inline-flex items-center gap-2`}
            >
              <svg
                className={`h-4 w-4 text-rose-500 ${isRefreshing ? "sc-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </header>

          {/* Banners */}
          {pageError && <Banner tone="error" onClose={() => setPageError("")}>{pageError}</Banner>}
          {actionError && <Banner tone="error" onClose={() => setActionError("")}>{actionError}</Banner>}
          {notice && <Banner tone="success" onClose={() => setNotice("")}>{notice}</Banner>}

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-32 animate-pulse rounded-3xl bg-white/80 shadow-sm" />
              ))}
            </div>
          ) : (
            <>
              {/* ============ OVERVIEW ============ */}
              {activeTab === "overview" && (
                <div key="view-overview" className="space-y-6">
                  <div className="sc-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                      title="Students"
                      value={counts.totalStudents ?? counts.students ?? students.length}
                      subtitle="Enrolled with a face profile"
                      tone="from-indigo-400 to-sky-400"
                      soft="bg-sky-50 text-sky-600"
                      iconPath="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0"
                      onClick={() => switchFeatureTab("students")}
                      actionLabel="Open students"
                    />
                    <KpiCard
                      title="Faculty"
                      value={counts.totalFaculty ?? counts.faculty ?? facultyList.length}
                      subtitle="Teaching staff"
                      tone="from-emerald-400 to-teal-400"
                      soft="bg-emerald-50 text-emerald-600"
                      iconPath="M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 14a6.5 6.5 0 013.5 6"
                      onClick={() => switchFeatureTab("faculty")}
                      actionLabel="Open faculty"
                    />
                    <KpiCard
                      title="Subjects"
                      value={counts.totalSubjects ?? counts.subjects ?? subjects.length}
                      subtitle="Courses in the catalog"
                      tone="from-fuchsia-400 to-purple-400"
                      soft="bg-fuchsia-50 text-fuchsia-600"
                      iconPath="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13"
                      onClick={() => switchFeatureTab("subjects")}
                      actionLabel="View subjects"
                    />
                    <KpiCard
                      title="Pending requests"
                      value={counts.pendingRequests ?? counts.totalPendingRequests ?? pendingRequestsCount}
                      subtitle="Waiting for your decision"
                      tone="from-amber-400 to-rose-400"
                      soft="bg-amber-50 text-amber-600"
                      iconPath="M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2"
                      onClick={() => {
                        setRequestFilter("PENDING");
                        switchFeatureTab("requests");
                      }}
                      actionLabel="Review requests"
                    />
                  </div>

                  <div className="grid gap-6 lg:grid-cols-12">
                    {/* Pending requests */}
                    <Panel className="lg:col-span-7" delay={80}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h2 className="sc-display text-lg font-bold text-slate-800">Needs your attention</h2>
                          <p className="text-sm text-slate-500">Faculty asking to teach a subject</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => switchFeatureTab("requests")}
                          className="cursor-pointer text-sm font-semibold text-rose-500 transition hover:text-rose-600"
                        >
                          View all ({requests.length})
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {pendingList.slice(0, 4).map((req) => {
                          const reqId = req.id ?? req.requestId;
                          const name = req.facultyName ?? req.fullName ?? "Faculty";
                          return (
                            <div
                              key={reqId}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition duration-300 hover:bg-white hover:shadow-md"
                            >
                              <div className="flex items-center gap-3">
                                <Avatar name={name} tone="bg-rose-100 text-rose-600" />
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{name}</p>
                                  <p className="text-xs text-slate-500">
                                    wants{" "}
                                    <span className="font-semibold text-rose-600">
                                      {req.subjectName ?? req.name}
                                    </span>{" "}
                                    {req.subjectCode && `(${req.subjectCode})`}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busyAction === `request-${reqId}`}
                                  onClick={() => handleReviewRequest(req, "APPROVED")}
                                  className="cursor-pointer rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={busyAction === `request-${reqId}`}
                                  onClick={() => handleReviewRequest(req, "REJECTED")}
                                  className="cursor-pointer rounded-xl border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 active:scale-95 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {pendingRequestsCount === 0 && (
                          <EmptyState text="All caught up. No pending faculty requests." />
                        )}
                      </div>
                    </Panel>

                    {/* Window + logs */}
                    <div className="space-y-6 lg:col-span-5">
                      <Panel delay={140}>
                        <div className="flex items-center justify-between">
                          <h2 className="sc-display text-lg font-bold text-slate-800">Student registration</h2>
                          <StatusBadge status={windowStatus} />
                        </div>

                        {registrationWindow ? (
                          <div className="mt-4 space-y-2.5 rounded-2xl bg-slate-50 p-4 text-sm">
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-500">Opens</span>
                              <span className="font-semibold text-emerald-600">
                                {formatReadableDateTime(registrationWindow.startsAt)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-500">Closes</span>
                              <span className="font-semibold text-rose-600">
                                {formatReadableDateTime(registrationWindow.endsAt)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-500">
                            No registration window is scheduled for students yet.
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={() => switchFeatureTab("window")}
                          className={`${primaryBtn} mt-4 w-full`}
                        >
                          Manage registration
                        </button>
                      </Panel>

                      <Panel delay={200}>
                        <h2 className="sc-display text-lg font-bold text-slate-800">Recent activity</h2>
                        <p className="text-sm text-slate-500">Latest admin actions</p>

                        <div className="sc-scroll mt-4 max-h-60 space-y-2.5 overflow-y-auto pr-1">
                          {recentLogs.length > 0 ? (
                            recentLogs.slice(0, 8).map((log, index) => (
                              <div
                                key={log.id ?? index}
                                className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-fuchsia-600">
                                    {log.action ?? log.event ?? log.type ?? "ADMIN_ACTION"}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    {formatReadableDateTime(log.createdAt ?? log.timestamp)}
                                  </span>
                                </div>
                                {(log.details || log.message || log.description) && (
                                  <p className="mt-1 text-slate-600">
                                    {typeof log.details === "string"
                                      ? log.details
                                      : log.message ?? log.description}
                                  </p>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="py-6 text-center text-sm text-slate-400">
                              No recent activity yet.
                            </p>
                          )}
                        </div>
                      </Panel>
                    </div>
                  </div>
                </div>
              )}

              {/* ============ SUBJECTS ============ */}
              {activeTab === "subjects" && (
                <div key="view-subjects" className="grid gap-6 lg:grid-cols-12">
                  <Panel className="lg:col-span-5">
                    <h2 className="sc-display text-xl font-bold text-slate-800">Add a subject</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      New subjects are available straight away for faculty requests and student enrollment.
                    </p>

                    <form onSubmit={handleCreateSubject} className="sc-stagger mt-5 space-y-4">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Subject code</span>
                        <input
                          required
                          maxLength={30}
                          value={subjectForm.subjectCode}
                          onChange={(e) =>
                            setSubjectForm((prev) => ({ ...prev, subjectCode: e.target.value.toUpperCase() }))
                          }
                          placeholder="e.g. CS301"
                          className={`${inputCls} font-mono uppercase`}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Subject title</span>
                        <input
                          required
                          maxLength={150}
                          value={subjectForm.name}
                          onChange={(e) => setSubjectForm((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g. Deep Learning & Computer Vision"
                          className={inputCls}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Credits (1 to 30)</span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          required
                          value={subjectForm.credits}
                          onChange={(e) => setSubjectForm((prev) => ({ ...prev, credits: e.target.value }))}
                          className={inputCls}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                          Description <span className="font-normal text-slate-400">(optional)</span>
                        </span>
                        <textarea
                          rows={3}
                          value={subjectForm.description}
                          onChange={(e) => setSubjectForm((prev) => ({ ...prev, description: e.target.value }))}
                          placeholder="A short summary of what the course covers..."
                          className={inputCls}
                        />
                      </label>

                      <button type="submit" disabled={busyAction === "create-subject"} className={`${primaryBtn} w-full py-3`}>
                        {busyAction === "create-subject" ? "Adding..." : "Add subject"}
                      </button>
                    </form>
                  </Panel>

                  <Panel className="lg:col-span-7" delay={80}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="sc-display text-xl font-bold text-slate-800">
                          All subjects <span className="text-slate-400">({filteredSubjects.length})</span>
                        </h2>
                        <p className="text-sm text-slate-500">Courses available in SnapClass</p>
                      </div>

                      <input
                        type="search"
                        value={subjectSearch}
                        onChange={(e) => setSubjectSearch(e.target.value)}
                        placeholder="Search subjects..."
                        className={`${inputCls} sm:w-60`}
                      />
                    </div>

                    <div className="sc-scroll mt-5 overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-xs text-slate-400">
                            <th className="px-3 py-3 font-semibold">Code</th>
                            <th className="px-3 py-3 font-semibold">Subject</th>
                            <th className="px-3 py-3 font-semibold">Credits</th>
                            <th className="px-3 py-3 font-semibold">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filteredSubjects.map((sub) => (
                            <tr
                              key={sub.id ?? sub.subjectId ?? sub.subjectCode}
                              className="transition-colors duration-200 hover:bg-rose-50/40"
                            >
                              <td className="px-3 py-3.5 font-mono text-xs font-bold text-rose-600">{sub.subjectCode}</td>
                              <td className="px-3 py-3.5 font-semibold text-slate-800">{sub.name ?? sub.subjectName}</td>
                              <td className="px-3 py-3.5">
                                <span className="rounded-lg bg-fuchsia-50 px-2.5 py-1 text-xs font-bold text-fuchsia-600">
                                  {sub.credits ?? 3} cr
                                </span>
                              </td>
                              <td className="px-3 py-3.5 text-slate-500">{sub.description || "—"}</td>
                            </tr>
                          ))}

                          {filteredSubjects.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-10 text-center text-slate-400">
                                No subjects match your search.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </div>
              )}

              {/* ============ REQUESTS ============ */}
              {activeTab === "requests" && (
                <Panel key="view-requests">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="sc-display text-xl font-bold text-slate-800">Faculty requests</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Approve or reject faculty who want to teach a subject. You can leave a note.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
                      {["ALL", "PENDING", "APPROVED", "REJECTED"].map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setRequestFilter(tab)}
                          className={`cursor-pointer rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all duration-300 ${
                            requestFilter === tab
                              ? "bg-white text-rose-600 shadow"
                              : "text-slate-500 hover:text-slate-800"
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

                  <div key={requestFilter} className="sc-stagger mt-6 space-y-4">
                    {filteredRequests.map((req) => {
                      const reqId = req.id ?? req.requestId;
                      const status = String(req.status ?? "").toUpperCase();
                      const isPending = status === "PENDING";
                      const name = req.facultyName ?? req.fullName ?? "Faculty member";

                      return (
                        <article
                          key={reqId}
                          className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5 transition duration-300 hover:bg-white hover:shadow-md"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex gap-3.5">
                              <Avatar name={name} tone="bg-rose-100 text-rose-600" />
                              <div>
                                <div className="flex flex-wrap items-center gap-2.5">
                                  <span className="text-base font-semibold text-slate-800">{name}</span>
                                  <StatusBadge status={status} />
                                </div>
                                {req.facultyEmail && (
                                  <p className="text-xs text-slate-400">{req.facultyEmail}</p>
                                )}

                                <p className="mt-2 text-sm text-slate-600">
                                  Subject:{" "}
                                  <strong className="text-rose-600">{req.subjectName ?? req.name ?? "Course"}</strong>{" "}
                                  {req.subjectCode && <span className="text-xs text-slate-400">({req.subjectCode})</span>}
                                  {req.credits && (
                                    <span className="ml-2 rounded-md bg-fuchsia-50 px-2 py-0.5 text-xs font-semibold text-fuchsia-600">
                                      {req.credits} credits
                                    </span>
                                  )}
                                </p>

                                <p className="mt-1.5 text-xs text-slate-400">
                                  Requested {formatReadableDateTime(req.requestedAt)}
                                  {req.reviewedAt && ` · Reviewed ${formatReadableDateTime(req.reviewedAt)}`}
                                </p>

                                {req.reviewNote && (
                                  <p className="mt-2 rounded-xl bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm">
                                    Note: {req.reviewNote}
                                  </p>
                                )}
                              </div>
                            </div>

                            {isPending && (
                              <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:min-w-[320px]">
                                <input
                                  type="text"
                                  value={reviewNotes[reqId] || ""}
                                  onChange={(e) =>
                                    setReviewNotes((prev) => ({ ...prev, [reqId]: e.target.value }))
                                  }
                                  placeholder="Add a note for the faculty (optional)"
                                  className={inputCls}
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={busyAction === `request-${reqId}`}
                                    onClick={() => handleReviewRequest(req, "APPROVED")}
                                    className="flex-1 cursor-pointer rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 active:scale-[.98] disabled:opacity-50"
                                  >
                                    {busyAction === `request-${reqId}` ? "Saving..." : "Approve"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyAction === `request-${reqId}`}
                                    onClick={() => handleReviewRequest(req, "REJECTED")}
                                    className="flex-1 cursor-pointer rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 active:scale-[.98] disabled:opacity-50"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}

                    {filteredRequests.length === 0 && (
                      <EmptyState
                        text={`No ${requestFilter === "ALL" ? "" : requestFilter.toLowerCase() + " "}requests to show.`}
                      />
                    )}
                  </div>
                </Panel>
              )}

              {/* ============ WINDOW ============ */}
              {activeTab === "window" && (
                <div key="view-window" className="grid gap-6 lg:grid-cols-12">
                  <Panel className="lg:col-span-5">
                    <h2 className="sc-display text-xl font-bold text-slate-800">Current window</h2>

                    <div className="mt-5 rounded-2xl bg-slate-50 p-5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-500">Status</span>
                        <StatusBadge status={windowStatus} />
                      </div>

                      {registrationWindow ? (
                        <div className="mt-4 space-y-3 border-t border-slate-200/70 pt-4 text-sm">
                          <div>
                            <p className="text-xs text-slate-400">Window ID</p>
                            <p className="mt-0.5 font-mono font-bold text-slate-800">#{registrationWindow.id}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Starts</p>
                            <p className="mt-0.5 font-semibold text-emerald-600">
                              {formatReadableDateTime(registrationWindow.startsAt)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Ends</p>
                            <p className="mt-0.5 font-semibold text-rose-600">
                              {formatReadableDateTime(registrationWindow.endsAt)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-slate-500">
                          No student registration window has been scheduled yet.
                        </p>
                      )}

                      {windowStatus === "UPCOMING" && !editingWindowId && (
                        <button
                          type="button"
                          onClick={startEditingWindow}
                          className="mt-5 w-full cursor-pointer rounded-xl bg-fuchsia-50 py-2.5 text-sm font-semibold text-fuchsia-600 transition hover:bg-fuchsia-100 active:scale-[.98]"
                        >
                          Edit upcoming dates
                        </button>
                      )}

                      {windowStatus === "OPEN" && (
                        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                          This window is open right now, so it cannot be edited.
                        </p>
                      )}
                    </div>
                  </Panel>

                  <Panel className="lg:col-span-7" delay={80}>
                    <h2 className="sc-display text-xl font-bold text-slate-800">
                      {editingWindowId
                        ? `Update registration window #${editingWindowId}`
                        : "Schedule a registration window"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Pick when students can start and stop registering. The end must be in the future.
                    </p>

                    <form onSubmit={handleWindowSubmit} className="mt-6 space-y-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Opens at</span>
                          <input
                            type="datetime-local"
                            required
                            value={windowForm.startsAt}
                            onChange={(e) => setWindowForm((prev) => ({ ...prev, startsAt: e.target.value }))}
                            className={`${inputCls} py-3`}
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Closes at</span>
                          <input
                            type="datetime-local"
                            required
                            value={windowForm.endsAt}
                            onChange={(e) => setWindowForm((prev) => ({ ...prev, endsAt: e.target.value }))}
                            className={`${inputCls} py-3`}
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button type="submit" disabled={busyAction === "save-window"} className={`${primaryBtn} px-6 py-3`}>
                          {busyAction === "save-window"
                            ? "Saving..."
                            : editingWindowId
                            ? "Update window"
                            : "Create window"}
                        </button>

                        {editingWindowId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingWindowId(null);
                              setWindowForm({ startsAt: "", endsAt: "" });
                            }}
                            className={ghostBtn}
                          >
                            Cancel edit
                          </button>
                        )}
                      </div>
                    </form>
                  </Panel>
                </div>
              )}

              {/* ============ STUDENTS ============ */}
              {activeTab === "students" && (
                <PeopleDirectory
                  key="view-students"
                  kind="student"
                  title="Students"
                  subtitle="See each student's subjects or remove their access."
                  rows={filteredStudents}
                  search={studentSearch}
                  setSearch={setStudentSearch}
                  searchPlaceholder="Search by name or email..."
                  inspectLabel="View subjects"
                  emptyText="No student records found."
                  tone="bg-sky-100 text-sky-600"
                  inspectCls="bg-sky-50 text-sky-600 hover:bg-sky-100"
                  onInspect={openSubjectInspector}
                  onDisable={setConfirmDisable}
                />
              )}

              {/* ============ FACULTY ============ */}
              {activeTab === "faculty" && (
                <PeopleDirectory
                  key="view-faculty"
                  kind="faculty"
                  title="Faculty"
                  subtitle="See each faculty member's subjects or remove their access."
                  rows={filteredFaculty}
                  search={facultySearch}
                  setSearch={setFacultySearch}
                  searchPlaceholder="Search by name or email..."
                  inspectLabel="Assigned subjects"
                  emptyText="No faculty members found."
                  tone="bg-emerald-100 text-emerald-600"
                  inspectCls="bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                  onInspect={openSubjectInspector}
                  onDisable={setConfirmDisable}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* ================= INSPECTOR SLIDE-OVER ================= */}
      {inspector.open && (
        <div
          className="sc-fade fixed inset-0 z-50 flex items-center justify-end bg-slate-900/30 backdrop-blur-sm"
          onClick={closeInspector}
        >
          <div
            className="sc-slide flex h-full w-full max-w-lg flex-col justify-between bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sc-scroll overflow-y-auto pr-1">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={inspector.person?.fullName ?? inspector.person?.name ?? inspector.person?.email}
                    tone={inspector.type === "student" ? "bg-sky-100 text-sky-600" : "bg-emerald-100 text-emerald-600"}
                    large
                  />
                  <div>
                    <p className="text-xs font-semibold text-rose-500">
                      {inspector.type === "student" ? "Student subjects" : "Faculty subjects"}
                    </p>
                    <h3 className="sc-display text-lg font-bold text-slate-800">
                      {inspector.person?.fullName ?? inspector.person?.name ?? inspector.person?.email}
                    </h3>
                    <p className="text-xs text-slate-400">{inspector.person?.email}</p>
                  </div>
                </div>

                <button type="button" onClick={closeInspector} aria-label="Close" className="cursor-pointer rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              {inspector.loading ? (
                <div className="mt-8 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                  ))}
                </div>
              ) : inspector.error ? (
                <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {inspector.error}
                </div>
              ) : (
                <div className="sc-stagger mt-6 space-y-3">
                  <p className="text-xs font-semibold text-slate-400">
                    {inspector.type === "student"
                      ? `Registered subjects (${inspector.subjects.length})`
                      : `Assigned subjects (${inspector.subjects.length})`}
                  </p>

                  {inspector.subjects.map((sub, idx) => (
                    <div key={sub.id ?? sub.subjectId ?? idx} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-rose-600">{sub.subjectCode}</span>
                        <span className="rounded-lg bg-fuchsia-50 px-2.5 py-0.5 text-[11px] font-bold text-fuchsia-600">
                          {sub.credits ?? 3} credits
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{sub.name ?? sub.subjectName}</p>
                      {sub.description && <p className="mt-1 text-xs text-slate-500">{sub.description}</p>}
                    </div>
                  ))}

                  {inspector.subjects.length === 0 && (
                    <EmptyState text={`No subjects linked to this ${inspector.type === "student" ? "student" : "faculty member"} yet.`} />
                  )}
                </div>
              )}
            </div>

            <button type="button" onClick={closeInspector} className={`${ghostBtn} mt-6 w-full py-2.5`}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* ================= CONFIRM DISABLE ================= */}
      {confirmDisable && (
        <div
          className="sc-fade fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={() => setConfirmDisable(null)}
        >
          <div
            className="sc-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4m0 4h.01M10.3 4.3L2.7 18a2 2 0 001.7 3h15.2a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z" />
              </svg>
            </span>
            <h3 className="sc-display mt-4 text-xl font-bold text-slate-800">
              Disable this {confirmDisable.role} account?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              You are about to disable{" "}
              <strong className="text-slate-800">{confirmDisable.name}</strong> ({confirmDisable.email}). They
              will be signed out right away and will get an email telling them their account was removed.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={executeAccountDisable}
                disabled={busyAction.startsWith("disable-")}
                className="flex-1 cursor-pointer rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:bg-rose-600 active:scale-[.98] disabled:opacity-50"
              >
                {busyAction.startsWith("disable-") ? "Disabling..." : "Yes, disable"}
              </button>
              <button type="button" onClick={() => setConfirmDisable(null)} className={`${ghostBtn} flex-1`}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// SUB-COMPONENTS
// ==========================================
function Panel({ children, className = "", delay = 0 }) {
  return (
    <section
      style={{ animationDelay: `${delay}ms` }}
      className={`sc-enter rounded-3xl border border-white bg-white/85 p-6 shadow-lg shadow-slate-200/60 backdrop-blur ${className}`}
    >
      {children}
    </section>
  );
}

function Banner({ tone, children, onClose }) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-rose-200 bg-rose-50 text-rose-700";
  const dot = tone === "success" ? "bg-emerald-500" : "bg-rose-500";
  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={`sc-enter mb-5 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${styles}`}
    >
      <span className="flex items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        {children}
      </span>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="cursor-pointer opacity-60 transition hover:opacity-100">
        ✕
      </button>
    </div>
  );
}

function Avatar({ name, tone, large = false }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${tone} ${
        large ? "h-12 w-12 text-base" : "h-10 w-10 text-sm"
      }`}
    >
      {initials(name)}
    </span>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

function useCountUp(target, duration = 800) {
  const n = Number(target);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(n)) return;
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      setV(Math.round(n * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, duration]);
  return Number.isFinite(n) ? v : target;
}

function KpiCard({ title, value, subtitle, tone, soft, iconPath, onClick, actionLabel }) {
  const shown = useCountUp(value);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-3xl border border-white bg-white/90 p-5 text-left shadow-lg shadow-slate-200/60 transition duration-300 hover:-translate-y-1.5 hover:shadow-xl"
    >
      <div
        className={`pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-gradient-to-br ${tone} opacity-20 blur-2xl transition duration-500 group-hover:opacity-40`}
      />
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition duration-300 group-hover:scale-110 group-hover:-rotate-6 ${soft}`}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d={iconPath} />
        </svg>
      </span>
      <p className="mt-4 text-sm font-medium text-slate-500">{title}</p>
      <p className="sc-display mt-1 text-3xl font-extrabold text-slate-800">{shown}</p>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
      <p className="mt-4 text-xs font-semibold text-rose-500 transition group-hover:translate-x-1">
        {actionLabel} →
      </p>
    </button>
  );
}

function StatusBadge({ status }) {
  const norm = String(status || "").toUpperCase();
  let style = "bg-slate-100 text-slate-500";
  let dot = "bg-slate-400";

  if (norm === "OPEN" || norm === "APPROVED" || norm === "ACTIVE") {
    style = "bg-emerald-50 text-emerald-600";
    dot = "bg-emerald-500";
  } else if (norm === "PENDING" || norm === "UPCOMING") {
    style = "bg-amber-50 text-amber-600";
    dot = "bg-amber-500";
  } else if (norm === "REJECTED" || norm === "CLOSED" || norm === "DISABLED") {
    style = "bg-rose-50 text-rose-600";
    dot = "bg-rose-500";
  }

  const label = (norm || "UNKNOWN").replace(/_/g, " ").toLowerCase();

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${style}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// Shared table for the Students and Faculty directories
function PeopleDirectory({
  kind,
  title,
  subtitle,
  rows,
  search,
  setSearch,
  searchPlaceholder,
  inspectLabel,
  emptyText,
  tone,
  inspectCls,
  onInspect,
  onDisable,
}) {
  const idKey = kind === "student" ? "studentId" : "facultyId";

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="sc-display text-xl font-bold text-slate-800">
            {title} <span className="text-slate-400">({rows.length})</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className={`${inputCls} sm:w-72`}
        />
      </div>

      <div className="sc-scroll mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="px-3 py-3 font-semibold">{kind === "student" ? "Student" : "Faculty member"}</th>
              <th className="px-3 py-3 font-semibold">ID</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((p) => {
              const personId = p[idKey] ?? p.id ?? p.userId;
              const accountId = p[idKey] ?? p.id ?? p.accountId ?? p.userId;
              const name = p.fullName ?? p.name ?? (kind === "student" ? "Student" : "Faculty");
              const isDisabled =
                p.isActive === false || String(p.status ?? "").toUpperCase() === "DISABLED";

              return (
                <tr key={personId} className="transition-colors duration-200 hover:bg-rose-50/40">
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={name} tone={tone} />
                      <div>
                        <p className="font-semibold text-slate-800">{name}</p>
                        <p className="text-xs text-slate-400">{p.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 font-mono text-xs text-slate-400">#{personId}</td>
                  <td className="px-3 py-3.5">
                    <StatusBadge status={isDisabled ? "DISABLED" : "ACTIVE"} />
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onInspect(kind, p)}
                        className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${inspectCls}`}
                      >
                        {inspectLabel}
                      </button>

                      {!isDisabled && (
                        <button
                          type="button"
                          onClick={() =>
                            onDisable({
                              role: kind,
                              accountId,
                              name: p.fullName ?? p.name ?? p.email,
                              email: p.email,
                            })
                          }
                          className="cursor-pointer rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 active:scale-95"
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-slate-400">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}