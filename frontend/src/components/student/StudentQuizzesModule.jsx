import { useCallback, useEffect, useRef, useState } from "react";
import {
  getQuizAttemptResult,
  getStudentQuizDetails,
  getStudentQuizzes,
  saveQuizAnswer,
  startQuizAttempt,
  submitQuizAttempt,
} from "../../services/student.service";

function unwrap(val, key) {
  if (Array.isArray(val)) return val;
  if (Array.isArray(val?.[key])) return val[key];
  return [];
}

function formatDateTime(val) {
  if (!val) return "—";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const primaryBtn =
  "cursor-pointer rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

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

function AvailPill({ avail }) {
  const map = {
    AVAILABLE: ["bg-emerald-50 text-emerald-600", "bg-emerald-500"],
    UPCOMING: ["bg-amber-50 text-amber-600", "bg-amber-500"],
  };
  const [tone, dot] = map[avail] ?? ["bg-slate-100 text-slate-500", "bg-slate-400"];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold capitalize ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {avail.toLowerCase()}
    </span>
  );
}

export default function StudentQuizzesModule({ onNotify, onError, onRefreshMarks }) {
  // mode: "lobby" | "attempt" | "result"
  const [mode, setMode] = useState("lobby");

  // Lobby State
  const [quizzes, setQuizzes] = useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [previewModal, setPreviewModal] = useState({
    open: false,
    loading: false,
    data: null,
  });

  // Live Attempt State
  const [activeAttempt, setActiveAttempt] = useState(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({}); // { [questionId]: optionId | null }
  const [savingQuestionId, setSavingQuestionId] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const autoSubmittedRef = useRef(false);

  // Result Review State
  const [resultData, setResultData] = useState(null);
  const handleFinalSubmitRef = useRef(null);

  const loadQuizzes = useCallback(async () => {
    setLoadingQuizzes(true);
    try {
      const res = await getStudentQuizzes();
      setQuizzes(unwrap(res, "quizzes"));
    } catch (err) {
      onError?.(err?.response?.data?.message || err?.message || "Failed to load quizzes.");
    } finally {
      setLoadingQuizzes(false);
    }
  }, [onError]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  // Live exam countdown synced to expiresAt
  useEffect(() => {
    if (mode !== "attempt" || !activeAttempt?.expiresAt) return;

    autoSubmittedRef.current = false;
    const expiryMs = new Date(activeAttempt.expiresAt).getTime();

    const tick = () => {
      const diffSec = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000));
      setRemainingSeconds(diffSec);

      if (diffSec <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        handleFinalSubmitRef.current?.(true);
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [mode, activeAttempt]);

  async function openQuizPreview(quiz) {
    const qId = quiz.quizId ?? quiz.id;
    setPreviewModal({ open: true, loading: true, data: null });
    try {
      const data = await getStudentQuizDetails(qId);
      setPreviewModal({ open: true, loading: false, data });
    } catch (err) {
      setPreviewModal({ open: false, loading: false, data: null });
      onError?.(err?.response?.data?.message || err?.message || "Could not preview quiz details.");
    }
  }

  async function handleStartQuiz(quiz) {
    const qId = quiz.quizId ?? quiz.id;
    setBusyAction(`start-${qId}`);
    try {
      const attemptData = await startQuizAttempt(qId);
      const questionsList = unwrap(attemptData, "questions");

      // Pre-populate any existing saved answers if resuming an attempt
      const initialMap = {};
      for (const q of questionsList) {
        if (q.selectedOptionId) {
          initialMap[q.questionId] = q.selectedOptionId;
        }
      }

      setActiveAttempt({
        ...attemptData,
        questions: questionsList,
      });
      setSelectedAnswers(initialMap);
      setCurrentQuestionIdx(0);
      setPreviewModal({ open: false, loading: false, data: null });
      setMode("attempt");
      onNotify?.("Quiz attempt started! Every option you select is automatically saved in real time.");
    } catch (err) {
      onError?.(err?.response?.data?.message || err?.message || "Unable to start quiz attempt.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleSelectOption(questionId, optionId) {
    if (!activeAttempt?.attemptId) return;

    // Optimistic UI update
    const prevOption = selectedAnswers[questionId] ?? null;
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    setSavingQuestionId(questionId);

    try {
      await saveQuizAnswer(activeAttempt.attemptId, {
        questionId,
        selectedOptionId: optionId,
      });
    } catch (err) {
      // Revert on failure
      setSelectedAnswers((prev) => ({ ...prev, [questionId]: prevOption }));
      onError?.(
        err?.response?.data?.message ||
          err?.message ||
          "Could not save answer. Check your connection or timer."
      );
    } finally {
      setSavingQuestionId(null);
    }
  }

  async function handleFinalSubmit(isAuto = false) {
    if (!activeAttempt?.attemptId) return;
    const attId = activeAttempt.attemptId;

    setBusyAction("submitting");
    try {
      const submitRes = await submitQuizAttempt(attId);
      onNotify?.(
        isAuto
          ? "Time expired — your quiz attempt was automatically submitted!"
          : submitRes?.message || "Quiz submitted successfully!"
      );

      // Load full question-by-question result breakdown with explanations
      try {
        const detailedResult = await getQuizAttemptResult(attId);
        setResultData(detailedResult);
      } catch {
        setResultData(submitRes);
      }

      setActiveAttempt(null);
      setMode("result");
      await loadQuizzes();
      onRefreshMarks?.();
    } catch (err) {
      onError?.(err?.response?.data?.message || err?.message || "Failed to submit quiz attempt.");
    } finally {
      setBusyAction("");
    }
  }
  handleFinalSubmitRef.current = handleFinalSubmit;

  // =====================================================
  // VIEW 1: LIVE TIMED QUIZ
  // =====================================================
  if (mode === "attempt" && activeAttempt) {
    const questions = activeAttempt.questions || [];
    const currentQ = questions[currentQuestionIdx] || null;
    const answeredCount = Object.values(selectedAnswers).filter(
      (v) => v !== null && v !== undefined
    ).length;
    const progress = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

    const mins =
      remainingSeconds !== null ? String(Math.floor(remainingSeconds / 60)).padStart(2, "0") : "--";
    const secs = remainingSeconds !== null ? String(remainingSeconds % 60).padStart(2, "0") : "--";
    const isUrgent = remainingSeconds !== null && remainingSeconds < 120;

    return (
      <div className="space-y-6">
        {/* Top bar */}
        <Card className="sticky top-20 z-10 !p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-indigo-600">
                Attempt #{activeAttempt.attemptNumber ?? 1} · in progress
              </p>
              <h2 className="sc-display mt-0.5 truncate text-xl font-bold text-slate-800">
                {activeAttempt.quiz?.title ?? "Timed quiz"}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`rounded-2xl px-4 py-2 text-center transition-colors duration-500 ${
                  isUrgent ? "animate-pulse bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Time left</p>
                <p className="sc-display text-xl font-extrabold tabular-nums">
                  {mins}:{secs}
                </p>
              </div>

              <button
                type="button"
                disabled={busyAction === "submitting"}
                onClick={() => handleFinalSubmit(false)}
                className="cursor-pointer rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-200 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-600 active:translate-y-0 active:scale-[.98] disabled:opacity-50"
              >
                {busyAction === "submitting"
                  ? "Submitting..."
                  : `Submit (${answeredCount}/${questions.length})`}
              </button>
            </div>
          </div>

          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-400 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Question */}
          <Card className="lg:col-span-8" delay={60}>
            {currentQ ? (
              <div key={currentQ.questionId ?? currentQuestionIdx} className="sc-enter">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-xl bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600">
                      Question {currentQuestionIdx + 1} of {questions.length}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                      {currentQ.marks ?? 1} mark{(currentQ.marks ?? 1) === 1 ? "" : "s"}
                    </span>
                  </div>

                  {savingQuestionId === currentQ.questionId ? (
                    <span className="text-xs font-semibold text-sky-600">Saving...</span>
                  ) : selectedAnswers[currentQ.questionId] ? (
                    <span className="text-xs font-semibold text-emerald-600">✓ Saved</span>
                  ) : (
                    <span className="text-xs text-slate-400">Not answered</span>
                  )}
                </div>

                <p className="sc-display mt-5 text-lg leading-relaxed font-semibold text-slate-800">
                  {currentQ.question}
                </p>

                <div className="mt-6 space-y-3">
                  {unwrap(currentQ, "options").map((opt, idx) => {
                    const optId = opt.optionId ?? opt.id;
                    const isSelected = Number(selectedAnswers[currentQ.questionId]) === Number(optId);

                    return (
                      <button
                        key={optId ?? idx}
                        type="button"
                        onClick={() => handleSelectOption(currentQ.questionId, optId)}
                        className={`flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border p-4 text-left transition-all duration-300 active:scale-[.99] ${
                          isSelected
                            ? "border-indigo-300 bg-indigo-50 shadow-md shadow-indigo-100"
                            : "border-slate-100 bg-slate-50/70 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white hover:shadow-md"
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors duration-300 ${
                            isSelected ? "bg-indigo-500 text-white" : "bg-white text-slate-400 shadow-sm"
                          }`}
                        >
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className={`text-sm font-medium ${isSelected ? "text-slate-900" : "text-slate-700"}`}>
                          {opt.optionText ?? opt.text}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    disabled={currentQuestionIdx === 0}
                    onClick={() => setCurrentQuestionIdx((prev) => Math.max(0, prev - 1))}
                    className={ghostBtn}
                  >
                    ← Previous
                  </button>

                  {selectedAnswers[currentQ.questionId] && (
                    <button
                      type="button"
                      onClick={() => handleSelectOption(currentQ.questionId, null)}
                      className="cursor-pointer text-xs font-semibold text-rose-500 transition hover:text-rose-600"
                    >
                      Clear my answer
                    </button>
                  )}

                  {currentQuestionIdx < questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentQuestionIdx((prev) => Math.min(questions.length - 1, prev + 1))
                      }
                      className={primaryBtn}
                    >
                      Next →
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyAction === "submitting"}
                      onClick={() => handleFinalSubmit(false)}
                      className="cursor-pointer rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-600 active:scale-[.98] disabled:opacity-50"
                    >
                      Submit quiz
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No questions found in this quiz attempt.</p>
            )}
          </Card>

          {/* Palette */}
          <Card className="h-fit lg:col-span-4" delay={120}>
            <h3 className="sc-display text-base font-bold text-slate-800">Questions</h3>
            <p className="mt-1 text-sm text-slate-500">
              <strong className="text-emerald-600">{answeredCount}</strong> answered ·{" "}
              <strong className="text-amber-600">{questions.length - answeredCount}</strong> left
            </p>

            <div className="mt-4 grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentQuestionIdx;
                const isAnswered =
                  selectedAnswers[q.questionId] !== undefined && selectedAnswers[q.questionId] !== null;

                return (
                  <button
                    key={q.questionId ?? idx}
                    type="button"
                    onClick={() => setCurrentQuestionIdx(idx)}
                    className={`aspect-square cursor-pointer rounded-xl text-sm font-bold transition-all duration-300 active:scale-90 ${
                      isCurrent
                        ? "bg-indigo-500 text-white shadow-md shadow-indigo-200 ring-4 ring-indigo-100"
                        : isAnswered
                        ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        : "bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // =====================================================
  // VIEW 2: RESULT & EXPLANATIONS
  // =====================================================
  if (mode === "result" && resultData) {
    const questions = unwrap(resultData, "questions");

    return (
      <div className="space-y-6">
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-indigo-100/70 blur-3xl" />

          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Attempt #{resultData.attemptNumber ?? 1} ·{" "}
                {String(resultData.status ?? "SUBMITTED").toLowerCase().replace(/_/g, " ")}
              </span>
              <h2 className="sc-display mt-2 text-2xl font-extrabold text-slate-800">
                {resultData.quizTitle ?? "Your scorecard"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {resultData.subjectCode} — {resultData.subjectName}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setResultData(null);
                setMode("lobby");
              }}
              className={ghostBtn}
            >
              ← Back to quizzes
            </button>
          </div>

          <div className="sc-stagger relative mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl bg-indigo-50 p-4">
              <p className="text-xs font-medium text-indigo-500">Your score</p>
              <p className="sc-display mt-1 text-2xl font-extrabold text-indigo-600">
                {resultData.score ?? 0}
                <span className="text-base font-semibold text-indigo-300"> / {resultData.totalMarks ?? "—"}</span>
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-medium text-emerald-500">Correct</p>
              <p className="sc-display mt-1 text-2xl font-extrabold text-emerald-600">
                {resultData.correctAnswers ?? "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-4">
              <p className="text-xs font-medium text-rose-500">Incorrect</p>
              <p className="sc-display mt-1 text-2xl font-extrabold text-rose-600">
                {resultData.incorrectAnswers ?? "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4">
              <p className="text-xs font-medium text-amber-500">Skipped</p>
              <p className="sc-display mt-1 text-2xl font-extrabold text-amber-600">
                {resultData.unansweredQuestions ?? 0}
              </p>
            </div>
          </div>
        </Card>

        {questions.length > 0 && (
          <div className="sc-stagger space-y-4">
            {questions.map((q, idx) => (
              <article
                key={q.questionId ?? idx}
                className="rounded-3xl border border-white bg-white/90 p-6 shadow-lg shadow-slate-200/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-indigo-600">Question {idx + 1}</span>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                      q.isCorrect ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    {q.marksAwarded ?? (q.isCorrect ? q.marks : 0)} / {q.marks ?? 1} marks
                  </span>
                </div>

                <p className="mt-2 text-base font-semibold text-slate-800">{q.question}</p>

                <div className="mt-4 space-y-2">
                  {unwrap(q, "options").map((opt, oIdx) => {
                    const isCorrectOpt = Boolean(opt.isCorrect);
                    const isSelectedOpt =
                      Boolean(opt.isSelected) || Number(q.selectedOptionId) === Number(opt.optionId);

                    let style = "border-slate-100 bg-slate-50/70 text-slate-600";
                    if (isCorrectOpt) {
                      style = "border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold";
                    } else if (isSelectedOpt && !isCorrectOpt) {
                      style = "border-rose-200 bg-rose-50 text-rose-800";
                    }

                    return (
                      <div
                        key={opt.optionId ?? oIdx}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${style}`}
                      >
                        <span>{opt.optionText ?? opt.text}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          {isSelectedOpt && (
                            <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                              Your answer
                            </span>
                          )}
                          {isCorrectOpt && (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                              ✓ Correct
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {q.explanation && (
                  <div className="mt-4 rounded-2xl bg-indigo-50/70 p-4 text-sm text-indigo-900">
                    <strong className="text-indigo-600">Why: </strong>
                    {q.explanation}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  // =====================================================
  // VIEW 3: QUIZ LOBBY
  // =====================================================
  const filteredQuizzes = quizzes.filter((q) => {
    if (statusFilter === "ALL") return true;
    return String(q.availabilityStatus ?? q.status ?? "").toUpperCase() === statusFilter;
  });

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="sc-display text-xl font-bold text-slate-800">
            Quizzes <span className="text-slate-400">({filteredQuizzes.length})</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">Take timed quizzes and review your answers afterwards.</p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
          {["ALL", "AVAILABLE", "UPCOMING", "ENDED", "CLOSED"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`cursor-pointer rounded-xl px-3.5 py-1.5 text-xs font-semibold capitalize transition-all duration-300 ${
                statusFilter === st
                  ? "bg-white text-indigo-600 shadow"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {st.toLowerCase()}
            </button>
          ))}
        </div>
      </Card>

      {loadingQuizzes ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-44 animate-pulse rounded-3xl bg-white/80 shadow-sm" />
          ))}
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <Card className="py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
            </svg>
          </span>
          <p className="sc-display mt-4 text-lg font-bold text-slate-800">No quizzes here</p>
          <p className="mt-1 text-sm text-slate-500">Nothing matches this filter right now.</p>
        </Card>
      ) : (
        <div key={statusFilter} className="sc-stagger grid gap-4 md:grid-cols-2">
          {filteredQuizzes.map((quiz) => {
            const qId = quiz.quizId ?? quiz.id;
            const avail = String(quiz.availabilityStatus ?? quiz.status ?? "AVAILABLE").toUpperCase();
            const attemptsUsed = Number(quiz.attemptsUsed ?? 0);
            const maxAttempts = Number(quiz.maxAttempts ?? 1);
            const canAttempt = avail === "AVAILABLE" && attemptsUsed < maxAttempts;

            return (
              <article
                key={qId}
                className="flex flex-col justify-between rounded-3xl border border-white bg-white/90 p-6 shadow-lg shadow-slate-200/60 transition duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-indigo-600">
                      {quiz.subjectCode} — {quiz.subjectName}
                    </span>
                    <AvailPill avail={avail} />
                  </div>

                  <h3 className="sc-display mt-2 text-lg font-bold text-slate-800">{quiz.title}</h3>
                  {quiz.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{quiz.description}</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                      <strong className="text-slate-700">{quiz.durationMinutes ?? 30}</strong> min
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                      <strong className="text-slate-700">{quiz.totalMarks ?? "—"}</strong> marks
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                      <strong className="text-slate-700">{quiz.totalQuestions ?? "—"}</strong> questions
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                      Attempts{" "}
                      <strong className="text-slate-700">
                        {attemptsUsed}/{maxAttempts}
                      </strong>
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    Open {formatDateTime(quiz.startAt)} to {formatDateTime(quiz.deadlineAt)}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-2.5 border-t border-slate-100 pt-4">
                  <button type="button" onClick={() => openQuizPreview(quiz)} className={`${ghostBtn} py-2 text-xs`}>
                    Preview
                  </button>

                  {canAttempt ? (
                    <button
                      type="button"
                      disabled={busyAction === `start-${qId}`}
                      onClick={() => handleStartQuiz(quiz)}
                      className={`${primaryBtn} flex-1 py-2 text-xs`}
                    >
                      {busyAction === `start-${qId}` ? "Starting..." : "Start quiz"}
                    </button>
                  ) : (
                    <span className="flex-1 rounded-xl bg-slate-50 py-2 text-center text-xs font-semibold text-slate-400">
                      {attemptsUsed >= maxAttempts ? "No attempts left" : `Quiz ${avail.toLowerCase()}`}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Preview modal */}
      {previewModal.open && (
        <div
          className="sc-fade fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={() => setPreviewModal({ open: false, loading: false, data: null })}
        >
          <div
            className="sc-pop sc-scroll max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-semibold text-indigo-600">Quiz preview</p>
                <h3 className="sc-display mt-1 text-xl font-bold text-slate-800">
                  {previewModal.data?.title ?? "Loading..."}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setPreviewModal({ open: false, loading: false, data: null })}
                className="cursor-pointer rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {previewModal.loading ? (
              <div className="space-y-3 py-8">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-10 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-4 text-sm text-slate-600">
                {previewModal.data?.description && <p>{previewModal.data.description}</p>}
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-4">
                  <div>
                    <span className="text-xs text-slate-400">Time limit</span>
                    <p className="mt-0.5 font-bold text-slate-800">{previewModal.data?.durationMinutes} min</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">Total marks</span>
                    <p className="mt-0.5 font-bold text-indigo-600">{previewModal.data?.totalMarks}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">Max attempts</span>
                    <p className="mt-0.5 font-bold text-slate-800">{previewModal.data?.maxAttempts}</p>
                  </div>
                </div>

                {Array.isArray(previewModal.data?.questions) && previewModal.data.questions.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-semibold text-slate-800">
                      Questions ({previewModal.data.questions.length})
                    </p>
                    {previewModal.data.questions.map((q, idx) => (
                      <div key={q.questionId ?? idx} className="rounded-xl bg-slate-50 p-3">
                        <p className="font-medium text-slate-700">
                          {idx + 1}. {q.question}{" "}
                          <span className="text-indigo-600">({q.marks} marks)</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}