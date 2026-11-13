// FacultyDashboard.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getFacultyDashboard,
  getFacultySubjects,
  requestSubjectAccess,
} from "../services/faculty.service";
import FacultyAttendanceModule from "./faculty/FacultyAttendanceModule";
import FacultyMaterialsModule from "./faculty/FacultyMaterialsModule";
import FacultyQuizzesModule from "./faculty/FacultyQuizzesModule";

function unwrapList(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  return [];
}

function getGreetingByLocalTime(dateObj) {
  const hour = dateObj.getHours();
  if (hour < 12) {
    return { salutation: "Good morning", subtitle: "Your classes, attendance and quizzes are ready for the day." };
  }
  if (hour < 17) {
    return { salutation: "Good afternoon", subtitle: "Take attendance, share notes or draft a quiz for your class." };
  }
  return { salutation: "Good evening", subtitle: "A good time to review attendance and prepare tomorrow's material." };
}

function initials(name) {
  return (
    String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

const icon = (d) => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const FACULTY_NAV = [
  { id: "overview", label: "Overview", shortDesc: "Your teaching at a glance", icon: icon("M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z") },
  { id: "subjects", label: "Subjects", shortDesc: "Your courses and requests", icon: icon("M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13") },
  { id: "attendance", label: "Attendance", shortDesc: "Take it with a class photo", icon: icon("M4 8a2 2 0 012-2h2l1.5-2h5L16 6h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z") },
  { id: "materials", label: "Materials", shortDesc: "Upload notes for AI", icon: icon("M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3") },
  { id: "quizzes", label: "Quizzes", shortDesc: "Create, publish and grade", icon: icon("M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z") },
];

const primaryBtn =
  "cursor-pointer rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

const ghostBtn =
  "cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition duration-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[.98] disabled:opacity-50";

export default function FacultyDashboard() {
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const [dashboard, setDashboard] = useState(null);
  const [allSubjects, setAllSubjects] = useState([]);
  const [focusedSubject, setFocusedSubject] = useState(null);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const loadCoreData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    setErrorMsg("");

    try {
      const [dashData, subjData] = await Promise.all([
        getFacultyDashboard(),
        getFacultySubjects(),
      ]);
      setDashboard(dashData);
      setAllSubjects(unwrapList(subjData, "subjects"));
    } catch (err) {
      setErrorMsg(
        err?.response?.data?.message || err?.message || "Failed to load faculty portal data."
      );
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCoreData();
  }, [loadCoreData]);

  useEffect(() => {
    if (!notice && !errorMsg) return;
    const t = setTimeout(() => {
      setNotice("");
      setErrorMsg("");
    }, 5500);
    return () => clearTimeout(t);
  }, [notice, errorMsg]);

  const handleNotify = useCallback((msg) => setNotice(msg), []);
  const handleError = useCallback((msg) => setErrorMsg(msg), []);

  const greeting = useMemo(() => getGreetingByLocalTime(now), [now]);

  const assignedSubjects = useMemo(() => {
    const fromAll = allSubjects.filter(
      (s) => s.isTeaching === true || s.isAssigned === true || s.assigned === true
    );
    if (fromAll.length > 0) return fromAll;
    return unwrapList(dashboard, "subjects");
  }, [allSubjects, dashboard]);

  const discoverableSubjects = useMemo(
    () =>
      allSubjects.filter(
        (s) => !(s.isTeaching === true || s.isAssigned === true || s.assigned === true)
      ),
    [allSubjects]
  );

  const pendingRequestsCount = useMemo(
    () =>
      allSubjects.filter(
        (s) => String(s.requestStatus ?? s.status ?? "").toUpperCase() === "PENDING"
      ).length,
    [allSubjects]
  );

  const summary = dashboard?.summary ?? dashboard?.counts ?? {};
  const facultyName =
    dashboard?.faculty?.fullName ??
    user?.fullName ??
    (user?.email ? user.email.split("@")[0] : "Professor");

  function jumpToSubjectFeature(subject, tabId) {
    setFocusedSubject(subject);
    setActiveTab(tabId);
    setMobileNavOpen(false);
  }

  async function handleRequestSubject(subject) {
    const id = subject.subjectId ?? subject.id;
    setBusyId(`req-${id}`);
    setErrorMsg("");
    setNotice("");

    try {
      const res = await requestSubjectAccess(id);
      setNotice(
        res?.message ||
          `Access requested for ${subject.subjectCode} (${subject.subjectName ?? subject.name}).`
      );
      await loadCoreData(true);
    } catch (err) {
      setErrorMsg(
        err?.response?.data?.message || err?.message || "Could not submit subject request."
      );
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="sc-root relative min-h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
        .sc-root { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
        .sc-display { font-family: 'Sora', 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
        @keyframes sc-enter { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes sc-pop { from { opacity: 0; transform: scale(.94) translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes sc-blob { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(24px,-26px,0) scale(1.06); } }
        @keyframes sc-spin { to { transform: rotate(360deg); } }
        @keyframes sc-scan { 0% { top: -2rem; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        .sc-enter { animation: sc-enter .5s cubic-bezier(.22,1,.36,1) both; }
        .sc-pop { animation: sc-pop .35s cubic-bezier(.22,1,.36,1) both; }
        .sc-blob { animation: sc-blob 16s ease-in-out infinite; }
        .sc-spin { animation: sc-spin .9s linear infinite; }
        .sc-scan { animation: sc-scan 2.2s ease-in-out infinite; }
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
      <div className="sc-blob pointer-events-none fixed -top-32 left-1/4 h-96 w-96 rounded-full bg-emerald-100/70 blur-3xl" />
      <div className="sc-blob pointer-events-none fixed right-0 bottom-0 h-96 w-96 rounded-full bg-teal-100/70 blur-3xl [animation-delay:-7s]" />

      <div className="relative z-10 mx-auto flex max-w-[1440px] flex-col lg:flex-row">
        {/* ================= SIDEBAR ================= */}
        <aside className="sc-scroll border-b border-slate-200/80 bg-white/70 backdrop-blur-xl lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:w-72 lg:shrink-0 lg:self-start lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between p-4 lg:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-400 text-sm font-bold text-white shadow-md shadow-emerald-200">
                {initials(facultyName)}
              </div>
              <div>
                <p className="sc-display text-sm font-bold text-slate-800">Faculty space</p>
                <p className="text-xs text-slate-500">SnapClass</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 lg:hidden"
            >
              {mobileNavOpen ? "Close" : "Menu"}
            </button>
          </div>

          <nav className={`${mobileNavOpen ? "block sc-enter" : "hidden"} space-y-1 px-3 pb-6 lg:block lg:px-4`}>
            {FACULTY_NAV.map((item) => {
              const active = activeTab === item.id;
              let badge = null;
              if (item.id === "subjects") badge = assignedSubjects.length;
              if (item.id === "overview" && pendingRequestsCount > 0) {
                badge = pendingRequestsCount;
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`group flex w-full cursor-pointer items-center justify-between rounded-2xl px-3 py-2.5 text-left transition-all duration-300 ${
                    active
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-200/80"
                      : "text-slate-600 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-xl p-2 transition-colors duration-300 ${
                        active
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-600"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className={`text-xs ${active ? "text-emerald-50" : "text-slate-400"}`}>
                        {item.shortDesc}
                      </p>
                    </div>
                  </div>

                  {badge !== null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        active
                          ? "bg-white text-emerald-600"
                          : item.id === "overview"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* My courses quick list */}
            <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">
                My courses ({assignedSubjects.length})
              </p>
              <div className="mt-2.5 space-y-1">
                {assignedSubjects.slice(0, 4).map((sub) => {
                  const id = sub.subjectId ?? sub.id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => jumpToSubjectFeature(sub, "attendance")}
                      className="flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs transition hover:bg-emerald-50"
                    >
                      <span className="font-mono font-bold text-emerald-600">{sub.subjectCode}</span>
                      <span className="truncate pl-2 text-slate-500">{sub.subjectName ?? sub.name}</span>
                    </button>
                  );
                })}
                {assignedSubjects.length === 0 && (
                  <p className="text-xs text-slate-400">No courses assigned yet.</p>
                )}
              </div>
            </div>

            {/* Session card */}
            <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <p className="truncate text-sm font-semibold text-slate-800">
                {user?.email || "faculty@snapclass.edu"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Signed in as faculty</p>
              {logout && (
                <button type="button" onClick={logout} className={`${ghostBtn} mt-3 w-full py-2 text-xs`}>
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
                · {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <h1 className="sc-display mt-1.5 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
                {greeting.salutation},{" "}
                <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
                  {facultyName}
                </span>
              </h1>
              <p className="mt-1 text-sm text-slate-500">{greeting.subtitle}</p>
            </div>

            <button
              type="button"
              onClick={() => loadCoreData(true)}
              disabled={loading || isRefreshing}
              className={`${ghostBtn} inline-flex items-center gap-2`}
            >
              <svg
                className={`h-4 w-4 text-emerald-500 ${isRefreshing ? "sc-spin" : ""}`}
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
          {errorMsg && <Banner tone="error" onClose={() => setErrorMsg("")}>{errorMsg}</Banner>}
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
                <div key="tab-overview" className="space-y-6">
                  <div className="sc-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <FacultyKpi
                      title="Subjects teaching"
                      value={summary.subjectsTeaching ?? summary.totalSubjects ?? assignedSubjects.length}
                      subtitle="Approved courses"
                      iconPath="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13"
                      soft="bg-emerald-50 text-emerald-600"
                      onClick={() => setActiveTab("subjects")}
                      cta="Manage courses"
                    />
                    <FacultyKpi
                      title="Enrolled students"
                      value={summary.totalStudents ?? "—"}
                      subtitle="Across your subjects"
                      iconPath="M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 14a6.5 6.5 0 013.5 6"
                      soft="bg-sky-50 text-sky-600"
                      onClick={() => setActiveTab("attendance")}
                      cta="Open attendance"
                    />
                    <FacultyKpi
                      title="Pending requests"
                      value={summary.pendingRequests ?? pendingRequestsCount}
                      subtitle="Waiting for admin"
                      iconPath="M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2"
                      soft="bg-amber-50 text-amber-600"
                      onClick={() => setActiveTab("subjects")}
                      cta="Check status"
                    />
                    <FacultyKpi
                      title="More to teach"
                      value={discoverableSubjects.length}
                      subtitle="Subjects you can request"
                      iconPath="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
                      soft="bg-fuchsia-50 text-fuchsia-600"
                      onClick={() => setActiveTab("subjects")}
                      cta="Browse subjects"
                    />
                  </div>

                  <Panel delay={80}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="sc-display text-xl font-bold text-slate-800">
                          My courses <span className="text-slate-400">({assignedSubjects.length})</span>
                        </h2>
                        <p className="text-sm text-slate-500">
                          Jump straight into attendance, materials or quizzes.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveTab("subjects")}
                        className="cursor-pointer text-sm font-semibold text-emerald-600 transition hover:text-emerald-700"
                      >
                        Request more courses
                      </button>
                    </div>

                    <div className="sc-stagger mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {assignedSubjects.map((subject) => {
                        const id = subject.subjectId ?? subject.id;
                        return (
                          <article
                            key={id}
                            className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-5 transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-lg hover:shadow-slate-200/70"
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-xs font-bold text-emerald-600">
                                  {subject.subjectCode}
                                </span>
                                <span className="rounded-lg bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
                                  {subject.credits ?? 3} credits
                                </span>
                              </div>
                              <h3 className="mt-2 text-base font-semibold text-slate-800">
                                {subject.subjectName ?? subject.name}
                              </h3>
                              <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                                {subject.description ||
                                  "Ready for attendance, study materials and quizzes."}
                              </p>
                              {subject.studentCount !== undefined && (
                                <p className="mt-3 text-xs font-semibold text-teal-600">
                                  {subject.studentCount} students enrolled
                                </p>
                              )}
                            </div>

                            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                              <button
                                type="button"
                                onClick={() => jumpToSubjectFeature(subject, "attendance")}
                                className="cursor-pointer rounded-xl bg-emerald-500 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95"
                              >
                                Attendance
                              </button>
                              <button
                                type="button"
                                onClick={() => jumpToSubjectFeature(subject, "materials")}
                                className="cursor-pointer rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
                              >
                                Materials
                              </button>
                              <button
                                type="button"
                                onClick={() => jumpToSubjectFeature(subject, "quizzes")}
                                className="cursor-pointer rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
                              >
                                Quizzes
                              </button>
                            </div>
                          </article>
                        );
                      })}

                      {assignedSubjects.length === 0 && (
                        <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
                          You have no courses yet. Head to{" "}
                          <button
                            type="button"
                            onClick={() => setActiveTab("subjects")}
                            className="cursor-pointer font-semibold text-emerald-600 underline"
                          >
                            Subjects
                          </button>{" "}
                          to ask for access to teach one.
                        </div>
                      )}
                    </div>
                  </Panel>
                </div>
              )}

              {/* ============ SUBJECTS ============ */}
              {activeTab === "subjects" && (
                <div key="tab-subjects" className="space-y-6">
                  <Panel>
                    <h2 className="sc-display text-xl font-bold text-slate-800">
                      Courses you teach <span className="text-slate-400">({assignedSubjects.length})</span>
                    </h2>
                    <div className="sc-stagger mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {assignedSubjects.map((sub) => {
                        const id = sub.subjectId ?? sub.id;
                        return (
                          <div
                            key={id}
                            className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 transition duration-300 hover:-translate-y-1 hover:shadow-md"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-emerald-600">
                                {sub.subjectCode}
                              </span>
                              <StatusPill tone="green">Teaching</StatusPill>
                            </div>
                            <p className="mt-2 font-semibold text-slate-800">{sub.subjectName ?? sub.name}</p>
                            <button
                              type="button"
                              onClick={() => jumpToSubjectFeature(sub, "attendance")}
                              className="mt-4 w-full cursor-pointer rounded-xl bg-white py-2 text-xs font-semibold text-emerald-600 shadow-sm transition hover:bg-emerald-100 active:scale-[.98]"
                            >
                              Open attendance
                            </button>
                          </div>
                        );
                      })}
                      {assignedSubjects.length === 0 && (
                        <p className="text-sm text-slate-400">No subjects assigned yet.</p>
                      )}
                    </div>
                  </Panel>

                  <Panel delay={80}>
                    <h2 className="sc-display text-xl font-bold text-slate-800">
                      Request a subject <span className="text-slate-400">({discoverableSubjects.length})</span>
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Ask the admin for access to teach a subject. If a request is rejected you can ask again.
                    </p>

                    <div className="sc-stagger mt-5 space-y-3">
                      {discoverableSubjects.map((sub) => {
                        const id = sub.subjectId ?? sub.id;
                        const status = String(sub.requestStatus ?? sub.status ?? "").toUpperCase();
                        const isPending = sub.hasRequested === true || status === "PENDING";
                        const isRejected = status === "REJECTED";

                        return (
                          <article
                            key={id}
                            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition duration-300 hover:bg-white hover:shadow-md"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-bold text-emerald-600">
                                  {sub.subjectCode}
                                </span>
                                <h3 className="text-sm font-semibold text-slate-800">
                                  {sub.subjectName ?? sub.name}
                                </h3>
                                <span className="rounded-lg bg-white px-2 py-0.5 text-[11px] text-slate-500 shadow-sm">
                                  {sub.credits ?? 3} credits
                                </span>
                              </div>
                              {sub.description && (
                                <p className="mt-1 text-sm text-slate-500">{sub.description}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              {isPending ? (
                                <StatusPill tone="amber">Waiting for admin</StatusPill>
                              ) : (
                                <>
                                  {isRejected && <StatusPill tone="rose">Previously rejected</StatusPill>}
                                  <button
                                    type="button"
                                    disabled={busyId === `req-${id}`}
                                    onClick={() => handleRequestSubject(sub)}
                                    className={primaryBtn}
                                  >
                                    {busyId === `req-${id}`
                                      ? "Requesting..."
                                      : isRejected
                                      ? "Ask again"
                                      : "Request to teach"}
                                  </button>
                                </>
                              )}
                            </div>
                          </article>
                        );
                      })}

                      {discoverableSubjects.length === 0 && (
                        <p className="py-8 text-center text-sm text-slate-400">
                          Every subject is already assigned to you.
                        </p>
                      )}
                    </div>
                  </Panel>
                </div>
              )}

              {/* ============ MODULES ============ */}
              {activeTab === "attendance" && (
                <FacultyAttendanceModule
                  assignedSubjects={assignedSubjects}
                  initialSubject={focusedSubject}
                  onNotify={handleNotify}
                  onError={handleError}
                />
              )}

              {activeTab === "materials" && (
                <FacultyMaterialsModule
                  assignedSubjects={assignedSubjects}
                  initialSubject={focusedSubject}
                  onNotify={handleNotify}
                  onError={handleError}
                />
              )}

              {activeTab === "quizzes" && (
                <FacultyQuizzesModule
                  assignedSubjects={assignedSubjects}
                  onNotify={handleNotify}
                  onError={handleError}
                />
              )}
            </>
          )}
        </main>
      </div>
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

function StatusPill({ tone, children }) {
  const map = {
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${map[tone]}`}>
      {children}
    </span>
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

function FacultyKpi({ title, value, subtitle, onClick, cta, iconPath, soft }) {
  const shown = useCountUp(value);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-3xl border border-white bg-white/90 p-5 text-left shadow-lg shadow-slate-200/60 transition duration-300 hover:-translate-y-1.5 hover:shadow-xl"
    >
      <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-gradient-to-br from-emerald-300 to-teal-300 opacity-20 blur-2xl transition duration-500 group-hover:opacity-40" />
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition duration-300 group-hover:scale-110 group-hover:-rotate-6 ${soft}`}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d={iconPath} />
        </svg>
      </span>
      <p className="mt-4 text-sm font-medium text-slate-500">{title}</p>
      <p className="sc-display mt-1 text-3xl font-extrabold text-slate-800">{shown}</p>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
      <p className="mt-4 text-xs font-semibold text-emerald-600 transition group-hover:translate-x-1">
        {cta} →
      </p>
    </button>
  );
}