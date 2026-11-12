import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getFacultyDashboard,
  getFacultySubjects,
  requestSubjectAccess,
  getSubjectAttendanceDates,
  getSubjectAttendance,
  recognizeAttendance,
  saveSubjectAttendance,
} from "../services/faculty.service";

function errorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

function unwrapList(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  return [];
}

function todayString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value) {
  if (!value) return "—";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function studentIdOf(student) {
  return student.studentId ?? student.student_id ?? student.id;
}

function statusOf(student) {
  return String(student.status ?? "ABSENT").toUpperCase();
}

export default function FacultyDashboard() {
  const { user } = useAuth();

  const [dashboard, setDashboard] = useState(null);
  const [allSubjects, setAllSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const [selectedSubject, setSelectedSubject] = useState(null);
  const [attendanceDate, setAttendanceDate] = useState(todayString());
  const [attendanceDates, setAttendanceDates] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const [photos, setPhotos] = useState([]);
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [recognitionError, setRecognitionError] = useState("");

  const loadPage = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const [dashboardResult, subjectsResult] = await Promise.all([
        getFacultyDashboard(),
        getFacultySubjects(),
      ]);

      setDashboard(dashboardResult);
      setAllSubjects(unwrapList(subjectsResult, "subjects"));
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const assignedSubjects = useMemo(
    () =>
      allSubjects.filter(
        (subject) =>
          subject.isAssigned === true ||
          subject.isTeaching === true ||
          subject.assigned === true
      ),
    [allSubjects]
  );

  const discoverableSubjects = useMemo(
    () =>
      allSubjects.filter(
        (subject) =>
          !(
            subject.isAssigned === true ||
            subject.isTeaching === true ||
            subject.assigned === true
          )
      ),
    [allSubjects]
  );

  const myRequests = useMemo(
    () =>
      allSubjects.filter((subject) => {
        const status = String(subject.requestStatus ?? "").toUpperCase();
        return status === "PENDING" || status === "APPROVED" || status === "REJECTED";
      }),
    [allSubjects]
  );

  const pendingRequestsCount = useMemo(
    () =>
      allSubjects.filter(
        (subject) =>
          String(subject.requestStatus ?? "").toUpperCase() === "PENDING"
      ).length,
    [allSubjects]
  );

  const openSubject = async (subject) => {
    setSelectedSubject(subject);
    setStudents([]);
    setAttendanceDates([]);
    setPhotos([]);
    setRecognitionResult(null);
    setRecognitionError("");
    setNotice("");
    setPageError("");

    const subjectId = subject.subjectId ?? subject.id;

    setAttendanceLoading(true);

    try {
      const [datesResult, attendanceResult] = await Promise.all([
        getSubjectAttendanceDates(subjectId),
        getSubjectAttendance(subjectId, attendanceDate),
      ]);

      setAttendanceDates(unwrapList(datesResult, "dates"));
      setStudents(
        unwrapList(attendanceResult, "students").map((student) => ({
          ...student,
          status: statusOf(student),
        }))
      );
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setAttendanceLoading(false);
    }
  };

  const reloadAttendance = async (date = attendanceDate) => {
    if (!selectedSubject) return;

    const subjectId = selectedSubject.subjectId ?? selectedSubject.id;
    setAttendanceLoading(true);
    setPageError("");

    try {
      const result = await getSubjectAttendance(subjectId, date);
      setStudents(
        unwrapList(result, "students").map((student) => ({
          ...student,
          status: statusOf(student),
        }))
      );
      setRecognitionResult(null);
      setRecognitionError("");
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setAttendanceLoading(false);
    }
  };

  const changeStatus = (studentId, status) => {
    setStudents((current) =>
      current.map((student) =>
        String(studentIdOf(student)) === String(studentId)
          ? { ...student, status }
          : student
      )
    );
  };

  const markAll = (status) => {
    setStudents((current) =>
      current.map((student) => ({ ...student, status }))
    );
  };

  const handleRequestAccess = async (subject) => {
    const subjectId = subject.subjectId ?? subject.id;
    setBusy(`request-${subjectId}`);
    setPageError("");
    setNotice("");

    try {
      await requestSubjectAccess(subjectId);
      setNotice(`Request submitted for ${subject.name ?? subject.subjectName}. Pending admin review.`);
      await loadPage();
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const handleDateChange = async (date) => {
    setAttendanceDate(date);
    await reloadAttendance(date);
  };

  const handleRecognize = async () => {
    if (!selectedSubject || photos.length === 0) {
      setRecognitionError("Select one or more classroom photos first.");
      return;
    }

    setBusy("recognize");
    setRecognitionError("");
    setNotice("");

    try {
      const subjectId = selectedSubject.subjectId ?? selectedSubject.id;
      const result = await recognizeAttendance(subjectId, photos);
      setRecognitionResult(result);
    } catch (error) {
      setRecognitionError(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const applyRecognition = () => {
    if (!recognitionResult) return;

    const list =
      recognitionResult.recognizedStudents ??
      recognitionResult.matchedStudents ??
      unwrapList(recognitionResult, "recognizedStudents") ??
      unwrapList(recognitionResult, "matchedStudents");

    const matchedIds = new Set(
      (Array.isArray(list) ? list : [])
        .map((item) => item.studentId ?? item.student_id ?? item.id)
        .filter((id) => id != null)
        .map(String)
    );

    setStudents((current) =>
      current.map((student) => ({
        ...student,
        status: matchedIds.has(String(studentIdOf(student)))
          ? "PRESENT"
          : student.status,
      }))
    );

    setNotice(
      `Recognition suggestions applied (${matchedIds.size} matched). Review every student before saving.`
    );
  };

  const handleSaveAttendance = async () => {
    if (!selectedSubject) return;

    if (students.length === 0) {
      setPageError("There are no enrolled students to save attendance for.");
      return;
    }

    if (
      students.some(
        (student) =>
          !["PRESENT", "ABSENT"].includes(String(student.status).toUpperCase())
      )
    ) {
      setPageError("Every student must be marked Present or Absent.");
      return;
    }

    setBusy("save");
    setPageError("");
    setNotice("");

    try {
      const subjectId = selectedSubject.subjectId ?? selectedSubject.id;

      const records = students.map((student) => ({
        studentId: studentIdOf(student),
        status: String(student.status).toUpperCase(),
      }));

      await saveSubjectAttendance(subjectId, attendanceDate, records);

      setNotice("Attendance saved successfully.");
      await reloadAttendance(attendanceDate);

      const datesResult = await getSubjectAttendanceDates(subjectId);
      setAttendanceDates(unwrapList(datesResult, "dates"));
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12 text-center text-slate-600">
        Loading Faculty dashboard...
      </main>
    );
  }

  const summary = dashboard?.summary ?? dashboard?.counts ?? {};

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            SnapClass · Faculty Portal
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Welcome{dashboard?.faculty?.fullName ? `, ${dashboard.faculty.fullName}` : user?.email ? `, ${user.email}` : ""}
          </h1>
          <p className="mt-2 text-slate-600">
            Manage your subjects, student rosters, and classroom attendance.
          </p>
        </div>

        <button
          type="button"
          onClick={loadPage}
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

      {notice && (
        <div role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
          {notice}
        </div>
      )}

      {/* Overview */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Overview</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric
            label="Assigned subjects"
            value={summary.totalSubjects ?? summary.subjectsTeaching ?? assignedSubjects.length}
          />
          <Metric
            label="Subjects available"
            value={discoverableSubjects.length}
          />
          <Metric
            label="Pending requests"
            value={summary.pendingRequests ?? pendingRequestsCount}
          />
        </div>
      </section>

      {/* Assigned subjects */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">My assigned subjects ({assignedSubjects.length})</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assignedSubjects.map((subject) => {
            const id = subject.subjectId ?? subject.id;
            return (
              <article key={id} className="flex flex-col justify-between rounded-lg border border-slate-200 p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                      {subject.subjectCode}
                    </p>
                    <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                      {subject.credits ?? 3} Credits
                    </span>
                  </div>
                  <h3 className="mt-2 font-semibold text-slate-900">
                    {subject.subjectName ?? subject.name}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {subject.description || "No description provided."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openSubject(subject)}
                  className="mt-4 w-full rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Manage attendance
                </button>
              </article>
            );
          })}

          {!assignedSubjects.length && (
            <p className="py-6 text-sm text-slate-500">
              No subjects have been assigned to you yet. You can request access below.
            </p>
          )}
        </div>
      </section>

      {/* My Requests */}
      {myRequests.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">My subject requests ({myRequests.length})</h2>
          <div className="mt-4 space-y-3">
            {myRequests.map((subject) => {
              const id = subject.subjectId ?? subject.id;
              const status = String(subject.requestStatus ?? "").toUpperCase();
              const isPending = status === "PENDING";
              const isApproved = status === "APPROVED";
              const isRejected = status === "REJECTED";

              return (
                <article
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {subject.subjectName ?? subject.name}
                      </p>
                      <span className="text-xs text-slate-500">
                        ({subject.subjectCode})
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {subject.credits ?? 3} Credits
                      </span>
                    </div>
                    {subject.requestedAt && (
                      <p className="mt-1 text-xs text-slate-400">
                        Requested: {displayDate(subject.requestedAt)}
                      </p>
                    )}
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isPending
                        ? "bg-amber-100 text-amber-800"
                        : isApproved
                        ? "bg-green-100 text-green-800"
                        : isRejected
                        ? "bg-red-100 text-red-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {isPending ? "Pending review" : isApproved ? "Approved" : "Rejected"}
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Browse subjects */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Browse subjects ({discoverableSubjects.length})</h2>
        <p className="mt-1 text-sm text-slate-600">
          Request access to teach a subject. Administrator approval is required.
        </p>

        <div className="mt-4 space-y-3">
          {discoverableSubjects.map((subject) => {
            const id = subject.subjectId ?? subject.id;
            const status = String(subject.requestStatus ?? subject.status ?? "").toUpperCase();
            const requested = subject.hasRequested || status === "PENDING";
            const rejected = status === "REJECTED";

            return (
              <article key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      {subject.subjectName ?? subject.name}
                    </p>
                    <span className="text-xs font-medium text-slate-500">
                      ({subject.subjectCode})
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {subject.credits ?? 3} Credits
                    </span>
                  </div>
                  {subject.description && (
                    <p className="mt-1 text-sm text-slate-600">
                      {subject.description}
                    </p>
                  )}
                </div>

                {requested ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    Request pending
                  </span>
                ) : rejected ? (
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                    Request rejected
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy === `request-${id}`}
                    onClick={() => handleRequestAccess(subject)}
                    className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {busy === `request-${id}` ? "Sending..." : "Request to teach"}
                  </button>
                )}
              </article>
            );
          })}

          {!discoverableSubjects.length && (
            <p className="py-4 text-sm text-slate-500">
              All available subjects are already assigned to you.
            </p>
          )}
        </div>
      </section>

      {/* Attendance session view */}
      {selectedSubject && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
                {selectedSubject.subjectCode} · {selectedSubject.credits ?? 3} Credits
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                Attendance · {selectedSubject.subjectName ?? selectedSubject.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSubject(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Close
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Attendance date
              </span>
              <input
                type="date"
                value={attendanceDate}
                onChange={(event) => handleDateChange(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Saved attendance dates</p>
              <div className="flex flex-wrap gap-2">
                {attendanceDates.slice(0, 8).map((item, index) => {
                  const date = typeof item === "string"
                    ? item
                    : item.attendanceDate ?? item.date;
                  return (
                    <button
                      key={`${date}-${index}`}
                      type="button"
                      onClick={() => handleDateChange(String(date).slice(0, 10))}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
                    >
                      {displayDate(date)}
                    </button>
                  );
                })}
                {!attendanceDates.length && (
                  <p className="text-xs text-slate-400">No past sessions saved.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">AI face recognition attendance</h3>
            <p className="mt-1 text-sm text-slate-600">
              Upload classroom photos to automatically suggest Present statuses for detected faces.
            </p>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                setPhotos(Array.from(event.target.files ?? []).slice(0, 4));
                setRecognitionResult(null);
                setRecognitionError("");
              }}
              className="mt-3 block w-full text-sm"
            />

            {photos.length > 0 && (
              <p className="mt-2 text-sm text-slate-600">
                {photos.length} photo(s) selected.
              </p>
            )}

            {recognitionError && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {recognitionError}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!photos.length || busy === "recognize"}
                onClick={handleRecognize}
                className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
              >
                {busy === "recognize" ? "Recognizing..." : "Recognize faces"}
              </button>

              {recognitionResult && (
                <button
                  type="button"
                  onClick={applyRecognition}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Apply suggestions
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-900">
              Enrolled students ({students.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => markAll("PRESENT")}
                className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50"
              >
                Mark all Present
              </button>
              <button
                type="button"
                onClick={() => markAll("ABSENT")}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Mark all Absent
              </button>
            </div>
          </div>

          {attendanceLoading ? (
            <p className="mt-4 text-sm text-slate-600">Loading student roster...</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="px-3 py-3 font-medium">Student</th>
                    <th className="px-3 py-3 font-medium">Student ID</th>
                    <th className="px-3 py-3 font-medium">Overall Attendance</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const id = studentIdOf(student);
                    return (
                      <tr key={id} className="border-b last:border-0">
                        <td className="px-3 py-3 font-medium text-slate-900">
                          {student.fullName ?? student.name ?? student.email ?? "Student"}
                        </td>
                        <td className="px-3 py-3 text-slate-500">{id}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {student.attendancePercentage !== undefined ? `${student.attendancePercentage}%` : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              student.status === "PRESENT"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {student.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => changeStatus(id, "PRESENT")}
                              className={`rounded px-3 py-1 text-xs font-medium ${
                                student.status === "PRESENT"
                                  ? "bg-green-600 text-white"
                                  : "bg-green-50 text-green-700 hover:bg-green-100"
                              }`}
                            >
                              Present
                            </button>
                            <button
                              type="button"
                              onClick={() => changeStatus(id, "ABSENT")}
                              className={`rounded px-3 py-1 text-xs font-medium ${
                                student.status === "ABSENT"
                                  ? "bg-red-600 text-white"
                                  : "bg-red-50 text-red-700 hover:bg-red-100"
                              }`}
                            >
                              Absent
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!students.length && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                        No enrolled students found for this subject.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={busy === "save" || attendanceLoading || !students.length}
              onClick={handleSaveAttendance}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy === "save" ? "Saving..." : "Save attendance"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
