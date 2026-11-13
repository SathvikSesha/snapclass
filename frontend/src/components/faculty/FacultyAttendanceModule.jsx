// FacultyAttendanceModule.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSubjectAttendance,
  getSubjectAttendanceDates,
  recognizeAttendance,
  saveSubjectAttendance,
} from "../../services/faculty.service";

function getTodayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatShortDate(val) {
  if (!val) return "—";
  const clean = String(val).slice(0, 10);
  const d = new Date(`${clean}T00:00:00`);
  if (Number.isNaN(d.getTime())) return clean;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function unwrap(val, key) {
  if (Array.isArray(val)) return val;
  if (Array.isArray(val?.[key])) return val[key];
  return [];
}

function getStudentId(s) {
  return s.studentId ?? s.student_id ?? s.id;
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

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition duration-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100";

const primaryBtn =
  "cursor-pointer rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0";

const ghostBtn =
  "cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition duration-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[.98] disabled:opacity-50";

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

export default function FacultyAttendanceModule({
  assignedSubjects = [],
  initialSubject = null,
  onNotify,
  onError,
}) {
  const [selectedSubjectId, setSelectedSubjectId] = useState(() => {
    const first = initialSubject ?? assignedSubjects[0];
    return first ? String(first.subjectId ?? first.id) : "";
  });

  const onErrorRef = useRef(onError);
  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onErrorRef.current = onError;
    onNotifyRef.current = onNotify;
  });

  const [attendanceDate, setAttendanceDate] = useState(getTodayIso());
  const [savedDates, setSavedDates] = useState([]);
  const [students, setStudents] = useState([]);
  const [rosterSearch, setRosterSearch] = useState("");
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [busyAction, setBusyAction] = useState("");

  // AI Recognition State
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [recognitionData, setRecognitionData] = useState(null);
  const [aiMatchedMap, setAiMatchedMap] = useState({}); // { [studentId]: { distance, suggestedStatus } }

  // Follow the subject chosen from the dashboard (only when it changes)
  useEffect(() => {
    if (initialSubject) {
      setSelectedSubjectId(String(initialSubject.subjectId ?? initialSubject.id));
    }
  }, [initialSubject]);

  // Fallback: pick the first subject if none is selected yet
  useEffect(() => {
    if (!selectedSubjectId && assignedSubjects.length > 0) {
      setSelectedSubjectId(String(assignedSubjects[0].subjectId ?? assignedSubjects[0].id));
    }
  }, [assignedSubjects, selectedSubjectId]);

  // Previews for selected classroom photos
  useEffect(() => {
    if (!photos.length) {
      setPhotoPreviews([]);
      return;
    }
    const urls = photos.map((file) => ({
      name: file.name,
      sizeKb: (file.size / 1024).toFixed(0),
      url: URL.createObjectURL(file),
    }));
    setPhotoPreviews(urls);

    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u.url));
    };
  }, [photos]);

  const currentSubject = useMemo(
    () =>
      assignedSubjects.find((s) => String(s.subjectId ?? s.id) === String(selectedSubjectId)) ||
      null,
    [assignedSubjects, selectedSubjectId]
  );

  const loadAttendanceSession = useCallback(
    async (subId, dateStr) => {
      if (!subId || !dateStr) return;
      setLoadingRoster(true);
      try {
        const [datesRes, rosterRes] = await Promise.all([
          getSubjectAttendanceDates(subId),
          getSubjectAttendance(subId, dateStr),
        ]);

        setSavedDates(unwrap(datesRes, "dates"));
        const rawStudents = unwrap(rosterRes, "students");
        setStudents(
          rawStudents.map((s) => ({
            ...s,
            status:
              String(s.status ?? "ABSENT").toUpperCase() === "PRESENT" ? "PRESENT" : "ABSENT",
            markedByAi: false,
          }))
        );
      } catch (err) {
        onErrorRef.current?.(
          err?.response?.data?.message || err?.message || "Failed to load attendance roster."
        );
      } finally {
        setLoadingRoster(false);
      }
    },
    []
  );

  // Load session only when selected subject or date changes
  useEffect(() => {
    if (selectedSubjectId && attendanceDate) {
      setRecognitionData(null);
      setAiMatchedMap({});
      loadAttendanceSession(selectedSubjectId, attendanceDate);
    }
  }, [selectedSubjectId, attendanceDate, loadAttendanceSession]);

  // Toggle single student between PRESENT and ABSENT
  function toggleStudentStatus(studentId) {
    const targetStr = String(studentId).trim();
    const targetNum = Number(studentId);
    setStudents((prev) =>
      prev.map((s) => {
        const sid = getStudentId(s);
        const isMatch =
          String(sid).trim() === targetStr ||
          (!Number.isNaN(targetNum) && Number(sid) === targetNum);
        if (!isMatch) return s;
        return {
          ...s,
          status: s.status === "PRESENT" ? "ABSENT" : "PRESENT",
          markedByAi: false,
        };
      })
    );
  }

  function setExplicitStatus(studentId, nextStatus) {
    const targetStr = String(studentId).trim();
    const targetNum = Number(studentId);
    setStudents((prev) =>
      prev.map((s) => {
        const sid = getStudentId(s);
        const isMatch =
          String(sid).trim() === targetStr ||
          (!Number.isNaN(targetNum) && Number(sid) === targetNum);
        if (!isMatch) return s;
        return {
          ...s,
          status: nextStatus,
          markedByAi: false,
        };
      })
    );
  }

  function markAllStudents(status) {
    setStudents((prev) => prev.map((s) => ({ ...s, status, markedByAi: false })));
  }

  function handlePhotoSelection(e) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!selected.length) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    const filtered = [];

    for (const file of selected) {
      const isSupported =
        validTypes.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);

      if (!isSupported) {
        onErrorRef.current?.(`Skipped "${file.name}": Only JPEG, PNG, or WebP allowed.`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        onErrorRef.current?.(`Skipped "${file.name}": File exceeds 5MB limit.`);
        continue;
      }
      filtered.push(file);
    }

    const nextPhotos = [...photos, ...filtered].slice(0, 4);
    setPhotos(nextPhotos);
    setRecognitionData(null);
  }

  async function handleRunAiRecognition() {
    if (!selectedSubjectId || photos.length === 0) {
      onErrorRef.current?.("Please upload 1 to 4 classroom photos first.");
      return;
    }

    setBusyAction("recognize");
    try {
      const result = await recognizeAttendance(selectedSubjectId, photos);
      setRecognitionData(result);

      const recognizedList =
        result?.recognizedStudents ??
        result?.matchedStudents ??
        unwrap(result, "recognizedStudents");

      const matchLookup = {};
      for (const item of Array.isArray(recognizedList) ? recognizedList : []) {
        const rawId = item.studentId ?? item.student_id ?? item.id;
        if (rawId == null) continue;
        const strId = String(rawId).trim();
        const numId = Number(rawId);
        const matchData = {
          distance: item.distance,
          suggestedStatus: String(item.suggestedStatus ?? "PRESENT").toUpperCase(),
        };
        matchLookup[strId] = matchData;
        if (!Number.isNaN(numId)) {
          matchLookup[numId] = matchData;
        }
      }
      setAiMatchedMap(matchLookup);

      // Automatically flip recognized students to PRESENT on the roster
      const recognizedCount = Array.isArray(recognizedList) ? recognizedList.length : 0;
      if (recognizedCount > 0) {
        setStudents((prev) =>
          prev.map((stu) => {
            const rawId = getStudentId(stu);
            const strId = String(rawId).trim();
            const numId = Number(rawId);
            const match = matchLookup[strId] || matchLookup[numId];
            if (match) {
              return {
                ...stu,
                status: "PRESENT",
                markedByAi: true,
                aiDistance: match.distance,
              };
            }
            return stu;
          })
        );
      }

      onNotifyRef.current?.(
        `AI Face Recognition complete! ${recognizedCount} student(s) recognized and toggled to PRESENT below. Verify and click 'Save attendance' when ready.`
      );
    } catch (err) {
      onErrorRef.current?.(
        err?.response?.data?.message || err?.message || "AI Face Recognition failed."
      );
    } finally {
      setBusyAction("");
    }
  }

  async function handleSaveAttendance() {
    if (!selectedSubjectId || students.length === 0) return;

    setBusyAction("save");
    try {
      const records = students.map((s) => ({
        studentId: Number(getStudentId(s)) || getStudentId(s),
        status: s.status === "PRESENT" ? "PRESENT" : "ABSENT",
      }));

      const res = await saveSubjectAttendance(selectedSubjectId, attendanceDate, records);

      onNotify?.(res?.message || `Attendance saved for ${formatShortDate(attendanceDate)}!`);
      await loadAttendanceSession(selectedSubjectId, attendanceDate);
    } catch (err) {
      onError?.(
        err?.response?.data?.message || err?.message || "Failed to save attendance session."
      );
    } finally {
      setBusyAction("");
    }
  }

  const presentCount = useMemo(
    () => students.filter((s) => s.status === "PRESENT").length,
    [students]
  );
  const absentCount = students.length - presentCount;
  const rate = students.length > 0 ? Math.round((presentCount / students.length) * 100) : 0;

  const filteredStudents = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        String(s.fullName ?? s.name ?? "").toLowerCase().includes(q) ||
        String(s.email ?? "").toLowerCase().includes(q) ||
        String(getStudentId(s)).toLowerCase().includes(q)
    );
  }, [students, rosterSearch]);

  if (assignedSubjects.length === 0) {
    return (
      <Card className="py-12 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8a2 2 0 012-2h2l1.5-2h5L16 6h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
          </svg>
        </span>
        <p className="sc-display mt-4 text-lg font-bold text-slate-800">No subjects to take attendance for yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Ask to teach a subject in the Subjects tab. Once the admin approves it, you can take
          attendance with a class photo here.
        </p>
      </Card>
    );
  }

  const recognizing = busyAction === "recognize";

  return (
    <div className="space-y-6">
      {/* ============ Choose course and date ============ */}
      <Card>
        <div className="grid gap-5 lg:grid-cols-12">
          <label className="block lg:col-span-5">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Course</span>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className={`${inputCls} cursor-pointer font-semibold`}
            >
              {assignedSubjects.map((sub) => {
                const id = sub.subjectId ?? sub.id;
                return (
                  <option key={id} value={id}>
                    {sub.subjectCode} — {sub.subjectName ?? sub.name} ({sub.credits ?? 3} Cr)
                  </option>
                );
              })}
            </select>
          </label>

          <label className="block lg:col-span-3">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Class date</span>
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className={inputCls}
            />
          </label>

          <div className="lg:col-span-4">
            <p className="mb-1.5 text-xs font-semibold text-slate-600">
              Saved days <span className="font-normal text-slate-400">({savedDates.length})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {savedDates.slice(0, 6).map((item, idx) => {
                const rawDate = typeof item === "string" ? item : item.attendanceDate ?? item.date;
                const cleanDate = String(rawDate).slice(0, 10);
                const isSelected = cleanDate === attendanceDate;
                return (
                  <button
                    key={`${cleanDate}-${idx}`}
                    type="button"
                    onClick={() => setAttendanceDate(cleanDate)}
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300 ${
                      isSelected
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-200"
                        : "bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
                    }`}
                  >
                    {formatShortDate(cleanDate)}
                  </button>
                );
              })}
              {savedDates.length === 0 && (
                <span className="text-xs text-slate-400">Nothing saved for this subject yet.</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ============ Photo recognition ============ */}
      <Card delay={80}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="sc-display text-xl font-bold text-slate-800">Take attendance with a photo</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload 1 to 4 photos of your class (JPEG, PNG or WebP, up to 5MB each). Students the AI
              recognises are marked <strong className="text-emerald-600">present</strong> in the list
              below, and you can adjust before saving.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="cursor-pointer rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-100 active:scale-[.98]">
              Add photos ({photos.length}/4)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handlePhotoSelection}
                className="hidden"
              />
            </label>

            {photos.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPhotos([]);
                  setRecognitionData(null);
                  setAiMatchedMap({});
                }}
                className={ghostBtn}
              >
                Clear
              </button>
            )}

            <button
              type="button"
              disabled={photos.length === 0 || recognizing}
              onClick={handleRunAiRecognition}
              className={primaryBtn}
            >
              {recognizing ? "Scanning faces..." : "Find students"}
            </button>
          </div>
        </div>

        {/* Empty drop hint */}
        {photoPreviews.length === 0 && (
          <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 py-10 text-center transition duration-300 hover:border-emerald-300 hover:bg-emerald-50">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-emerald-500 shadow-sm">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
              </svg>
            </span>
            <span className="mt-3 text-sm font-semibold text-slate-700">Click to choose classroom photos</span>
            <span className="mt-0.5 text-xs text-slate-400">A clear photo of everyone's face works best</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handlePhotoSelection}
              className="hidden"
            />
          </label>
        )}

        {/* Thumbnails */}
        {photoPreviews.length > 0 && (
          <div className="sc-stagger mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photoPreviews.map((item, idx) => (
              <div
                key={idx}
                className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-2 shadow-sm"
              >
                <div className="relative overflow-hidden rounded-xl">
                  <img src={item.url} alt={item.name} className="h-28 w-full object-cover" />
                  {recognizing && (
                    <span className="sc-scan pointer-events-none absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-emerald-300/50 to-transparent" />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between px-1 text-[11px]">
                  <span className="truncate font-medium text-slate-600">{item.name}</span>
                  <span className="shrink-0 text-slate-400">{item.sizeKb} KB</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results summary */}
        {recognitionData && (
          <div className="sc-enter mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Photos scanned", value: recognitionData.imagesProcessed ?? photos.length, tone: "text-slate-800" },
              { label: "Faces found", value: recognitionData.totalFacesDetected ?? 0, tone: "text-sky-600" },
              {
                label: "Students matched",
                value: recognitionData.recognizedCount ?? Object.keys(aiMatchedMap).length,
                tone: "text-emerald-600",
              },
              { label: "Unknown faces", value: recognitionData.unknownFaces ?? 0, tone: "text-amber-600" },
              { label: "Unclear faces", value: recognitionData.ambiguousFaces ?? 0, tone: "text-rose-600" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[11px] text-slate-400">{s.label}</p>
                <p className={`sc-display mt-0.5 text-xl font-bold ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ============ Roster ============ */}
      <Card delay={140}>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="min-w-[14rem] flex-1">
            <h3 className="sc-display text-xl font-bold text-slate-800">
              {currentSubject?.subjectCode} class list{" "}
              <span className="text-slate-400">({students.length})</span>
            </h3>

            <div className="mt-3 flex flex-wrap items-center gap-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Present {presentCount}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-600">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Absent {absentCount}
              </span>
            </div>

            {students.length > 0 && (
              <div className="mt-4 max-w-sm">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Today's attendance</span>
                  <span className="font-semibold text-slate-700">{rate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-700 ease-out"
                    style={{ width: `${rate}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="search"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder="Search students..."
              className={`${inputCls} w-48`}
            />
            <button
              type="button"
              onClick={() => markAllStudents("PRESENT")}
              className="cursor-pointer rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100 active:scale-95"
            >
              All present
            </button>
            <button
              type="button"
              onClick={() => markAllStudents("ABSENT")}
              className="cursor-pointer rounded-xl bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 active:scale-95"
            >
              All absent
            </button>
          </div>
        </div>

        {loadingRoster ? (
          <div className="mt-6 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
            No enrolled students found for this subject.
          </div>
        ) : (
          <div className="sc-scroll mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="px-3 py-3 font-semibold">Student</th>
                  <th className="px-3 py-3 font-semibold">Overall</th>
                  <th className="px-3 py-3 font-semibold">AI match</th>
                  <th className="px-3 py-3 text-right font-semibold">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredStudents.map((stu) => {
                  const id = getStudentId(stu);
                  const isPresent = stu.status === "PRESENT";
                  const rawAiMatch = aiMatchedMap[String(id)] || aiMatchedMap[Number(id)];
                  const aiMatch =
                    rawAiMatch || (stu.markedByAi ? { distance: stu.aiDistance } : null);
                  const name = stu.fullName ?? stu.name ?? "Student";

                  return (
                    <tr
                      key={id}
                      className={`transition-colors duration-300 ${
                        isPresent
                          ? aiMatch
                            ? "bg-emerald-50/80 hover:bg-emerald-100/70 border-l-4 border-l-emerald-500"
                            : "bg-emerald-50/40 hover:bg-emerald-50/70 border-l-4 border-l-emerald-400"
                          : "hover:bg-slate-50/70 border-l-4 border-l-transparent"
                      }`}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors duration-300 ${
                              isPresent ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {initials(name)}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-800">{name}</p>
                            <p className="text-xs text-slate-400">
                              #{id}
                              {stu.email ? ` · ${stu.email}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        {stu.attendancePercentage !== undefined ? (
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                            {stu.attendancePercentage}%
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {aiMatch ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            Recognized
                            {aiMatch.distance !== undefined &&
                              ` (${Number(aiMatch.distance).toFixed(2)})`}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Manual</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right">
                        {/* High-visibility segmented Present / Absent switch */}
                        <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 shadow-inner">
                          <button
                            type="button"
                            onClick={() => setExplicitStatus(id, "PRESENT")}
                            className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ${
                              isPresent
                                ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30 scale-[1.02]"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            ✓ Present
                          </button>
                          <button
                            type="button"
                            onClick={() => setExplicitStatus(id, "ABSENT")}
                            className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ${
                              !isPresent
                                ? "bg-rose-500 text-white shadow-md shadow-rose-500/30 scale-[1.02]"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            ✕ Absent
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Save bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 p-4">
          <p className="text-sm text-slate-600">
            Saving <strong className="text-slate-800">{currentSubject?.subjectCode}</strong> for{" "}
            <strong className="text-emerald-600">{formatShortDate(attendanceDate)}</strong>
            <span className="text-slate-400">
              {" "}
              · {presentCount} present, {absentCount} absent
            </span>
          </p>

          <button
            type="button"
            disabled={busyAction === "save" || loadingRoster || students.length === 0}
            onClick={handleSaveAttendance}
            className={`${primaryBtn} px-6 py-3`}
          >
            {busyAction === "save" ? "Saving..." : "Save attendance"}
          </button>
        </div>
      </Card>
    </div>
  );
}