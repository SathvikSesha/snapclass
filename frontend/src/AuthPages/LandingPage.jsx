import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

/* ------------------------------------------------------------------
   Icons (simple outline paths)
------------------------------------------------------------------- */
const ICONS = {
  shield: "M12 3l8 3v6c0 4.5-3.2 8.3-8 9-4.8-.7-8-4.5-8-9V6l8-3z",
  mail: "M3 7l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z",
  lock: "M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 14a6.5 6.5 0 013.5 6",
  book: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13",
  check: "M5 13l4 4L19 7",
  calendar: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  upload: "M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  camera: "M4 8a2 2 0 012-2h2l1.5-2h5L16 6h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  file: "M7 3h7l5 5v13H7zM14 3v5h5",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  clipboard: "M9 3h6a1 1 0 011 1v2H8V4a1 1 0 011-1zM6 6h12v15H6z",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4",
  eye: "M2.5 12C3.7 7.9 7.5 5 12 5s8.3 2.9 9.5 7c-1.2 4.1-5 7-9.5 7s-8.3-2.9-9.5-7zM12 15a3 3 0 100-6 3 3 0 000 6z",
  download: "M12 4v12m0 0l-4-4m4 4l4-4M4 18v1a1 1 0 001 1h14a1 1 0 001-1v-1",
};

function Icon({ name, className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/* Fade/slide in when scrolled into view */
function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)] ${
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------
   Content
------------------------------------------------------------------- */
const HIGHLIGHTS = [
  {
    icon: "camera",
    title: "Attendance with a photo",
    text: "Upload a classroom photo and the AI marks who is present. Review it, then save.",
    tone: "bg-sky-50 text-sky-600",
  },
  {
    icon: "spark",
    title: "AI quiz builder",
    text: "Turn your course materials into quiz questions in a click. Pick how many and how hard.",
    tone: "bg-fuchsia-50 text-fuchsia-600",
  },
  {
    icon: "file",
    title: "Study materials, ready for AI",
    text: "Upload notes and slides once. They are stored safely and prepared for AI in the background.",
    tone: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: "user",
    title: "Face login for students",
    text: "Students sign in with their camera instead of typing a password.",
    tone: "bg-indigo-50 text-indigo-600",
  },
  {
    icon: "shield",
    title: "Two-step sign in",
    text: "A 6-digit code sent to your email on every login keeps accounts safe.",
    tone: "bg-amber-50 text-amber-600",
  },
  {
    icon: "calendar",
    title: "Simple subject sign-up",
    text: "Admins open registration windows and students join subjects while they are open.",
    tone: "bg-rose-50 text-rose-600",
  },
];

const ROLE_TABS = {
  student: {
    label: "Student",
    intro: "See your classes, your attendance and your marks in one place.",
    pill: "from-indigo-500 to-sky-500",
    icon: "bg-indigo-50 text-indigo-600",
    glow: "bg-indigo-100/70",
    features: [
      { icon: "grid", title: "Dashboard and subjects", text: "See your dashboard and join subjects while registration is open." },
      { icon: "chart", title: "Attendance", text: "Check your attendance percentage and full history for every subject." },
      { icon: "download", title: "Study materials", text: "View and download materials for the subjects you are enrolled in." },
      { icon: "clipboard", title: "Quizzes", text: "See quizzes that are available, upcoming, ended or closed." },
      { icon: "clock", title: "Timed quiz taking", text: "Save or change answers as you go. Your quiz submits itself when time is up." },
      { icon: "check", title: "Results and marks", text: "Review correct answers with explanations, and track your best and latest marks." },
    ],
  },
  faculty: {
    label: "Faculty",
    intro: "Spend less time on roll calls and quiz writing, and more time teaching.",
    pill: "from-emerald-500 to-teal-500",
    icon: "bg-emerald-50 text-emerald-600",
    glow: "bg-emerald-100/70",
    features: [
      { icon: "book", title: "Your subjects", text: "View your assigned subjects and ask for access to new ones." },
      { icon: "camera", title: "Smart face attendance", text: "Upload class photos, let AI recognise students, review by date and save." },
      { icon: "upload", title: "Course materials", text: "Upload study materials. They are indexed automatically so AI can use them." },
      { icon: "spark", title: "AI quiz generator", text: "Create questions from your materials. Choose the count and difficulty." },
      { icon: "edit", title: "Drafts and publishing", text: "Edit and reorder questions, then publish with a schedule, time limit and attempt limit." },
      { icon: "chart", title: "Class results", text: "See submitted and auto-submitted counts, plus average, highest and lowest scores." },
    ],
  },
  admin: {
    label: "Admin",
    intro: "Keep the whole institution organised from a single dashboard.",
    pill: "from-fuchsia-500 to-rose-500",
    icon: "bg-rose-50 text-rose-600",
    glow: "bg-rose-100/70",
    features: [
      { icon: "grid", title: "System dashboard", text: "A clear overview of everything happening in SnapClass." },
      { icon: "book", title: "Subjects", text: "Create subjects and courses and see them all in one list." },
      { icon: "check", title: "Faculty requests", text: "Approve or reject faculty who ask to teach a subject." },
      { icon: "calendar", title: "Registration windows", text: "Open, view and update when students can register for subjects." },
      { icon: "users", title: "User management", text: "See every student and faculty member and the subjects they have." },
      { icon: "trash", title: "Account control", text: "Remove accounts that should no longer have access." },
    ],
  },
};
const TAB_ORDER = ["student", "faculty", "admin"];

const QUIZ_STEPS = [
  { icon: "upload", title: "Upload materials", text: "Add your notes, slides or PDFs to a subject." },
  { icon: "spark", title: "Generate questions", text: "Choose how many questions and how difficult they should be." },
  { icon: "edit", title: "Edit your draft", text: "Change, remove or reorder questions until it feels right." },
  { icon: "calendar", title: "Publish", text: "Set a start time, time limit and number of attempts. Close it any time." },
  { icon: "chart", title: "See the results", text: "View scores and statistics for the whole class." },
];

/* ------------------------------------------------------------------
   Hero visual: a classroom "photo" being scanned
------------------------------------------------------------------- */
const FACES = [
  { name: "Aarav", bg: "bg-sky-100", fg: "text-sky-400" },
  { name: "Diya", bg: "bg-rose-100", fg: "text-rose-400" },
  { name: "Kabir", bg: "bg-amber-100", fg: "text-amber-400" },
  { name: "Meera", bg: "bg-emerald-100", fg: "text-emerald-400" },
  { name: "Rohan", bg: "bg-indigo-100", fg: "text-indigo-400" },
  { name: "Isha", bg: "bg-fuchsia-100", fg: "text-fuchsia-400" },
];

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* viewfinder corners */}
      {[
        "-top-3 -left-3 border-t-2 border-l-2 rounded-tl-2xl",
        "-top-3 -right-3 border-t-2 border-r-2 rounded-tr-2xl",
        "-bottom-3 -left-3 border-b-2 border-l-2 rounded-bl-2xl",
        "-bottom-3 -right-3 border-b-2 border-r-2 rounded-br-2xl",
      ].map((c) => (
        <span key={c} className={`pointer-events-none absolute h-7 w-7 border-indigo-300 ${c}`} />
      ))}

      <div className="relative overflow-hidden rounded-3xl border border-white bg-white/90 p-4 shadow-2xl shadow-indigo-200/60 backdrop-blur">
        <div className="relative grid grid-cols-3 gap-3">
          {FACES.map((f, i) => (
            <div
              key={f.name}
              className={`sc-recog relative flex aspect-square flex-col items-center justify-end overflow-hidden rounded-2xl ${f.bg}`}
              style={{ animationDelay: `${0.9 + i * 0.28}s` }}
            >
              <svg className={`h-full w-full ${f.fg}`} viewBox="0 0 64 64" fill="currentColor">
                <circle cx="32" cy="26" r="10" />
                <path d="M12 64c0-12 9-20 20-20s20 8 20 20z" />
              </svg>
              <span
                className="sc-pop absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-600 shadow"
                style={{ animationDelay: `${1.1 + i * 0.28}s` }}
              >
                {f.name}
              </span>
            </div>
          ))}
          {/* scanning line */}
          <span className="sc-scan pointer-events-none absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-sky-300/40 to-transparent" />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
          <div>
            <p className="text-xs text-slate-400">Today’s class</p>
            <p className="text-sm font-semibold text-slate-700">6 of 6 recognised</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
            <Icon name="check" className="h-5 w-5" />
          </span>
        </div>
      </div>

      {/* floating notes */}
      <div className="sc-float absolute -top-6 -right-4 hidden rounded-2xl border border-white bg-white px-3.5 py-2.5 shadow-xl shadow-slate-200/70 sm:block">
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-fuchsia-50 text-fuchsia-500">
            <Icon name="spark" className="h-3.5 w-3.5" />
          </span>
          Quiz ready · 10 questions
        </p>
      </div>
      <div className="sc-float-b absolute -bottom-6 -left-4 hidden rounded-2xl border border-white bg-white px-3.5 py-2.5 shadow-xl shadow-slate-200/70 sm:block">
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
            <Icon name="mail" className="h-3.5 w-3.5" />
          </span>
          Code sent to your email
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Page
------------------------------------------------------------------- */
export default function LandingPage() {
  const [tab, setTab] = useState("student");
  const current = ROLE_TABS[tab];
  const tabIndex = TAB_ORDER.indexOf(tab);

  return (
    <div className="sc-root relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-800">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
        .sc-root { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
        .sc-display { font-family: 'Sora', 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
        html { scroll-behavior: smooth; }
        section[id] { scroll-margin-top: 5rem; }
        @keyframes sc-enter { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @keyframes sc-float { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-14px,0); } }
        @keyframes sc-float-b { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(-12px,12px,0); } }
        @keyframes sc-blob { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(24px,-28px,0) scale(1.06); } }
        @keyframes sc-pop { 0% { transform: translate(-50%,6px) scale(.6); opacity: 0; } 100% { transform: translate(-50%,0) scale(1); opacity: 1; } }
        @keyframes sc-scan { 0% { top: -2.5rem; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        @keyframes sc-recog { from { box-shadow: 0 0 0 0 rgba(16,185,129,0); } to { box-shadow: 0 0 0 3px rgba(16,185,129,.55); } }
        @keyframes sc-tabin { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .sc-hero > * { animation: sc-enter .7s cubic-bezier(.22,1,.36,1) both; }
        .sc-hero > *:nth-child(2) { animation-delay: .08s; }
        .sc-hero > *:nth-child(3) { animation-delay: .16s; }
        .sc-hero > *:nth-child(4) { animation-delay: .24s; }
        .sc-blob { animation: sc-blob 16s ease-in-out infinite; }
        .sc-float { animation: sc-float 6s ease-in-out infinite; }
        .sc-float-b { animation: sc-float-b 7s ease-in-out infinite; }
        .sc-pop { animation: sc-pop .45s cubic-bezier(.34,1.56,.64,1) both; }
        .sc-scan { animation: sc-scan 3.2s ease-in-out .3s 2 both; }
        .sc-recog { animation: sc-recog .5s ease-out forwards; }
        .sc-tabin > * { animation: sc-tabin .55s cubic-bezier(.22,1,.36,1) both; }
        .sc-tabin > *:nth-child(2) { animation-delay: .05s; }
        .sc-tabin > *:nth-child(3) { animation-delay: .1s; }
        .sc-tabin > *:nth-child(4) { animation-delay: .15s; }
        .sc-tabin > *:nth-child(5) { animation-delay: .2s; }
        .sc-tabin > *:nth-child(6) { animation-delay: .25s; }
        @media (prefers-reduced-motion: reduce) {
          .sc-root *, .sc-root *::before, .sc-root *::after { animation: none !important; transition-duration: .01ms !important; }
          html { scroll-behavior: auto; }
        }
      `}</style>

      {/* Ambient color */}
      <div className="sc-blob pointer-events-none absolute -top-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-indigo-100/80 blur-3xl" />
      <div className="sc-blob pointer-events-none absolute top-40 -right-40 h-[30rem] w-[30rem] rounded-full bg-sky-100/80 blur-3xl [animation-delay:-6s]" />

      {/* ================= HERO ================= */}
      <section className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 pt-14 pb-20 lg:grid-cols-2 lg:pt-20 lg:pb-28">
        <div className="sc-hero text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-4 py-1.5 text-sm font-medium text-indigo-600 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            AI-powered classroom management
          </span>

          <h1 className="sc-display mt-6 text-4xl leading-[1.1] font-extrabold tracking-tight text-slate-800 sm:text-5xl lg:text-6xl">
            Attendance by camera. Quizzes by AI.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-slate-500 lg:mx-0">
            SnapClass brings attendance, study materials and quizzes together for
            admins, faculty and students, so everyone can spend less time on
            paperwork.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Link
              to="/auth"
              className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200/80 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-95"
            >
              Get started
            </Link>
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="rounded-full border border-slate-200 bg-white px-7 py-3.5 text-sm font-semibold text-slate-700 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md active:scale-95"
            >
              See what it does
            </a>
          </div>
        </div>

        <HeroVisual />
      </section>

      {/* ================= FEATURES ================= */}
      <section id="features" className="relative mx-auto max-w-7xl px-6 py-16 lg:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="sc-display text-3xl font-bold tracking-tight text-slate-800 sm:text-4xl">
            Everything your classroom needs
          </h2>
          <p className="mt-4 text-slate-500">
            Simple tools that handle the routine work, safely.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {HIGHLIGHTS.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <div className="group h-full rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-slate-200/70">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl transition duration-300 group-hover:scale-110 group-hover:rotate-[-6deg] ${f.tone}`}>
                  <Icon name={f.icon} className="h-6 w-6" />
                </span>
                <h3 className="sc-display mt-5 text-base font-semibold text-slate-800">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= ROLES ================= */}
      <section id="roles" className="relative mx-auto max-w-7xl px-6 py-16 lg:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="sc-display text-3xl font-bold tracking-tight text-slate-800 sm:text-4xl">
            A home for every role
          </h2>
          <p className="mt-4 text-slate-500">
            Admins, faculty and students each get their own portal with just what they need.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-10">
          <div className="mx-auto grid w-full max-w-md grid-cols-3 rounded-full border border-slate-200 bg-white p-1 shadow-sm relative">
            <span
              aria-hidden="true"
              className={`absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-gradient-to-r ${current.pill} shadow-md transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)]`}
              style={{ transform: `translateX(${tabIndex * 100}%)` }}
            />
            {TAB_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`relative z-10 cursor-pointer rounded-full py-2.5 text-sm font-semibold transition-colors duration-300 ${
                  tab === id ? "text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {ROLE_TABS[id].label}
              </button>
            ))}
          </div>

          <div className="relative mt-10 overflow-hidden rounded-[2rem] border border-white bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur sm:p-10">
            <div className={`pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl transition-colors duration-700 ${current.glow}`} />
            <p key={tab} className="sc-display relative text-center text-lg font-semibold text-slate-700" style={{ animation: "sc-tabin .5s both" }}>
              {current.intro}
            </p>

            <div key={`${tab}-grid`} className="sc-tabin relative mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {current.features.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-slate-100 bg-white p-5 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-200/60"
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${current.icon}`}>
                    <Icon name={f.icon} />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-slate-800">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= AI QUIZ FLOW ================= */}
      <section id="quiz" className="relative mx-auto max-w-7xl px-6 py-16 lg:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="sc-display text-3xl font-bold tracking-tight text-slate-800 sm:text-4xl">
            From your notes to a finished quiz
          </h2>
          <p className="mt-4 text-slate-500">
            Five easy steps, and the AI does the heavy lifting.
          </p>
        </Reveal>

        <div className="relative mt-14 grid gap-6 md:grid-cols-5">
          {/* connecting line (desktop) */}
          <div className="pointer-events-none absolute top-7 right-[10%] left-[10%] hidden h-px bg-gradient-to-r from-indigo-200 via-sky-200 to-emerald-200 md:block" />
          {QUIZ_STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 110}>
              <div className="relative text-center">
                <span className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white bg-white text-indigo-500 shadow-lg shadow-indigo-100 transition duration-300 hover:-translate-y-1 hover:rotate-[-6deg]">
                  <Icon name={s.icon} className="h-6 w-6" />
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                </span>
                <h3 className="sc-display mt-5 text-sm font-semibold text-slate-800">{s.title}</h3>
                <p className="mx-auto mt-1.5 max-w-[14rem] text-sm leading-relaxed text-slate-500">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="relative mx-auto max-w-7xl px-6 pt-8 pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-500 via-indigo-500 to-sky-500 px-6 py-14 text-center shadow-2xl shadow-indigo-200/80 sm:px-12">
            <div className="sc-blob pointer-events-none absolute -top-20 -left-16 h-64 w-64 rounded-full bg-white/15 blur-2xl" />
            <div className="sc-blob pointer-events-none absolute -right-16 -bottom-24 h-72 w-72 rounded-full bg-sky-300/30 blur-2xl [animation-delay:-8s]" />
            <h2 className="sc-display relative text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to make class a little easier?
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-indigo-50">
              Create your account, verify your email and start in minutes.
            </p>
            <Link
              to="/auth"
              className="relative mt-8 inline-block rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-indigo-600 shadow-lg transition duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-95"
            >
              Get started
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}