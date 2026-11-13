// FacultyQuizzesModule.jsx
import { useCallback, useEffect, useState } from "react";
import {
  closeFacultyQuiz,
  generateAiQuizQuestions,
  getFacultyQuizDetails,
  getFacultyQuizResults,
  getFacultyQuizzes,
  getSubjectMaterials,
  publishFacultyQuiz,
  saveQuizDraft,
  updateQuizDraft,
} from "../../services/faculty.service";

function unwrap(val, key) {
  if (Array.isArray(val)) return val;
  if (Array.isArray(val?.[key])) return val[key];
  return [];
}

function createBlankQuestion(type = "MCQ") {
  if (type === "TRUE_FALSE") {
    return {
      questionId: null,
      question: "",
      questionType: "TRUE_FALSE",
      difficulty: "MEDIUM",
      marks: 1,
      explanation: "",
      sourceDocumentId: null,
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
      ],
    };
  }
  return {
    questionId: null,
    question: "",
    questionType: "MCQ",
    difficulty: "MEDIUM",
    marks: 1,
    explanation: "",
    sourceDocumentId: null,
    options: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  };
}

function normalizeAiQuestion(q) {
  const rawType = String(q.questionType ?? q.type ?? "MCQ").toUpperCase();
  const questionType = rawType === "TRUE_FALSE" || rawType === "BOOLEAN" ? "TRUE_FALSE" : "MCQ";

  let rawOptions = Array.isArray(q.options) ? q.options : [];
  if (rawOptions.length === 0 && questionType === "TRUE_FALSE") {
    rawOptions = [
      { text: "True", isCorrect: true },
      { text: "False", isCorrect: false },
    ];
  }

  const normalizedOptions = rawOptions.map((opt, idx) => {
    if (typeof opt === "string") {
      const isCorrect =
        q.correctAnswer === opt ||
        q.correct_answer === opt ||
        q.answer === opt ||
        q.correctOptionIndex === idx;
      return { text: opt, isCorrect: Boolean(isCorrect) };
    }
    return {
      text: opt.text ?? opt.optionText ?? opt.label ?? "",
      isCorrect: Boolean(
        opt.isCorrect ??
        opt.correct ??
        (q.correct_answer && opt.text === q.correct_answer) ??
        (q.correctAnswer && opt.text === q.correctAnswer)
      ),
    };
  });

  // Guarantee exactly 1 option has isCorrect: true
  const hasCorrect = normalizedOptions.some((o) => o.isCorrect);
  if (!hasCorrect && normalizedOptions.length > 0) {
    normalizedOptions[0].isCorrect = true;
  } else if (hasCorrect) {
    let foundFirst = false;
    for (const o of normalizedOptions) {
      if (o.isCorrect) {
        if (!foundFirst) foundFirst = true;
        else o.isCorrect = false;
      }
    }
  }

  return {
    questionId: q.questionId ?? q.id ?? null,
    question: q.question ?? q.questionText ?? q.prompt ?? "",
    questionType,
    difficulty: String(q.difficulty ?? "MEDIUM").toUpperCase(),
    marks: Number(q.marks ?? 1) || 1,
    explanation: q.explanation ?? "",
    sourceDocumentId: q.sourceDocumentId ?? q.source_document ?? null,
    sourceLocation: q.sourceLocation ?? q.source_location ?? null,
    options:
      normalizedOptions.length >= 2
        ? normalizedOptions
        : [
            { text: "Option A", isCorrect: true },
            { text: "Option B", isCorrect: false },
          ],
  };
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition duration-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400";

const smallSelect =
  "cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100";

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

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ status }) {
  const map = {
    PUBLISHED: "bg-emerald-50 text-emerald-600",
    CLOSED: "bg-rose-50 text-rose-600",
    DRAFT: "bg-amber-50 text-amber-600",
  };
  const dot = {
    PUBLISHED: "bg-emerald-500",
    CLOSED: "bg-rose-500",
    DRAFT: "bg-amber-500",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold capitalize ${map[status] ?? map.DRAFT}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] ?? dot.DRAFT}`} />
      {status.toLowerCase()}
    </span>
  );
}

export default function FacultyQuizzesModule({ assignedSubjects = [], onNotify, onError }) {
  // subView: "list" | "builder"
  const [subView, setSubView] = useState("list");

  // Quiz List Filters & State
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterSubjectId, setFilterSubjectId] = useState("ALL");
  const [quizzes, setQuizzes] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  // Builder State (Create or Edit Draft)
  const [editingQuizId, setEditingQuizId] = useState(null);
  const [builderSubjectId, setBuilderSubjectId] = useState(() => {
    const first = assignedSubjects[0];
    return first ? String(first.subjectId ?? first.id) : "";
  });
  const [quizTitle, setQuizTitle] = useState("");
  const [quizDescription, setQuizDescription] = useState("");
  const [quizDifficulty, setQuizDifficulty] = useState("MEDIUM");
  const [questions, setQuestions] = useState([createBlankQuestion("MCQ")]);

  // AI Generator Panel State
  const [subjectMaterials, setSubjectMaterials] = useState([]);
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [aiQuestionCount, setAiQuestionCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState("mixed");
  const [busyAction, setBusyAction] = useState("");

  // Publish Modal State
  const [publishModalQuiz, setPublishModalQuiz] = useState(null);
  const [publishForm, setPublishForm] = useState({
    startAt: "",
    deadlineAt: "",
    durationMinutes: 30,
    maxAttempts: 1,
  });

  // Results Modal State
  const [resultsModal, setResultsModal] = useState({
    open: false,
    loading: false,
    data: null,
  });

  const loadQuizzes = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await getFacultyQuizzes({
        status: filterStatus,
        subjectId: filterSubjectId,
      });
      setQuizzes(unwrap(data, "quizzes"));
    } catch (err) {
      onError?.(err?.response?.data?.message || err?.message || "Failed to load quizzes.");
    } finally {
      setLoadingList(false);
    }
  }, [filterStatus, filterSubjectId, onError]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  // Load subject materials in the builder so faculty can pick documents for AI generation
  useEffect(() => {
    if (subView !== "builder" || !builderSubjectId) return;
    let active = true;
    getSubjectMaterials(builderSubjectId)
      .then((res) => {
        if (!active) return;
        setSubjectMaterials(unwrap(res, "materials"));
      })
      .catch(() => {
        if (active) setSubjectMaterials([]);
      });
    return () => {
      active = false;
    };
  }, [subView, builderSubjectId]);

  function openNewQuizBuilder() {
    const defaultSub =
      filterSubjectId !== "ALL"
        ? filterSubjectId
        : assignedSubjects[0]
        ? String(assignedSubjects[0].subjectId ?? assignedSubjects[0].id)
        : "";
    setEditingQuizId(null);
    setBuilderSubjectId(defaultSub);
    setQuizTitle("");
    setQuizDescription("");
    setQuizDifficulty("MEDIUM");
    setSelectedDocIds([]);
    setQuestions([createBlankQuestion("MCQ")]);
    setSubView("builder");
  }

  async function openEditDraftBuilder(quiz) {
    const qId = quiz.quizId ?? quiz.id;
    setBusyAction(`load-${qId}`);
    try {
      const data = await getFacultyQuizDetails(qId);
      const qMeta = data?.quiz ?? quiz;
      const rawQuestions = unwrap(data, "questions");

      setEditingQuizId(qId);
      setBuilderSubjectId(String(qMeta.subjectId ?? quiz.subjectId));
      setQuizTitle(qMeta.title ?? "");
      setQuizDescription(qMeta.description ?? "");
      setQuizDifficulty(String(qMeta.difficulty ?? "MEDIUM").toUpperCase());
      setQuestions(
        rawQuestions.length > 0
          ? rawQuestions.map(normalizeAiQuestion)
          : [createBlankQuestion("MCQ")]
      );
      setSubView("builder");
    } catch (err) {
      onError?.(err?.response?.data?.message || err?.message || "Could not load quiz details.");
    } finally {
      setBusyAction("");
    }
  }

  function toggleDocSelection(docId) {
    const numId = Number(docId);
    setSelectedDocIds((prev) =>
      prev.includes(numId) ? prev.filter((id) => id !== numId) : [...prev, numId].slice(0, 20)
    );
  }

  async function handleGenerateWithAi() {
    if (!builderSubjectId) {
      onError?.("Select a subject first.");
      return;
    }
    if (selectedDocIds.length === 0) {
      onError?.("Select at least 1 study material document above to generate AI questions.");
      return;
    }

    setBusyAction("ai-generate");
    try {
      const aiData = await generateAiQuizQuestions(builderSubjectId, {
        documentIds: selectedDocIds,
        numberOfQuestions: aiQuestionCount,
        difficulty: aiDifficulty,
      });

      const generatedList =
        aiData?.questions ?? aiData?.quiz?.questions ?? unwrap(aiData, "questions");

      if (!Array.isArray(generatedList) || generatedList.length === 0) {
        onError?.(
          "AI service returned no questions. Ensure the selected material has finished RAG indexing."
        );
        return;
      }

      const mapped = generatedList.map(normalizeAiQuestion);
      setQuestions(mapped);
      if (!quizTitle.trim() && aiData?.title) {
        setQuizTitle(aiData.title);
      }
      onNotify?.(
        `AI generated ${mapped.length} question(s)! Review and customize them below before saving your draft.`
      );
    } catch (err) {
      onError?.(err?.response?.data?.message || err?.message || "AI Quiz Generation failed.");
    } finally {
      setBusyAction("");
    }
  }

  // Question Builder Mutators
  function updateQuestionField(qIdx, field, value) {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIdx) return q;
        if (field === "questionType") {
          const nextOpts =
            value === "TRUE_FALSE"
              ? [
                  { text: "True", isCorrect: true },
                  { text: "False", isCorrect: false },
                ]
              : [
                  { text: "", isCorrect: true },
                  { text: "", isCorrect: false },
                  { text: "", isCorrect: false },
                  { text: "", isCorrect: false },
                ];
          return { ...q, questionType: value, options: nextOpts };
        }
        return { ...q, [field]: value };
      })
    );
  }

  function updateOptionText(qIdx, optIdx, text) {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIdx) return q;
        const nextOpts = q.options.map((o, i) => (i === optIdx ? { ...o, text } : o));
        return { ...q, options: nextOpts };
      })
    );
  }

  function selectCorrectOption(qIdx, optIdx) {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIdx) return q;
        const nextOpts = q.options.map((o, i) => ({ ...o, isCorrect: i === optIdx }));
        return { ...q, options: nextOpts };
      })
    );
  }

  function addOptionToQuestion(qIdx) {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIdx || q.questionType === "TRUE_FALSE") return q;
        if (q.options.length >= 6) return q;
        return { ...q, options: [...q.options, { text: "", isCorrect: false }] };
      })
    );
  }

  function removeOptionFromQuestion(qIdx, optIdx) {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIdx || q.options.length <= 2) return q;
        const filtered = q.options.filter((_, i) => i !== optIdx);
        if (!filtered.some((o) => o.isCorrect)) {
          filtered[0].isCorrect = true;
        }
        return { ...q, options: filtered };
      })
    );
  }

  async function handleSaveDraftSubmit(e) {
    e.preventDefault();
    if (!builderSubjectId) {
      onError?.("Please select a subject for this quiz.");
      return;
    }
    if (!quizTitle.trim()) {
      onError?.("Quiz title is required.");
      return;
    }
    if (questions.length === 0) {
      onError?.("Add at least 1 question to save the quiz.");
      return;
    }

    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      if (!q.question.trim()) {
        onError?.(`Question #${i + 1} is missing its question prompt.`);
        return;
      }
      if (q.options.some((o) => !String(o.text).trim())) {
        onError?.(`Question #${i + 1} has an empty answer option.`);
        return;
      }
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) {
        onError?.(`Question #${i + 1} must have exactly 1 correct option marked.`);
        return;
      }
    }

    const payload = {
      title: quizTitle.trim(),
      description: quizDescription.trim() || null,
      difficulty: quizDifficulty,
      questions: questions.map((q) => ({
        ...(q.questionId ? { questionId: q.questionId } : {}),
        question: q.question.trim(),
        questionType: q.questionType,
        difficulty: q.difficulty || "MEDIUM",
        marks: Number(q.marks) || 1,
        explanation: q.explanation?.trim() || null,
        sourceDocumentId: q.sourceDocumentId ? Number(q.sourceDocumentId) : null,
        options: q.options.map((o) => ({
          text: String(o.text).trim(),
          isCorrect: Boolean(o.isCorrect),
        })),
      })),
    };

    setBusyAction("save-draft");
    try {
      if (editingQuizId) {
        const res = await updateQuizDraft(editingQuizId, payload);
        onNotify?.(res?.message || "Quiz draft updated successfully!");
      } else {
        const res = await saveQuizDraft(builderSubjectId, payload);
        onNotify?.(res?.message || "Quiz saved as DRAFT!");
      }
      setSubView("list");
      await loadQuizzes();
    } catch (err) {
      onError?.(err?.response?.data?.message || err?.message || "Failed to save quiz draft.");
    } finally {
      setBusyAction("");
    }
  }

  async function handlePublishSubmit(e) {
    e.preventDefault();
    if (!publishModalQuiz) return;

    const startDate = new Date(publishForm.startAt);
    const deadlineDate = new Date(publishForm.deadlineAt);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(deadlineDate.getTime())) {
      onError?.("Please select valid start and deadline dates.");
      return;
    }
    if (startDate.getTime() <= Date.now()) {
      onError?.("Quiz start time must be in the future.");
      return;
    }
    if (deadlineDate <= startDate) {
      onError?.("Deadline must be strictly after the start time.");
      return;
    }

    const qId = publishModalQuiz.quizId ?? publishModalQuiz.id;
    setBusyAction(`publish-${qId}`);

    try {
      const res = await publishFacultyQuiz(qId, {
        startAt: startDate.toISOString(),
        deadlineAt: deadlineDate.toISOString(),
        durationMinutes: Number(publishForm.durationMinutes),
        maxAttempts: Number(publishForm.maxAttempts),
      });

      onNotify?.(res?.message || "Quiz published to students!");
      setPublishModalQuiz(null);
      await loadQuizzes();
    } catch (err) {
      onError?.(err?.response?.data?.message || err?.message || "Failed to publish quiz.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleCloseQuiz(quiz) {
    const qId = quiz.quizId ?? quiz.id;
    setBusyAction(`close-${qId}`);
    try {
      const res = await closeFacultyQuiz(qId);
      onNotify?.(res?.message || "Quiz closed successfully.");
      await loadQuizzes();
    } catch (err) {
      onError?.(err?.response?.data?.message || err?.message || "Failed to close quiz.");
    } finally {
      setBusyAction("");
    }
  }

  async function openResultsAnalytics(quiz) {
    const qId = quiz.quizId ?? quiz.id;
    setResultsModal({ open: true, loading: true, data: null });
    try {
      const data = await getFacultyQuizResults(qId);
      setResultsModal({ open: true, loading: false, data });
    } catch (err) {
      setResultsModal({ open: false, loading: false, data: null });
      onError?.(err?.response?.data?.message || err?.message || "Could not load quiz results.");
    }
  }

  function closeResults() {
    setResultsModal({ open: false, loading: false, data: null });
  }

  // ==========================================
  // VIEW A: QUIZ BUILDER & AI GENERATOR
  // ==========================================
  if (subView === "builder") {
    return (
      <div className="space-y-6">
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-600">
              {editingQuizId ? `Editing draft #${editingQuizId}` : "New quiz"}
            </p>
            <h2 className="sc-display mt-1 text-2xl font-bold text-slate-800">
              {quizTitle || "Untitled quiz"}
            </h2>
          </div>

          <button type="button" onClick={() => setSubView("list")} className={ghostBtn}>
            ← Back to quizzes
          </button>
        </Card>

        {/* AI generator */}
        <Card delay={60} className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-emerald-100/70 blur-3xl" />

          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-600">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
                </svg>
                Optional · AI helper
              </span>
              <h3 className="sc-display mt-2 text-lg font-bold text-slate-800">
                Create questions from your study materials
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Pick up to 20 materials, choose how many questions you want, and the AI will write
                multiple-choice and true/false questions with explanations.
              </p>
            </div>

            <button
              type="button"
              disabled={busyAction === "ai-generate" || selectedDocIds.length === 0}
              onClick={handleGenerateWithAi}
              className={primaryBtn}
            >
              {busyAction === "ai-generate"
                ? "Writing questions..."
                : `Generate ${aiQuestionCount} questions`}
            </button>
          </div>

          <div className="relative mt-5 grid gap-4 md:grid-cols-3">
            <Field label="Subject">
              <select
                value={builderSubjectId}
                disabled={Boolean(editingQuizId)}
                onChange={(e) => {
                  setBuilderSubjectId(e.target.value);
                  setSelectedDocIds([]);
                }}
                className={`${inputCls} cursor-pointer`}
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
            </Field>

            <Field label="Number of questions (1 to 20)">
              <input
                type="number"
                min={1}
                max={20}
                value={aiQuestionCount}
                onChange={(e) => setAiQuestionCount(e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Difficulty">
              <select
                value={aiDifficulty}
                onChange={(e) => setAiDifficulty(e.target.value)}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="mixed">Mixed</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </Field>
          </div>

          <div className="relative mt-5">
            <p className="mb-2 text-xs font-semibold text-slate-600">
              Study materials{" "}
              <span className="font-normal text-slate-400">({selectedDocIds.length} selected)</span>
            </p>
            {subjectMaterials.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-400">
                No materials uploaded for this subject yet. Add a PDF, DOCX or PPTX in the Materials
                tab to use the AI helper.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {subjectMaterials.map((doc) => {
                  const docId = Number(doc.materialId ?? doc.id);
                  const active = selectedDocIds.includes(docId);
                  const isReady = String(doc.ingestionStatus).toUpperCase() === "COMPLETED";

                  return (
                    <button
                      key={docId}
                      type="button"
                      disabled={!isReady}
                      onClick={() => {
                        if (!isReady) {
                          onError?.(
                            `Material #${docId} is still being processed. Please wait until processing finishes.`
                          );
                          return;
                        }
                        toggleDocSelection(docId);
                      }}
                      title={
                        isReady
                          ? "Click to select or unselect"
                          : `Still being prepared (${doc.ingestionStatus || "PENDING"})`
                      }
                      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-300 ${
                        !isReady
                          ? "cursor-not-allowed bg-slate-50 text-slate-300"
                          : active
                          ? "cursor-pointer bg-emerald-500 text-white shadow-md shadow-emerald-200"
                          : "cursor-pointer bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600"
                      }`}
                    >
                      {active ? "✓ " : ""}
                      {doc.title ?? doc.originalFilename}
                      {!isReady && ` (${String(doc.ingestionStatus || "preparing").toLowerCase()})`}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Quiz details + questions */}
        <form onSubmit={handleSaveDraftSubmit} className="space-y-6">
          <Card delay={120}>
            <h3 className="sc-display text-lg font-bold text-slate-800">Quiz details</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Field label="Title" className="md:col-span-2">
                <input
                  required
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  placeholder="e.g. Midterm: Normalization and Indexing"
                  className={inputCls}
                />
              </Field>

              <Field label="Overall difficulty">
                <select
                  value={quizDifficulty}
                  onChange={(e) => setQuizDifficulty(e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                  <option value="MIXED">Mixed</option>
                </select>
              </Field>

              <Field label="Instructions (optional)" className="md:col-span-3">
                <textarea
                  rows={2}
                  value={quizDescription}
                  onChange={(e) => setQuizDescription(e.target.value)}
                  placeholder="Shown to students before they start..."
                  className={inputCls}
                />
              </Field>
            </div>
          </Card>

          <div className="space-y-4">
            {questions.map((q, qIdx) => (
              <article
                key={qIdx}
                className="sc-enter rounded-3xl border border-white bg-white/90 p-6 shadow-lg shadow-slate-200/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-600">
                      {qIdx + 1}
                    </span>
                    <select
                      value={q.questionType}
                      onChange={(e) => updateQuestionField(qIdx, "questionType", e.target.value)}
                      className={smallSelect}
                    >
                      <option value="MCQ">Multiple choice</option>
                      <option value="TRUE_FALSE">True / False</option>
                    </select>

                    <select
                      value={q.difficulty}
                      onChange={(e) => updateQuestionField(qIdx, "difficulty", e.target.value)}
                      className={smallSelect}
                    >
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400">Marks</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={q.marks}
                        onChange={(e) => updateQuestionField(qIdx, "marks", e.target.value)}
                        className="w-16 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-center text-xs font-bold text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                      />
                    </div>
                  </div>

                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setQuestions((prev) => prev.filter((_, idx) => idx !== qIdx))}
                      className="cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold text-rose-500 transition hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <Field label="Question" className="mt-4">
                  <textarea
                    rows={2}
                    required
                    value={q.question}
                    onChange={(e) => updateQuestionField(qIdx, "question", e.target.value)}
                    placeholder="Type your question here..."
                    className={inputCls}
                  />
                </Field>

                <div className="mt-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">
                      Answers{" "}
                      <span className="font-normal text-slate-400">
                        (tap the circle to mark the correct one)
                      </span>
                    </span>
                    {q.questionType === "MCQ" && q.options.length < 6 && (
                      <button
                        type="button"
                        onClick={() => addOptionToQuestion(qIdx)}
                        className="cursor-pointer text-xs font-semibold text-emerald-600 transition hover:text-emerald-700"
                      >
                        + Add option
                      </button>
                    )}
                  </div>

                  {q.options.map((opt, optIdx) => (
                    <div
                      key={optIdx}
                      className={`flex items-center gap-3 rounded-2xl border p-2.5 transition-all duration-300 ${
                        opt.isCorrect
                          ? "border-emerald-300 bg-emerald-50/70"
                          : "border-slate-100 bg-slate-50/60 hover:bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectCorrectOption(qIdx, optIdx)}
                        aria-label={opt.isCorrect ? "Correct answer" : "Mark as correct answer"}
                        aria-pressed={opt.isCorrect}
                        className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-all duration-300 active:scale-90 ${
                          opt.isCorrect
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-slate-300 bg-white text-transparent hover:border-emerald-400"
                        }`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      </button>

                      <input
                        required
                        value={opt.text}
                        readOnly={q.questionType === "TRUE_FALSE"}
                        onChange={(e) => updateOptionText(qIdx, optIdx, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                        className="flex-1 bg-transparent px-1 py-1 text-sm text-slate-800 placeholder-slate-400 outline-none"
                      />

                      {opt.isCorrect && (
                        <span className="hidden rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 sm:inline">
                          Correct
                        </span>
                      )}

                      {q.questionType === "MCQ" && q.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeOptionFromQuestion(qIdx, optIdx)}
                          aria-label="Remove option"
                          className="cursor-pointer px-2 text-sm text-slate-300 transition hover:text-rose-500"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <Field label="Explanation (shown after the quiz)" className="mt-4">
                  <input
                    value={q.explanation || ""}
                    onChange={(e) => updateQuestionField(qIdx, "explanation", e.target.value)}
                    placeholder="Optional: why is the correct answer right?"
                    className={inputCls}
                  />
                </Field>
              </article>
            ))}
          </div>

          {/* Footer */}
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white bg-white/90 p-4 shadow-xl shadow-slate-300/50 backdrop-blur">
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setQuestions((prev) => [...prev, createBlankQuestion("MCQ")])}
                className="cursor-pointer rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-100 active:scale-95"
              >
                + Multiple choice
              </button>
              <button
                type="button"
                onClick={() => setQuestions((prev) => [...prev, createBlankQuestion("TRUE_FALSE")])}
                className="cursor-pointer rounded-xl bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-600 transition hover:bg-teal-100 active:scale-95"
              >
                + True / False
              </button>
            </div>

            <button type="submit" disabled={busyAction === "save-draft"} className={`${primaryBtn} px-6 py-3`}>
              {busyAction === "save-draft"
                ? "Saving..."
                : editingQuizId
                ? "Update draft"
                : "Save as draft"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ==========================================
  // VIEW B: ALL QUIZZES
  // ==========================================
  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="sc-display text-xl font-bold text-slate-800">
            Quizzes <span className="text-slate-400">({quizzes.length})</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Create drafts with AI, publish timed quizzes and look at how your class did.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterSubjectId}
            onChange={(e) => setFilterSubjectId(e.target.value)}
            className={`${inputCls} w-auto cursor-pointer py-2 text-xs font-semibold`}
          >
            <option value="ALL">All subjects</option>
            {assignedSubjects.map((s) => {
              const id = s.subjectId ?? s.id;
              return (
                <option key={id} value={id}>
                  {s.subjectCode} — {s.subjectName ?? s.name}
                </option>
              );
            })}
          </select>

          <div className="flex rounded-2xl bg-slate-100 p-1">
            {["ALL", "DRAFT", "PUBLISHED", "CLOSED"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition-all duration-300 ${
                  filterStatus === st
                    ? "bg-white text-emerald-600 shadow"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {st.toLowerCase()}
              </button>
            ))}
          </div>

          <button type="button" onClick={openNewQuizBuilder} className={primaryBtn}>
            + New quiz
          </button>
        </div>
      </Card>

      {loadingList ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-44 animate-pulse rounded-3xl bg-white/80 shadow-sm" />
          ))}
        </div>
      ) : quizzes.length === 0 ? (
        <Card className="py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
            </svg>
          </span>
          <p className="sc-display mt-4 text-lg font-bold text-slate-800">No quizzes yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Tap “New quiz” to build your first one, with or without AI.
          </p>
        </Card>
      ) : (
        <div className="sc-stagger grid gap-4 md:grid-cols-2">
          {quizzes.map((quiz) => {
            const qId = quiz.quizId ?? quiz.id;
            const status = String(quiz.status ?? "DRAFT").toUpperCase();

            return (
              <article
                key={qId}
                className="flex flex-col justify-between rounded-3xl border border-white bg-white/90 p-6 shadow-lg shadow-slate-200/60 transition duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-emerald-600">
                      {quiz.subjectCode ?? `Subject #${quiz.subjectId}`}
                    </span>
                    <StatusPill status={status} />
                  </div>

                  <h3 className="sc-display mt-2 text-lg font-bold text-slate-800">{quiz.title}</h3>
                  {quiz.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{quiz.description}</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                      <strong className="text-slate-700">{quiz.totalQuestions ?? "—"}</strong> questions
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                      <strong className="text-slate-700">{quiz.totalMarks ?? "—"}</strong> marks
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 capitalize">
                      <strong className="text-slate-700">
                        {String(quiz.difficulty ?? "MEDIUM").toLowerCase()}
                      </strong>
                    </span>
                    {quiz.durationMinutes && (
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                        <strong className="text-slate-700">{quiz.durationMinutes}</strong> min
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {status === "DRAFT" && (
                    <>
                      <button
                        type="button"
                        disabled={busyAction === `load-${qId}`}
                        onClick={() => openEditDraftBuilder(quiz)}
                        className={`${ghostBtn} py-2 text-xs`}
                      >
                        {busyAction === `load-${qId}` ? "Opening..." : "Edit draft"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPublishModalQuiz(quiz);
                          setPublishForm({
                            startAt: "",
                            deadlineAt: "",
                            durationMinutes: 30,
                            maxAttempts: 1,
                          });
                        }}
                        className="cursor-pointer rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95"
                      >
                        Publish
                      </button>
                    </>
                  )}

                  {status === "PUBLISHED" && (
                    <button
                      type="button"
                      disabled={busyAction === `close-${qId}`}
                      onClick={() => handleCloseQuiz(quiz)}
                      className="cursor-pointer rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 active:scale-95 disabled:opacity-50"
                    >
                      {busyAction === `close-${qId}` ? "Closing..." : "Close quiz"}
                    </button>
                  )}

                  {(status === "PUBLISHED" || status === "CLOSED") && (
                    <button
                      type="button"
                      onClick={() => openResultsAnalytics(quiz)}
                      className="cursor-pointer rounded-xl bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-600 transition hover:bg-sky-100 active:scale-95"
                    >
                      View results
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ============ Publish modal ============ */}
      {publishModalQuiz && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={() => setPublishModalQuiz(null)}
        >
          <form
            onSubmit={handlePublishSubmit}
            onClick={(e) => e.stopPropagation()}
            className="sc-pop w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div>
              <h3 className="sc-display text-xl font-bold text-slate-800">
                Publish “{publishModalQuiz.title}”
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Choose when it opens and closes, how long students get, and how many tries they have.
              </p>
            </div>

            <Field label="Starts at (must be in the future)">
              <input
                type="datetime-local"
                required
                value={publishForm.startAt}
                onChange={(e) => setPublishForm((prev) => ({ ...prev, startAt: e.target.value }))}
                className={inputCls}
              />
            </Field>

            <Field label="Deadline">
              <input
                type="datetime-local"
                required
                value={publishForm.deadlineAt}
                onChange={(e) => setPublishForm((prev) => ({ ...prev, deadlineAt: e.target.value }))}
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Time limit (1 to 1440 min)">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  required
                  value={publishForm.durationMinutes}
                  onChange={(e) =>
                    setPublishForm((prev) => ({ ...prev, durationMinutes: e.target.value }))
                  }
                  className={inputCls}
                />
              </Field>

              <Field label="Max attempts (1 to 5)">
                <input
                  type="number"
                  min={1}
                  max={5}
                  required
                  value={publishForm.maxAttempts}
                  onChange={(e) =>
                    setPublishForm((prev) => ({ ...prev, maxAttempts: e.target.value }))
                  }
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={busyAction.startsWith("publish-")}
                className={`${primaryBtn} flex-1`}
              >
                {busyAction.startsWith("publish-") ? "Publishing..." : "Publish quiz"}
              </button>
              <button type="button" onClick={() => setPublishModalQuiz(null)} className={`${ghostBtn} flex-1`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============ Results modal ============ */}
      {resultsModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={closeResults}
        >
          <div
            className="sc-pop sc-scroll max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-semibold text-sky-600">Quiz results</p>
                <h3 className="sc-display mt-1 text-xl font-bold text-slate-800">
                  {resultsModal.data?.quiz?.title ?? "Quiz results"}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeResults}
                aria-label="Close"
                className="cursor-pointer rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {resultsModal.loading ? (
              <div className="space-y-3 py-8">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : (
              <>
                {resultsModal.data?.summary && (
                  <div className="sc-stagger mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-400">Submitted</p>
                      <p className="sc-display mt-1 text-xl font-bold text-slate-800">
                        {resultsModal.data.summary.submittedAttempts ?? 0}
                        <span className="text-sm font-medium text-slate-400">
                          {" "}
                          / {resultsModal.data.summary.totalEnrolledStudents ?? 0}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-2xl bg-sky-50 p-4">
                      <p className="text-xs text-sky-500">Average</p>
                      <p className="sc-display mt-1 text-xl font-bold text-sky-600">
                        {resultsModal.data.summary.averageScore ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 p-4">
                      <p className="text-xs text-emerald-500">Highest</p>
                      <p className="sc-display mt-1 text-xl font-bold text-emerald-600">
                        {resultsModal.data.summary.highestScore ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-rose-50 p-4">
                      <p className="text-xs text-rose-500">Lowest</p>
                      <p className="sc-display mt-1 text-xl font-bold text-rose-600">
                        {resultsModal.data.summary.lowestScore ?? "—"}
                      </p>
                    </div>
                  </div>
                )}

                <div className="sc-scroll mt-6 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs text-slate-400">
                        <th className="px-3 py-2.5 font-semibold">Student</th>
                        <th className="px-3 py-2.5 font-semibold">Status</th>
                        <th className="px-3 py-2.5 font-semibold">Score</th>
                        <th className="px-3 py-2.5 font-semibold">Submitted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {unwrap(resultsModal.data, "attempts").map((att, idx) => (
                        <tr key={att.attemptId ?? idx} className="transition-colors hover:bg-emerald-50/40">
                          <td className="px-3 py-3 font-semibold text-slate-800">
                            {att.studentName ?? att.fullName ?? att.email ?? `Student #${att.studentId}`}
                          </td>
                          <td className="px-3 py-3 text-slate-500 capitalize">
                            {String(att.status ?? "SUBMITTED").toLowerCase().replace(/_/g, " ")}
                          </td>
                          <td className="px-3 py-3 font-bold text-emerald-600">
                            {att.score ?? 0}{" "}
                            <span className="font-medium text-slate-400">
                              / {resultsModal.data?.quiz?.totalMarks ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-400">
                            {att.submittedAt ? new Date(att.submittedAt).toLocaleString("en-IN") : "—"}
                          </td>
                        </tr>
                      ))}
                      {unwrap(resultsModal.data, "attempts").length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            No student attempts yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}