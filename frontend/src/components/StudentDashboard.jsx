import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getStudentDashboard,
  getStudentQuizMarks,
  getStudentSubjects,
  registerForSubject,
} from "../services/student.service";
import StudentAttendanceModule from "./student/StudentAttendanceModule";
import StudentMaterialsModule from "./student/StudentMaterialsModule";
import StudentQuizzesModule from "./student/StudentQuizzesModule";

function unwrap(val, key) {
  if (Array.isArray(val)) return val;
  if (Array.isArray(val?.[key])) return val[key];
  return [];
}

function getStudentGreeting(dateObj) {
  const hour = dateObj.getHours();
  if (hour < 12) {
    return { salutation: "Good morning", subtitle: "Your classes, attendance and notes are all in one place." };
  }
  if (hour < 17) {
    return { salutation: "Good afternoon", subtitle: "Check your attendance, grab lecture notes or take a quiz." };
  }
  return { salutation: "Good evening", subtitle: "A good time to revise notes and review your marks." };
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

const STUDENT_NAV = [
  { id: "overview", label: "Overview", shortDesc: "Your semester at a glance", icon: icon("M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z") },
  { id: "registration", label: "Courses", shortDesc: "Enroll in subjects", icon: icon("M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13") },
  { id: "attendance", label: "Attendance", shortDesc: "Your percentage and history", icon: icon("M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z") },
  { id: "materials", label: "Study materials", shortDesc: "Notes and slides to download", icon: icon("M7 3h7l5 5v13H7zM14 3v5h5") },
  { id: "quizzes", label: "Quizzes", shortDesc: "Take timed quizzes", icon: icon("M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z") },
  { id: "marks", label: "My marks", shortDesc: "Best and latest scores", icon: icon("M4 20V10M10 20V4M16 20v-8M22 20H2") },
];

export default function StudentDashboard() {
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const [dashboard, setDashboard] = useState(null);
  const [subjectCatalog, setSubjectCatalog] = useState(null);
  const [quizMarks, setQuizMarks] = useState([]);
  const [focusedSubjectId, setFocusedSubjectId] = useState("");

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [registeringId, setRegisteringId] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const loadAllStudentData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    setErrorMsg("");

    const results = await Promise.allSettled([
      getStudentDashboard(),
      getStudentSubjects(),
      getStudentQuizMarks(),
    ]);

    const [dashRes, subjRes, marksRes] = results;

    if (dashRes.status === "fulfilled") setDashboard(dashRes.value);
    if (subjRes.status === "fulfilled") setSubjectCatalog(subjRes.value);
    if (marksRes.status === "fulfilled") {
      setQuizMarks(unwrap(marksRes.value, "marks"));
    }

    if (dashRes.status === "rejected" && subjRes.status === "rejected") {
      setErrorMsg(
        dashRes.reason?.response?.data?.message ||
          dashRes.reason?.message ||
          "Could not load student portal."
      );
    }

    setLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    loadAllStudentData();
  }, [loadAllStudentData]);

  useEffect(() => {
    if (!notice && !errorMsg) return;
    const t = setTimeout(() => {
      setNotice("");
      setErrorMsg("");
    }, 5500);
    return () => clearTimeout(t);
  }, [notice, errorMsg]);

  const greeting = useMemo(() => getStudentGreeting(now), [now]);

  const profile = dashboard?.profile ?? user ?? {};
  const studentDisplayName =
    profile.fullName ?? user?.fullName ?? (user?.email ? user.email.split("@")[0] : "Student");

  const allSubjects = useMemo(() => unwrap(subjectCatalog, "subjects"), [subjectCatalog]);

  const registeredSubjects = useMemo(
    () => allSubjects.filter((s) => s.isRegistered === true),
    [allSubjects]
  );

  const creditLimit = subjectCatalog?.creditLimit ?? dashboard?.summary?.creditLimit ?? 30;

  const registeredCredits =
    subjectCatalog?.registeredCredits ??
    dashboard?.summary?.registeredCredits ??
    registeredSubjects.reduce((acc, s) => acc + (Number(s.credits) || 0), 0);

  const remainingCredits =
    subjectCatalog?.remainingCredits ??
    dashboard?.summary?.remainingCredits ??
    Math.max(0, creditLimit - registeredCredits);

  const windowInfo =
    subjectCatalog?.registrationWindow ?? dashboard?.registration ?? { status: "NOT_CONFIGURED" };

  const windowStatus = String(windowInfo.status ?? "NOT_CONFIGURED").toUpperCase();
  const isWindowOpen = windowStatus === "ACTIVE" || windowStatus === "OPEN";

  const recentActivity = useMemo(() => unwrap(dashboard, "recentActivity"), [dashboard]);

  const creditPct = Math.min(100, Math.round((registeredCredits / creditLimit) * 100));

  async function handleEnrollSubject(subject) {
    const id = subject.id ?? subject.subjectId;
    setRegisteringId(id);
    setErrorMsg("");
    setNotice("");

    try {
      await registerForSubject(id);
      setNotice(
        `Successfully enrolled in ${subject.subjectCode} — ${subject.name ?? subject.subjectName}!`
      );
      await loadAllStudentData(true);
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || err?.message || "Course registration failed.");
      await loadAllStudentData(true);
    } finally {
      setRegisteringId(null);
    }
  }

  function jumpToSubjectTab(subjectId, tabId) {
    setFocusedSubjectId(String(subjectId));
    setActiveTab(tabId);
    setMobileNavOpen(false);
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
        @keyframes sc-fade { from { opacity: 0; } to { opacity: 1; } }
        .sc-enter { animation: sc-enter .5s cubic-bezier(.22,1,.36,1) both; }
        .sc-pop { animation: sc-pop .35s cubic-bezier(.22,1,.36,1) both; }
        .sc-fade { animation: sc-fade .3s ease-out both; }
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
      <div className="sc-blob pointer-events-none fixed -top-32 left-1/4 h-96 w-96 rounded-full bg-indigo-100/70 blur-3xl" />
      <div className="sc-blob pointer-events-none fixed right-0 bottom-0 h-96 w-96 rounded-full bg-sky-100/70 blur-3xl [animation-delay:-7s]" />

      <div className="relative z-10 mx-auto flex max-w-[1440px] flex-col lg:flex-row">
        {/* ================= SIDEBAR ================= */}
        <aside className="sc-scroll border-b border-slate-200/80 bg-white/70 backdrop-blur-xl lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:w-72 lg:shrink-0 lg:self-start lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between p-4 lg:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-sky-400 text-sm font-bold text-white shadow-md shadow-indigo-200">
                {initials(studentDisplayName)}
              </div>
              <div>
                <p className="sc-display text-sm font-bold text-slate-800">Student space</p>
                <p className="text-xs text-slate-500">
                  {profile.rollNumber || `ID #${profile.studentId ?? user?.userId ?? "—"}`}
                </p>
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
            {STUDENT_NAV.map((item) => {
              const active = activeTab === item.id;
              let badge = null;
              if (item.id === "registration") badge = `${registeredCredits}/${creditLimit}`;
              if (item.id === "marks" && quizMarks.length > 0) badge = quizMarks.length;

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
                      ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-200/80"
                      : "text-slate-600 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-xl p-2 transition-colors duration-300 ${
                        active
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className={`text-xs ${active ? "text-indigo-50" : "text-slate-400"}`}>
                        {item.shortDesc}
                      </p>
                    </div>
                  </div>

                  {badge !== null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        active ? "bg-white text-indigo-600" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Credits mini widget */}
            <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-500">Credits this semester</span>
                <span className="font-bold text-indigo-600">
                  {registeredCredits} / {creditLimit}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-400 transition-all duration-700 ease-out"
                  style={{ width: `${creditPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">{remainingCredits} credits left to enroll</p>
            </div>

            {/* Session card */}
            <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <p className="truncate text-sm font-semibold text-slate-800">{profile.email || user?.email}</p>
              <p className="mt-0.5 text-xs text-slate-500">Signed in as student</p>
              {logout && (
                <button
                  type="button"
                  onClick={logout}
                  className="mt-3 w-full cursor-pointer rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[.98]"
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
                })}
                {profile.rollNumber ? ` · Roll ${profile.rollNumber}` : ""}
              </p>
              <h1 className="sc-display mt-1.5 text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
                {greeting.salutation},{" "}
                <span className="bg-gradient-to-r from-indigo-500 to-sky-500 bg-clip-text text-transparent">
                  {studentDisplayName}
                </span>
              </h1>
              <p className="mt-1 text-sm text-slate-500">{greeting.subtitle}</p>
            </div>

            <button
              type="button"
              onClick={() => loadAllStudentData(true)}
              disabled={loading || isRefreshing}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition duration-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[.98] disabled:opacity-50"
            >
              <svg
                className={`h-4 w-4 text-indigo-500 ${isRefreshing ? "sc-spin" : ""}`}
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
                    <StudentKpi
                      title="Registered subjects"
                      value={
                        subjectCatalog?.registeredSubjects ??
                        dashboard?.summary?.registeredSubjects ??
                        registeredSubjects.length
                      }
                      subtitle="Courses this semester"
                      iconPath="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13"
                      soft="bg-indigo-50 text-indigo-600"
                      onClick={() => setActiveTab("registration")}
                      cta="View courses"
                    />
                    <StudentKpi
                      title="Credits enrolled"
                      value={`${registeredCredits} / ${creditLimit}`}
                      subtitle={`${remainingCredits} credits available`}
                      iconPath="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
                      soft="bg-sky-50 text-sky-600"
                      onClick={() => setActiveTab("registration")}
                      cta="Manage credits"
                    />
                    <StudentKpi
                      title="Registration"
                      value={windowStatus.replaceAll("_", " ").toLowerCase()}
                      subtitle={isWindowOpen ? "You can enroll right now" : "Set by your administration"}
                      iconPath="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z"
                      soft={isWindowOpen ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}
                      onClick={() => setActiveTab("registration")}
                      cta="Open catalog"
                      capitalize
                    />
                    <StudentKpi
                      title="Graded quizzes"
                      value={quizMarks.length}
                      subtitle="Completed so far"
                      iconPath="M4 20V10M10 20V4M16 20v-8M22 20H2"
                      soft="bg-fuchsia-50 text-fuchsia-600"
                      onClick={() => setActiveTab("marks")}
                      cta="See my marks"
                    />
                  </div>

                  <div className="grid gap-6 lg:grid-cols-12">
                    <Panel className="lg:col-span-7" delay={80}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h2 className="sc-display text-lg font-bold text-slate-800">
                            My courses <span className="text-slate-400">({registeredSubjects.length})</span>
                          </h2>
                          <p className="text-sm text-slate-500">Jump to attendance or lecture notes</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab("registration")}
                          className="cursor-pointer text-sm font-semibold text-indigo-600 transition hover:text-indigo-700"
                        >
                          Enroll in more
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {registeredSubjects.map((sub) => {
                          const id = sub.id ?? sub.subjectId;
                          return (
                            <div
                              key={id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition duration-300 hover:bg-white hover:shadow-md"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-indigo-600">{sub.subjectCode}</span>
                                  <span className="rounded-lg bg-white px-2 py-0.5 text-[11px] text-slate-500 shadow-sm">
                                    {sub.credits} credits
                                  </span>
                                </div>
                                <p className="mt-1 text-sm font-semibold text-slate-800">
                                  {sub.name ?? sub.subjectName}
                                </p>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => jumpToSubjectTab(id, "attendance")}
                                  className="cursor-pointer rounded-xl bg-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-600 active:scale-95"
                                >
                                  Attendance
                                </button>
                                <button
                                  type="button"
                                  onClick={() => jumpToSubjectTab(id, "materials")}
                                  className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
                                >
                                  Materials
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {registeredSubjects.length === 0 && (
                          <EmptyState text="You have not enrolled in any subjects yet." />
                        )}
                      </div>
                    </Panel>

                    <Panel className="lg:col-span-5" delay={140}>
                      <h2 className="sc-display text-lg font-bold text-slate-800">Attendance snapshot</h2>
                      <p className="text-sm text-slate-500">Your percentage in each course</p>

                      <div className="mt-4 space-y-3">
                        {recentActivity.map((act, idx) => {
                          const pct = Number(act.attendancePercentage ?? 0);
                          return (
                            <div key={act.subjectCode ?? idx} className="rounded-2xl bg-slate-50/80 p-4">
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="truncate font-semibold text-slate-700">
                                  {act.subjectCode} — {act.subjectName}
                                </span>
                                <span className={`font-bold ${pct >= 75 ? "text-emerald-600" : "text-rose-600"}`}>
                                  {pct}%
                                </span>
                              </div>
                              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                                    pct >= 75 ? "bg-emerald-400" : "bg-rose-400"
                                  }`}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}

                        {recentActivity.length === 0 && (
                          <EmptyState text="No attendance recorded yet." />
                        )}
                      </div>
                    </Panel>
                  </div>
                </div>
              )}

              {/* ============ REGISTRATION ============ */}
              {activeTab === "registration" && (
                <div key="tab-registration" className="space-y-6">
                  <Panel>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="sc-display text-xl font-bold text-slate-800">Course catalog</h2>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold capitalize ${
                              isWindowOpen ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${isWindowOpen ? "bg-emerald-500" : "bg-amber-500"}`} />
                            {windowStatus.replaceAll("_", " ").toLowerCase()}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {isWindowOpen
                            ? "Registration is open. Choose the subjects you want."
                            : "You can enroll only while registration is open."}
                        </p>
                        {windowInfo.startsAt && (
                          <p className="mt-1 text-xs text-slate-400">
                            Window: {new Date(windowInfo.startsAt).toLocaleString("en-IN")} to{" "}
                            {new Date(windowInfo.endsAt).toLocaleString("en-IN")}
                          </p>
                        )}
                      </div>

                      <div className="min-w-[240px] rounded-2xl bg-slate-50 p-4">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Credits used</span>
                          <span className="font-bold text-indigo-600">
                            {registeredCredits} / {creditLimit}
                          </span>
                        </div>
                        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-400 transition-all duration-700 ease-out"
                            style={{ width: `${creditPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Panel>

                  <Panel delay={80}>
                    <div className="sc-scroll overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-xs text-slate-400">
                            <th className="px-3 py-3 font-semibold">Code</th>
                            <th className="px-3 py-3 font-semibold">Course</th>
                            <th className="px-3 py-3 font-semibold">Credits</th>
                            <th className="px-3 py-3 font-semibold">Status</th>
                            <th className="px-3 py-3 text-right font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {allSubjects.map((sub) => {
                            const id = sub.id ?? sub.subjectId;
                            const isReg = Boolean(sub.isRegistered);
                            const credits = Number(sub.credits ?? 3);
                            const exceedsLimit = registeredCredits + credits > creditLimit;

                            return (
                              <tr key={id} className="transition-colors duration-200 hover:bg-indigo-50/40">
                                <td className="px-3 py-4 font-mono text-xs font-bold text-indigo-600">{sub.subjectCode}</td>
                                <td className="px-3 py-4 font-semibold text-slate-800">{sub.name ?? sub.subjectName}</td>
                                <td className="px-3 py-4">
                                  <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-600">
                                    {credits} cr
                                  </span>
                                </td>
                                <td className="px-3 py-4">
                                  {isReg ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-600">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                      Registered
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
                                      Available
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-4 text-right">
                                  {isReg ? (
                                    <span className="text-xs font-semibold text-slate-400">Enrolled</span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!isWindowOpen || exceedsLimit || registeringId !== null}
                                      onClick={() => handleEnrollSubject(sub)}
                                      className="cursor-pointer rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-200/70 transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
                                    >
                                      {registeringId === id
                                        ? "Enrolling..."
                                        : exceedsLimit
                                        ? "Credit limit reached"
                                        : "Register"}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}

                          {allSubjects.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-10 text-center text-slate-400">
                                No courses available in the catalog yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </div>
              )}

              {/* ============ MODULES ============ */}
              {activeTab === "attendance" && (
                <StudentAttendanceModule
                  registeredSubjects={registeredSubjects}
                  initialSubjectId={focusedSubjectId}
                  onError={(msg) => setErrorMsg(msg)}
                />
              )}

              {activeTab === "materials" && (
                <StudentMaterialsModule
                  registeredSubjects={registeredSubjects}
                  initialSubjectId={focusedSubjectId}
                  onNotify={(msg) => setNotice(msg)}
                  onError={(msg) => setErrorMsg(msg)}
                />
              )}

              {activeTab === "quizzes" && (
                <StudentQuizzesModule
                  onNotify={(msg) => setNotice(msg)}
                  onError={(msg) => setErrorMsg(msg)}
                  onRefreshMarks={() => loadAllStudentData(true)}
                />
              )}

              {/* ============ MARKS ============ */}
              {activeTab === "marks" && (
                <Panel key="tab-marks">
                  <h2 className="sc-display text-xl font-bold text-slate-800">
                    My quiz marks <span className="text-slate-400">({quizMarks.length})</span>
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Your best score, latest score and attempts for every quiz you have taken.
                  </p>

                  <div className="sc-scroll mt-6 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs text-slate-400">
                          <th className="px-3 py-3 font-semibold">Subject</th>
                          <th className="px-3 py-3 font-semibold">Quiz</th>
                          <th className="px-3 py-3 font-semibold">Attempts</th>
                          <th className="px-3 py-3 font-semibold">Best</th>
                          <th className="px-3 py-3 font-semibold">Latest</th>
                          <th className="px-3 py-3 font-semibold">Submitted</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {quizMarks.map((item, idx) => (
                          <tr key={item.quizId ?? idx} className="transition-colors duration-200 hover:bg-indigo-50/40">
                            <td className="px-3 py-4">
                              <span className="font-mono text-xs font-bold text-indigo-600">{item.subjectCode}</span>
                              <span className="block text-xs text-slate-400">{item.subjectName}</span>
                            </td>
                            <td className="px-3 py-4 font-semibold text-slate-800">{item.quizTitle}</td>
                            <td className="px-3 py-4 text-slate-500">
                              {item.completedAttempts ?? 0} / {item.maxAttempts ?? 1}
                            </td>
                            <td className="px-3 py-4">
                              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">
                                {item.bestScore ?? 0} / {item.totalMarks ?? "—"}
                              </span>
                            </td>
                            <td className="px-3 py-4 font-semibold text-slate-700">
                              {item.latestScore ?? 0} / {item.totalMarks ?? "—"}
                            </td>
                            <td className="px-3 py-4 text-slate-400">
                              {item.latestSubmittedAt
                                ? new Date(item.latestSubmittedAt).toLocaleString("en-IN")
                                : "—"}
                            </td>
                          </tr>
                        ))}

                        {quizMarks.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-slate-400">
                              No graded quiz attempts yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
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

function StudentKpi({ title, value, subtitle, onClick, cta, iconPath, soft, capitalize = false }) {
  const shown = useCountUp(value);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-3xl border border-white bg-white/90 p-5 text-left shadow-lg shadow-slate-200/60 transition duration-300 hover:-translate-y-1.5 hover:shadow-xl"
    >
      <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-gradient-to-br from-indigo-300 to-sky-300 opacity-20 blur-2xl transition duration-500 group-hover:opacity-40" />
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition duration-300 group-hover:scale-110 group-hover:-rotate-6 ${soft}`}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d={iconPath} />
        </svg>
      </span>
      <p className="mt-4 text-sm font-medium text-slate-500">{title}</p>
      <p className={`sc-display mt-1 text-3xl font-extrabold text-slate-800 ${capitalize ? "capitalize" : ""}`}>
        {shown}
      </p>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
      <p className="mt-4 text-xs font-semibold text-indigo-600 transition group-hover:translate-x-1">{cta} →</p>
    </button>
  );
}