import { useCallback, useEffect, useState } from "react";
import {
  getSubjectAttendance,
  getSubjectAttendanceHistory,
} from "../../services/student.service";

function unwrap(val, key) {
  if (Array.isArray(val)) return val;
  if (Array.isArray(val?.[key])) return val[key];
  return [];
}

function formatSessionDate(val) {
  if (!val) return "—";
  const clean = String(val).slice(0, 10);
  const d = new Date(`${clean}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMarkedTime(val) {
  if (!val) return "—";
  const d = new Date(String(val).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none transition duration-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";

function Card({ children, className = "", delay = 0 }) {
  return (
    <section
      style={{ animationDelay: `${delay}ms` }}
      className={`sc-enter rounded-3xl border border-white bg-white/85 p-6 shadow-lg shadow-slate-200/60 backdrop-blur ${className}`}
    >
      {children}
    </section>
  );
}

export default function StudentAttendanceModule({
  registeredSubjects = [],
  initialSubjectId = "",
  onError,
}) {
  const [selectedSubjectId, setSelectedSubjectId] = useState(() => {
    if (initialSubjectId) return String(initialSubjectId);
    const first = registeredSubjects[0];
    return first ? String(first.id ?? first.subjectId) : "";
  });

  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ringPct, setRingPct] = useState(0);

  // Follow the subject chosen from the dashboard (only when it changes)
  useEffect(() => {
    if (initialSubjectId) {
      setSelectedSubjectId(String(initialSubjectId));
    }
  }, [initialSubjectId]);

  // Fallback: pick the first subject if none is selected yet
  useEffect(() => {
    if (!selectedSubjectId && registeredSubjects.length > 0) {
      const first = registeredSubjects[0];
      setSelectedSubjectId(String(first.id ?? first.subjectId));
    }
  }, [registeredSubjects, selectedSubjectId]);

  const loadSubjectTelemetry = useCallback(
    async (subId) => {
      if (!subId) return;
      setLoading(true);
      try {
        const [sumData, histData] = await Promise.all([
          getSubjectAttendance(subId),
          getSubjectAttendanceHistory(subId),
        ]);
        setSummary(sumData);
        setRecords(unwrap(histData, "records"));
      } catch (err) {
        onError?.(
          err?.response?.data?.message || err?.message || "Could not load attendance telemetry."
        );
      } finally {
        setLoading(false);
      }
    },
    [onError]
  );

  useEffect(() => {
    if (selectedSubjectId) {
      loadSubjectTelemetry(selectedSubjectId);
    }
  }, [selectedSubjectId, loadSubjectTelemetry]);

  const pct = Number(summary?.attendancePercentage ?? 0);

  // Animate the ring from empty to the real percentage
  useEffect(() => {
    setRingPct(0);
    const id = requestAnimationFrame(() => setRingPct(pct));
    return () => cancelAnimationFrame(id);
  }, [pct, summary]);

  if (registeredSubjects.length === 0) {
    return (
      <Card className="py-12 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <p className="sc-display mt-4 text-lg font-bold text-slate-800">No courses yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Enroll in courses under the Courses tab first, then your attendance will show up here.
        </p>
      </Card>
    );
  }

  const isEligible = summary?.isEligible ?? pct >= 75;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, ringPct)) / 100) * circumference;

  return (
    <div className="space-y-6">
      {/* Course selector */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="sc-display text-xl font-bold text-slate-800">My attendance</h2>
            <p className="mt-1 text-sm text-slate-500">Pick a course to see how you are doing.</p>
          </div>

          <select
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            className={`${inputCls} cursor-pointer sm:w-80`}
          >
            {registeredSubjects.map((s) => {
              const id = s.id ?? s.subjectId;
              return (
                <option key={id} value={id}>
                  {s.subjectCode} — {s.name ?? s.subjectName}
                </option>
              );
            })}
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-32 animate-pulse rounded-3xl bg-white/80 shadow-sm" />
          ))}
        </div>
      ) : (
        <>
          {summary && (
            <section className="grid gap-6 lg:grid-cols-12">
              {/* Ring */}
              <Card className="flex items-center gap-6 lg:col-span-5" delay={60}>
                <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
                  <svg className="h-32 w-32 -rotate-90 transform" viewBox="0 0 128 128">
                    <circle cx="64" cy="64" r={radius} stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-100" />
                    <circle
                      cx="64"
                      cy="64"
                      r={radius}
                      stroke="currentColor"
                      strokeWidth="10"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      fill="transparent"
                      style={{ transition: "stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)" }}
                      className={isEligible ? "text-indigo-500" : "text-rose-500"}
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span className="sc-display text-xl font-extrabold text-slate-800">{pct.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="min-w-0">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
                      isEligible ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${isEligible ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {isEligible ? "Eligible for exams" : "Attendance shortage"}
                  </span>
                  <h3 className="sc-display mt-2 truncate text-lg font-bold text-slate-800">
                    {summary.subjectName ?? "Course attendance"}
                  </h3>
                  <p className="font-mono text-xs font-bold text-indigo-600">{summary.subjectCode}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    You attended{" "}
                    <strong className="text-slate-800">{summary.presentCount ?? 0}</strong> of{" "}
                    <strong className="text-slate-800">
                      {summary.totalClasses ?? summary.totalSessions ?? 0}
                    </strong>{" "}
                    classes.
                  </p>
                </div>
              </Card>

              {/* Breakdown */}
              <div className="sc-stagger grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-7">
                <div className="rounded-3xl border border-white bg-white/90 p-5 shadow-lg shadow-slate-200/60">
                  <p className="text-xs font-medium text-slate-400">Total classes</p>
                  <p className="sc-display mt-3 text-3xl font-extrabold text-slate-800">
                    {summary.totalClasses ?? summary.totalSessions ?? 0}
                  </p>
                </div>
                <div className="rounded-3xl border border-white bg-emerald-50/80 p-5 shadow-lg shadow-slate-200/60">
                  <p className="text-xs font-medium text-emerald-600">Present</p>
                  <p className="sc-display mt-3 text-3xl font-extrabold text-emerald-600">
                    {summary.presentCount ?? 0}
                  </p>
                </div>
                <div className="rounded-3xl border border-white bg-rose-50/80 p-5 shadow-lg shadow-slate-200/60">
                  <p className="text-xs font-medium text-rose-600">Absent</p>
                  <p className="sc-display mt-3 text-3xl font-extrabold text-rose-600">
                    {summary.absentCount ?? 0}
                  </p>
                </div>
                <div className="rounded-3xl border border-white bg-amber-50/80 p-5 shadow-lg shadow-slate-200/60">
                  <p className="text-xs font-medium text-amber-600">Excused</p>
                  <p className="sc-display mt-3 text-3xl font-extrabold text-amber-600">
                    {summary.excusedCount ?? 0}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* History */}
          <Card delay={120}>
            <h3 className="sc-display text-lg font-bold text-slate-800">
              Class history <span className="text-slate-400">({records.length})</span>
            </h3>
            <p className="text-sm text-slate-500">
              Each class shows whether it was marked by face recognition or by your teacher.
            </p>

            <div className="sc-scroll mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="px-3 py-3 font-semibold">Date</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Marked by</th>
                    <th className="px-3 py-3 font-semibold">Marked at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.map((rec, idx) => {
                    const status = String(rec.status ?? "").toUpperCase();
                    const method = String(rec.method ?? "MANUAL").toUpperCase();
                    const isPresent = status === "PRESENT";
                    const isAi = method.includes("AI") || method.includes("FACE");

                    return (
                      <tr
                        key={rec.sessionId ?? `${rec.sessionDate}-${idx}`}
                        className="transition-colors duration-200 hover:bg-indigo-50/40"
                      >
                        <td className="px-3 py-3.5 font-semibold text-slate-800">
                          {formatSessionDate(rec.sessionDate ?? rec.attendanceDate)}
                        </td>
                        <td className="px-3 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold capitalize ${
                              isPresent ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${isPresent ? "bg-emerald-500" : "bg-rose-500"}`} />
                            {(status || "unknown").toLowerCase()}
                          </span>
                        </td>
                        <td className="px-3 py-3.5">
                          <span
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                              isAi ? "bg-sky-50 text-sky-600" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {isAi ? "Face recognition" : "Teacher"}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-slate-400">{formatMarkedTime(rec.markedAt)}</td>
                      </tr>
                    );
                  })}

                  {records.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-400">
                        No classes have been recorded for this subject yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}