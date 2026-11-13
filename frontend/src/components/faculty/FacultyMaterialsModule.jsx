// FacultyMaterialsModule.jsx
import { useCallback, useEffect, useState } from "react";
import {
  completeMaterialUpload,
  getMaterialDownloadUrl,
  getSubjectMaterials,
  requestMaterialUploadUrl,
  uploadFileToPresignedUrl,
} from "../../services/faculty.service";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".pptx"];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function formatFileSize(bytes) {
  const num = Number(bytes);
  if (!num || Number.isNaN(num)) return "—";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

function unwrap(val, key) {
  if (Array.isArray(val)) return val;
  if (Array.isArray(val?.[key])) return val[key];
  return [];
}

function fileKind(mat) {
  const name = String(mat.originalFilename ?? mat.filename ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return { label: "PDF", tone: "bg-rose-50 text-rose-600" };
  if (name.endsWith(".docx")) return { label: "DOC", tone: "bg-sky-50 text-sky-600" };
  if (name.endsWith(".pptx")) return { label: "PPT", tone: "bg-amber-50 text-amber-600" };
  return { label: "FILE", tone: "bg-slate-100 text-slate-500" };
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

function IndexBadge({ status, error }) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold";
  if (status === "PROCESSING") {
    return (
      <span className={`${base} animate-pulse bg-sky-50 text-sky-600`}>
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
        Processing...
      </span>
    );
  }
  if (status === "QUEUED") {
    return (
      <span className={`${base} bg-amber-50 text-amber-600`}>
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        In queue
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span title={error || "Ingestion failed"} className={`${base} cursor-help bg-rose-50 text-rose-600`}>
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Processing failed
      </span>
    );
  }
  return null;
}

export default function FacultyMaterialsModule({
  assignedSubjects = [],
  initialSubject = null,
  onNotify,
  onError,
}) {
  const [selectedSubjectId, setSelectedSubjectId] = useState(() => {
    const first = initialSubject ?? assignedSubjects[0];
    return first ? String(first.subjectId ?? first.id) : "";
  });

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);

  // Upload Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStep, setUploadStep] = useState(""); // "" | "presigning" | "uploading" | "completing"
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadingId, setDownloadingId] = useState(null);

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

  const loadMaterials = useCallback(
    async (subId) => {
      if (!subId) return;
      setLoading(true);
      try {
        const data = await getSubjectMaterials(subId);
        setMaterials(unwrap(data, "materials"));
      } catch (err) {
        onError?.(
          err?.response?.data?.message || err?.message || "Failed to fetch study materials."
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

  // Live polling while any file is QUEUED or PROCESSING
  useEffect(() => {
    const hasPending = materials.some((m) => {
      const st = String(m.ingestionStatus).toUpperCase();
      return st === "QUEUED" || st === "PROCESSING";
    });

    if (!hasPending || !selectedSubjectId) return;

    const interval = setInterval(() => {
      loadMaterials(selectedSubjectId);
    }, 4000);

    return () => clearInterval(interval);
  }, [materials, selectedSubjectId, loadMaterials]);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const lower = file.name.toLowerCase();
    const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
    if (!hasAllowedExt) {
      onError?.(
        "Unsupported file type. Only PDF (.pdf), Word (.docx), and PowerPoint (.pptx) documents are supported for AI RAG indexing."
      );
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      onError?.("File size exceeds the 25 MB limit. Please select a smaller document.");
      return;
    }

    if (file.size === 0) {
      onError?.("Selected document is empty.");
      return;
    }

    setSelectedFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
  }

  async function handleUploadSubmit(e) {
    e.preventDefault();
    if (!selectedSubjectId) return;
    if (!title.trim()) {
      onError?.("Please enter a material title.");
      return;
    }
    if (!selectedFile) {
      onError?.("Please select a document or slide deck to upload.");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      onError?.("File size exceeds the 25 MB limit. Please select a smaller document.");
      return;
    }

    try {
      const ext = "." + selectedFile.name.split(".").pop().toLowerCase();
      const resolvedMime = MIME_BY_EXT[ext] || selectedFile.type || "application/pdf";

      // STEP 1: Request S3 Presigned Upload URL
      setUploadStep("presigning");
      setUploadProgress(10);

      const presignData = await requestMaterialUploadUrl(selectedSubjectId, {
        title,
        description,
        originalFilename: selectedFile.name,
        fileType: resolvedMime,
        fileSize: selectedFile.size,
      });

      const { materialId, uploadUrl, requiredHeaders } = presignData;
      if (!materialId || !uploadUrl) {
        throw new Error("Server did not return a valid presigned S3 upload URL.");
      }

      // STEP 2: PUT binary file directly to S3
      setUploadStep("uploading");
      await uploadFileToPresignedUrl(uploadUrl, selectedFile, requiredHeaders, (pct) =>
        setUploadProgress(pct)
      );

      // STEP 3: Confirm Upload & Queue Indexing
      setUploadStep("completing");
      const completeRes = await completeMaterialUpload(materialId);

      onNotify?.(completeRes?.message || "Material uploaded successfully!");

      setTitle("");
      setDescription("");
      setSelectedFile(null);
      setUploadStep("");
      setUploadProgress(0);
      await loadMaterials(selectedSubjectId);
    } catch (err) {
      setUploadStep("");
      setUploadProgress(0);
      onError?.(err?.response?.data?.message || err?.message || "Material upload pipeline failed.");
    }
  }

  async function handleDownload(material) {
    const matId = material.materialId ?? material.id;
    if (!matId) return;

    setDownloadingId(matId);
    try {
      const data = await getMaterialDownloadUrl(matId);
      if (data?.downloadUrl) {
        window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
      } else {
        onError?.("Download URL was not returned by the server.");
      }
    } catch (err) {
      onError?.(err?.response?.data?.message || err?.message || "Could not generate download link.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (assignedSubjects.length === 0) {
    return (
      <Card className="py-12 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 3h7l5 5v13H7zM14 3v5h5" />
          </svg>
        </span>
        <p className="sc-display mt-4 text-lg font-bold text-slate-800">No subjects to upload materials for yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Once the admin approves a subject for you, you can upload PDFs, slides and notes here. They
          are prepared for AI so you can build quizzes from them.
        </p>
      </Card>
    );
  }

  const stepIndex = { presigning: 1, uploading: 2, completing: 3 }[uploadStep] ?? 0;
  const stepLabels = ["Getting ready", "Uploading", "Finalizing"];

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* ============ Upload ============ */}
      <Card className="lg:col-span-5">
        <h2 className="sc-display text-xl font-bold text-slate-800">Upload study material</h2>
        <p className="mt-1 text-sm text-slate-500">
          Files are stored safely and then prepared in the background, so you can generate quizzes
          from them.
        </p>

        <form onSubmit={handleUploadSubmit} className="sc-stagger mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Subject</span>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className={`${inputCls} cursor-pointer font-semibold`}
            >
              {assignedSubjects.map((s) => {
                const id = s.subjectId ?? s.id;
                return (
                  <option key={id} value={id}>
                    {s.subjectCode} — {s.subjectName ?? s.name}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Title</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Unit 1: Normalization and Relational Algebra"
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              Notes <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key chapters or instructions for students..."
              className={inputCls}
            />
          </label>

          {/* File drop zone */}
          <label
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition duration-300 ${
              selectedFile
                ? "border-emerald-300 bg-emerald-50/60"
                : "border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 hover:bg-emerald-50/60"
            }`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-500 shadow-sm">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={selectedFile ? "M5 13l4 4L19 7" : "M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"} />
              </svg>
            </span>
            <p className="mt-3 max-w-full truncate text-sm font-semibold text-slate-700">
              {selectedFile ? selectedFile.name : "Click to choose a file"}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {selectedFile
                ? `${formatFileSize(selectedFile.size)} · click to change`
                : "PDF, Word (DOCX) or slides (PPTX), up to 25 MB"}
            </p>
            <input type="file" accept=".pdf,.docx,.pptx" onChange={handleFileChange} className="hidden" />
          </label>

          {/* Progress */}
          {uploadStep && (
            <div className="sc-enter rounded-2xl bg-slate-50 p-4">
              <div className="grid grid-cols-3 gap-2">
                {stepLabels.map((label, i) => {
                  const n = i + 1;
                  const done = stepIndex > n;
                  const active = stepIndex === n;
                  return (
                    <div key={label} className="text-center">
                      <span
                        className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                          done
                            ? "bg-emerald-500 text-white"
                            : active
                            ? "bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50"
                            : "bg-slate-200 text-slate-400"
                        }`}
                      >
                        {done ? "✓" : n}
                      </span>
                      <p className={`mt-1.5 text-[11px] font-medium ${active || done ? "text-slate-700" : "text-slate-400"}`}>
                        {label}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="mt-2 text-right text-xs font-semibold text-slate-500">{uploadProgress}%</p>
            </div>
          )}

          <button type="submit" disabled={Boolean(uploadStep) || !selectedFile} className={`${primaryBtn} w-full py-3`}>
            {uploadStep ? "Uploading..." : "Upload material"}
          </button>
        </form>
      </Card>

      {/* ============ Materials list ============ */}
      <Card className="lg:col-span-7" delay={80}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="sc-display text-xl font-bold text-slate-800">
              Course materials <span className="text-slate-400">({materials.length})</span>
            </h2>
            <p className="text-sm text-slate-500">
              View, download, or manage lecture notes and slide decks for this course.
            </p>
          </div>

          <button type="button" onClick={() => loadMaterials(selectedSubjectId)} className={ghostBtn}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : materials.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 py-14 text-center text-sm text-slate-400">
            No study materials uploaded for this subject yet.
          </div>
        ) : (
          <div className="sc-stagger mt-5 space-y-3">
            {materials.map((mat) => {
              const matId = mat.materialId ?? mat.id;
              const ingestion = String(mat.ingestionStatus ?? mat.ragStatus ?? "QUEUED").toUpperCase();
              const kind = fileKind(mat);

              return (
                <article
                  key={matId}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3.5">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold ${kind.tone}`}>
                      {kind.label}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-800">
                          {mat.title ?? mat.originalFilename ?? "Course document"}
                        </h3>
                        <IndexBadge status={ingestion} error={mat.ingestionError} />
                      </div>

                      {mat.description && <p className="mt-1 text-sm text-slate-500">{mat.description}</p>}

                      <p className="mt-1 text-xs text-slate-400">
                        #{matId} · {mat.originalFilename ?? mat.filename ?? "file"} ·{" "}
                        {formatFileSize(mat.fileSize)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={downloadingId === matId}
                    onClick={() => handleDownload(mat)}
                    className="cursor-pointer rounded-xl bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100 active:scale-95 disabled:opacity-50"
                  >
                    {downloadingId === matId ? "Opening..." : "Download"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}