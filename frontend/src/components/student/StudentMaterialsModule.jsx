import { useCallback, useEffect, useState } from "react";
import {
  downloadMaterial,
  getSubjectMaterials,
} from "../../services/student.service";

function unwrap(val, key) {
  if (Array.isArray(val)) return val;
  if (Array.isArray(val?.[key])) return val[key];
  return [];
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!n || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fileKind(mat) {
  const name = String(mat.originalFilename ?? mat.filename ?? "").toLowerCase();
  const type = String(mat.fileType ?? "").toLowerCase();
  if (name.endsWith(".pdf") || type.includes("pdf")) return { label: "PDF", tone: "bg-rose-50 text-rose-600" };
  if (name.endsWith(".docx") || type.includes("word")) return { label: "DOC", tone: "bg-sky-50 text-sky-600" };
  if (name.endsWith(".pptx") || type.includes("presentation")) return { label: "PPT", tone: "bg-amber-50 text-amber-600" };
  return { label: "FILE", tone: "bg-slate-100 text-slate-500" };
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

export default function StudentMaterialsModule({
  registeredSubjects = [],
  initialSubjectId = "",
  onNotify,
  onError,
}) {
  const [selectedSubjectId, setSelectedSubjectId] = useState(() => {
    if (initialSubjectId) return String(initialSubjectId);
    const first = registeredSubjects[0];
    return first ? String(first.id ?? first.subjectId) : "";
  });

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

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

  const loadMaterials = useCallback(
    async (subId) => {
      if (!subId) return;
      setLoading(true);
      try {
        const res = await getSubjectMaterials(subId);
        setMaterials(unwrap(res, "materials"));
      } catch (err) {
        onError?.(
          err?.response?.data?.message || err?.message || "Could not load subject materials."
        );
      } finally {
        setLoading(false);
      }
    },
    [onError]
  );

  useEffect(() => {
    if (selectedSubjectId) {
      loadMaterials(selectedSubjectId);
    }
  }, [selectedSubjectId, loadMaterials]);

  async function handleDownloadClick(mat) {
    const matId = mat.materialId ?? mat.id;
    if (!matId) return;
    setDownloadingId(matId);
    try {
      await downloadMaterial(
        matId,
        mat.originalFilename ?? mat.filename ?? `${mat.title || "document"}.pdf`
      );
      onNotify?.(`Downloading "${mat.title || mat.originalFilename}"...`);
    } catch (err) {
      onError?.(err?.response?.data?.message || err?.message || "Failed to download material.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (registeredSubjects.length === 0) {
    return (
      <Card className="py-12 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 3h7l5 5v13H7zM14 3v5h5" />
          </svg>
        </span>
        <p className="sc-display mt-4 text-lg font-bold text-slate-800">No courses yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Enroll in courses first and your teachers' notes and slides will appear here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="sc-display text-xl font-bold text-slate-800">
              Study materials <span className="text-slate-400">({materials.length})</span>
            </h2>
            <p className="mt-1 text-sm text-slate-500">Notes and slides shared by your teachers.</p>
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
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 animate-pulse rounded-3xl bg-white/80 shadow-sm" />
          ))}
        </div>
      ) : materials.length === 0 ? (
        <Card className="py-14 text-center text-sm text-slate-400">
          Nothing has been uploaded for this course yet.
        </Card>
      ) : (
        <div className="sc-stagger grid gap-4 md:grid-cols-2">
          {materials.map((mat) => {
            const matId = mat.materialId ?? mat.id;
            const kind = fileKind(mat);
            return (
              <article
                key={matId}
                className="flex flex-col justify-between rounded-3xl border border-white bg-white/90 p-5 shadow-lg shadow-slate-200/60 transition duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex items-start gap-3.5">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${kind.tone}`}>
                    {kind.label}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-800">
                      {mat.title ?? mat.originalFilename ?? "Lecture material"}
                    </h3>
                    {mat.description && <p className="mt-1 text-sm text-slate-500">{mat.description}</p>}
                    <p className="mt-1.5 truncate text-xs text-slate-400">
                      {mat.originalFilename ?? mat.filename ?? "document"} · {formatBytes(mat.fileSize)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-400">
                    {mat.createdAt
                      ? new Date(mat.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "Available"}
                  </span>

                  <button
                    type="button"
                    disabled={downloadingId === matId}
                    onClick={() => handleDownloadClick(mat)}
                    className="cursor-pointer rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-200/70 transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {downloadingId === matId ? "Getting file..." : "Download"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}