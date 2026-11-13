import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import CameraCapture from "../components/CameraCapture";
import OtpForm from "../components/OtpForm";
import {
  loginStudentWithFace,
  loginWithPassword,
  parseApiError,
  registerByRole,
  sendEmailVerificationOtp,
  verifyEmailOtp,
  verifyRoleMfa,
} from "../services/auth.service";

/* ------------------------------------------------------------------
   Role themes (light palette). Full class strings are kept literal so
   Tailwind can detect them.
------------------------------------------------------------------- */
const ROLE_THEMES = {
  student: {
    id: "student",
    label: "Student",
    tagline: "Mark attendance with a smile and learn with your AI classroom companion.",
    minPassword: 12,
    gradient: "from-indigo-400 to-sky-400",
    buttonGradient: "from-indigo-500 to-sky-500",
    blob: "bg-sky-200/70",
    blob2: "bg-indigo-200/60",
    tint: "bg-indigo-50/70",
    accentText: "text-indigo-600",
    accentBorder: "border-indigo-200",
    accentDot: "bg-indigo-500",
    focus: "focus:border-indigo-400 focus:ring-indigo-100",
    bracket: "border-indigo-300",
    shadow: "shadow-indigo-200/60",
    features: [
      "One-tap face recognition sign in",
      "Live attendance record",
      "Email code for extra protection",
    ],
  },
  faculty: {
    id: "faculty",
    label: "Faculty",
    tagline: "Run live sessions, keep rosters tidy and see how your class is doing.",
    minPassword: 8,
    gradient: "from-emerald-400 to-teal-400",
    buttonGradient: "from-emerald-500 to-teal-500",
    blob: "bg-emerald-200/70",
    blob2: "bg-teal-200/60",
    tint: "bg-emerald-50/70",
    accentText: "text-emerald-600",
    accentBorder: "border-emerald-200",
    accentDot: "bg-emerald-500",
    focus: "focus:border-emerald-400 focus:ring-emerald-100",
    bracket: "border-emerald-300",
    shadow: "shadow-emerald-200/60",
    features: [
      "Proxy-free classroom check-ins",
      "Student engagement insights",
      "Two-step session security",
    ],
  },
  admin: {
    id: "admin",
    label: "Admin",
    tagline: "Manage roles, departments and security for your whole institution.",
    minPassword: 8,
    gradient: "from-fuchsia-400 to-rose-400",
    buttonGradient: "from-fuchsia-500 to-rose-500",
    blob: "bg-rose-200/70",
    blob2: "bg-fuchsia-200/60",
    tint: "bg-rose-50/70",
    accentText: "text-rose-600",
    accentBorder: "border-rose-200",
    accentDot: "bg-rose-500",
    focus: "focus:border-rose-400 focus:ring-rose-100",
    bracket: "border-rose-300",
    shadow: "shadow-rose-200/60",
    features: [
      "Role and department setup",
      "Biometric and audit logs",
      "Session and MFA controls",
    ],
  },
};

const ROLE_ORDER = ["student", "faculty", "admin"];

/* ------------------------------------------------------------------
   Small presentational helpers
------------------------------------------------------------------- */
const inputBase =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition duration-200 focus:ring-4";

function EyeIcon({ off }) {
  return off ? (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.7 9.7 0 0112 5c4.5 0 8.3 2.9 9.5 7a9.8 9.8 0 01-2.7 4.2M6.3 6.3A9.8 9.8 0 002.5 12c1.2 4.1 5 7 9.5 7 1.7 0 3.3-.4 4.7-1.2" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12C3.7 7.9 7.5 5 12 5s8.3 2.9 9.5 7c-1.2 4.1-5 7-9.5 7s-8.3-2.9-9.5-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function PasswordField({ label, name, value, onChange, placeholder, minLength, focus }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          name={name}
          value={value}
          onChange={onChange}
          minLength={minLength}
          required
          placeholder={placeholder}
          autoComplete={name === "password" ? "current-password" : "new-password"}
          className={`${inputBase} ${focus} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-xl text-slate-400 transition hover:text-slate-700 active:scale-90"
        >
          <EyeIcon off={visible} />
        </button>
      </div>
    </Field>
  );
}

/* Aperture mark: the SnapClass logo, spins gently when the role changes */
function ApertureLogo({ gradient, spinKey }) {
  return (
    <div
      className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-lg transition-all duration-500`}
    >
      <svg
        key={spinKey}
        className="sc-spin-once h-6 w-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3l3.5 6M20.2 8l-7 .1M20.5 16l-3.4-6M12 21l-3.5-6M3.8 16l7-.1M3.5 8l3.4 6" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------
   Page
------------------------------------------------------------------- */
export default function AuthPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  // stages: "register" | "verify-email" | "login" | "verify-mfa" | "redirecting"
  const [role, setRole] = useState("student");
  const [stage, setStage] = useState("login");
  const [studentLoginMethod, setStudentLoginMethod] = useState("password"); // "password" | "face"

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [faceImage, setFaceImage] = useState(null);
  const [facePreview, setFacePreview] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [launchProgress, setLaunchProgress] = useState(0);
  const [authenticatedUser, setAuthenticatedUser] = useState(null);

  const theme = ROLE_THEMES[role];
  const isStudent = role === "student";
  const roleIndex = ROLE_ORDER.indexOf(role);

  // Object URL for face preview
  useEffect(() => {
    if (!faceImage) {
      setFacePreview(null);
      return;
    }
    const url = URL.createObjectURL(faceImage);
    setFacePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [faceImage]);

  // Redirect animation after MFA success
  useEffect(() => {
    if (stage !== "redirecting" || !authenticatedUser) return;

    const interval = setInterval(() => {
      setLaunchProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 5;
      });
    }, 65);

    const timeout = setTimeout(() => {
      login(authenticatedUser);
      navigate("/dashboard", { replace: true });
    }, 1600);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [stage, authenticatedUser, login, navigate]);

  function clearAlerts() {
    setStatusMessage("");
    setErrorMessage("");
  }

  function handleRoleSwitch(nextRole) {
    if (nextRole === role) return;
    setRole(nextRole);
    setStage("login");
    setStudentLoginMethod("password");
    setFaceImage(null);
    setCameraOpen(false);
    clearAlerts();
  }

  function handleStageSwitch(nextStage) {
    setStage(nextStage);
    setFaceImage(null);
    setCameraOpen(false);
    clearAlerts();
    if (nextStage === "login" && studentLoginMethod === "face") {
      setCameraOpen(true);
    }
  }

  function handleInputChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMessage("Please upload a JPEG, PNG, or WebP portrait image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Portrait image must be under 5MB.");
      return;
    }

    setFaceImage(file);
    setCameraOpen(false);
    setErrorMessage("");
    setStatusMessage("Biometric portrait locked and ready.");
  }

  // ===== FLOW 1: REGISTRATION -> EMAIL OTP VERIFICATION =====
  async function handleRegisterSubmit(e) {
    e.preventDefault();
    clearAlerts();

    if (form.fullName.trim().length < 2) {
      setErrorMessage("Please enter your full name (minimum 2 characters).");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setErrorMessage("Please enter a valid institutional or personal email.");
      return;
    }
    if (form.password.length < theme.minPassword) {
      setErrorMessage(
        `${theme.label} passwords must be at least ${theme.minPassword} characters long.`
      );
      return;
    }
    if (form.password !== form.confirmPassword) {
      setErrorMessage("Passwords do not match. Please confirm your password.");
      return;
    }
    if (isStudent && !faceImage) {
      setErrorMessage("Students must capture or upload a recent face portrait.");
      return;
    }

    setLoading(true);
    try {
      const regRes = await registerByRole(role, {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        faceImage,
      });

      try {
        await sendEmailVerificationOtp(form.email);
      } catch {
        // Ignore if backend already dispatched or rate-limited
      }

      setStatusMessage(
        regRes?.message || "Account created! Enter the 6-digit code sent to your email."
      );
      setStage("verify-email");
    } catch (err) {
      const msg = parseApiError(err);
      if (err.response?.status === 409) {
        try {
          await sendEmailVerificationOtp(form.email);
        } catch {}
        setStatusMessage(
          "This email is already registered. If unverified, enter the OTP sent to your inbox."
        );
        setStage("verify-email");
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  // ===== FLOW 2: VERIFY EMAIL -> LOGIN =====
  async function handleEmailOtpVerify(otpCode) {
    clearAlerts();
    setLoading(true);
    try {
      const res = await verifyEmailOtp({ email: form.email, otp: otpCode });
      setStatusMessage(
        res?.message || "Email verified! You can now sign in to your account."
      );
      setForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
      setFaceImage(null);
      setStudentLoginMethod("password");
      setStage("login");
    } catch (err) {
      setErrorMessage(parseApiError(err, "Invalid email verification OTP."));
    } finally {
      setLoading(false);
    }
  }

  // ===== FLOW 3: LOGIN (PASSWORD OR STUDENT FACE) =====
  async function handleLoginSubmit(e) {
    e.preventDefault();
    clearAlerts();

    setLoading(true);
    try {
      if (isStudent && studentLoginMethod === "face") {
        if (!faceImage) {
          setErrorMessage("Please capture your live photo using the camera first.");
          setLoading(false);
          return;
        }

        const faceRes = await loginStudentWithFace(faceImage);
        if (faceRes?.email) {
          setForm((prev) => ({ ...prev, email: faceRes.email }));
        }
        setStatusMessage(
          faceRes?.message || "Face recognized! Enter the MFA code sent to your email."
        );
        setStage("verify-mfa");
        return;
      }

      const loginRes = await loginWithPassword(role, {
        email: form.email,
        password: form.password,
      });

      setStatusMessage(
        loginRes?.message || "Credentials verified! Enter the MFA code sent to your email."
      );
      setStage("verify-mfa");
    } catch (err) {
      if (
        err.response?.status === 403 &&
        err.response?.data?.code === "EMAIL_VERIFICATION_REQUIRED"
      ) {
        const returnedEmail = err.response?.data?.email || form.email;
        if (returnedEmail) {
          setForm((prev) => ({ ...prev, email: returnedEmail }));
          try {
            await sendEmailVerificationOtp(returnedEmail);
          } catch {}
        }
        setStatusMessage(
          "Your email is not verified yet. We just sent a verification OTP to your inbox."
        );
        setStage("verify-email");
      } else {
        setErrorMessage(parseApiError(err));
      }
    } finally {
      setLoading(false);
    }
  }

  // ===== FLOW 4: MFA OTP -> REDIRECT =====
  async function handleMfaOtpVerify(otpCode) {
    clearAlerts();
    if (!form.email.trim()) {
      setErrorMessage("Email address is missing for MFA verification.");
      return;
    }

    setLoading(true);
    try {
      const mfaRes = await verifyRoleMfa(role, {
        email: form.email,
        otp: otpCode,
      });

      const userPayload = mfaRes?.user || {
        email: form.email,
        role: role.toUpperCase(),
      };

      setAuthenticatedUser(userPayload);
      setLaunchProgress(15);
      setStage("redirecting");
    } catch (err) {
      setErrorMessage(parseApiError(err, "Invalid or expired MFA code."));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    clearAlerts();
    if (!form.email.trim()) {
      setErrorMessage("Please enter your email address first.");
      return;
    }

    setLoading(true);
    try {
      if (stage === "verify-email") {
        const res = await sendEmailVerificationOtp(form.email);
        setStatusMessage(res?.message || "Fresh verification OTP sent to your email.");
      } else if (stage === "verify-mfa") {
        if (isStudent && studentLoginMethod === "face" && faceImage) {
          const res = await loginStudentWithFace(faceImage);
          setStatusMessage(res?.message || "New biometric MFA code dispatched.");
        } else if (form.password) {
          const res = await loginWithPassword(role, {
            email: form.email,
            password: form.password,
          });
          setStatusMessage(res?.message || "New MFA code dispatched to your email.");
        } else {
          setErrorMessage("Please go back and re-scan your face to trigger a new code.");
        }
      }
    } catch (err) {
      setErrorMessage(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  /* ----------------------------------------------------------------
     Shared animation styles (self-contained, no tailwind config needed)
  ----------------------------------------------------------------- */
  const styles = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
      .sc-root { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
      .sc-display { font-family: 'Sora', 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
      @keyframes sc-enter { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
      @keyframes sc-float { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-24px,0); } }
      @keyframes sc-float-b { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(-20px,18px,0); } }
      @keyframes sc-spin-once { from { transform: rotate(-120deg) scale(.7); opacity: 0; } to { transform: none; opacity: 1; } }
      @keyframes sc-pop { 0% { transform: scale(.5); opacity: 0; } 70% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
      @keyframes sc-ring { 0% { transform: scale(.8); opacity: .7; } 100% { transform: scale(1.7); opacity: 0; } }
      @keyframes sc-shine { from { background-position: -200% 0; } to { background-position: 200% 0; } }
      @keyframes sc-draw { from { stroke-dashoffset: 30; } to { stroke-dashoffset: 0; } }
      .sc-enter { animation: sc-enter .5s cubic-bezier(.22,1,.36,1) both; }
      .sc-float { animation: sc-float 11s ease-in-out infinite; }
      .sc-float-b { animation: sc-float-b 14s ease-in-out infinite; }
      .sc-spin-once { animation: sc-spin-once .7s cubic-bezier(.22,1,.36,1) both; }
      .sc-pop { animation: sc-pop .5s cubic-bezier(.34,1.56,.64,1) both; }
      .sc-ring { animation: sc-ring 1.6s ease-out infinite; }
      .sc-draw { stroke-dasharray: 30; animation: sc-draw .6s .2s ease-out both; }
      .sc-btn { background-size: 200% 100%; }
      .sc-btn:not(:disabled):hover { animation: sc-shine 1.4s linear infinite; }
      .sc-stagger > * { animation: sc-enter .5s cubic-bezier(.22,1,.36,1) both; }
      .sc-stagger > *:nth-child(2) { animation-delay: .05s; }
      .sc-stagger > *:nth-child(3) { animation-delay: .1s; }
      .sc-stagger > *:nth-child(4) { animation-delay: .15s; }
      .sc-stagger > *:nth-child(5) { animation-delay: .2s; }
      @media (prefers-reduced-motion: reduce) {
        .sc-root *, .sc-root *::before, .sc-root *::after { animation: none !important; transition-duration: .01ms !important; }
      }
    `}</style>
  );

  /* ----------------------------------------------------------------
     Redirect screen
  ----------------------------------------------------------------- */
  if (stage === "redirecting") {
    return (
      <div className="sc-root relative flex min-h-[88vh] items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4">
        {styles}
        <div className={`sc-float pointer-events-none absolute -top-20 -left-20 h-96 w-96 rounded-full blur-3xl ${theme.blob}`} />
        <div className={`sc-float-b pointer-events-none absolute -right-20 -bottom-20 h-96 w-96 rounded-full blur-3xl ${theme.blob2}`} />

        <div className="sc-enter relative z-10 w-full max-w-sm rounded-3xl border border-white bg-white/80 p-8 text-center shadow-xl shadow-slate-200/70 backdrop-blur-xl">
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
            <span className={`sc-ring absolute inset-2 rounded-full border-2 ${theme.accentBorder}`} />
            <div className={`sc-pop flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${theme.gradient} text-white shadow-lg`}>
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path className="sc-draw" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h2 className="sc-display mt-6 text-xl font-bold text-slate-800">
            Welcome back
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Opening your workspace
            {authenticatedUser?.email ? (
              <>
                {" "}as <span className="font-semibold text-slate-700">{authenticatedUser.email}</span>
              </>
            ) : null}
          </p>

          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${theme.gradient} transition-all duration-150`}
              style={{ width: `${launchProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------------
     Stepper data
  ----------------------------------------------------------------- */
  const steps = [
    {
      id: "step1",
      title: stage === "register" ? "Account details" : "Your credentials",
      active: stage === "register" || stage === "login",
      done: stage === "verify-email" || stage === "verify-mfa",
    },
    {
      id: "step2",
      title: stage === "verify-email" ? "Verify your email" : "Security code",
      active: stage === "verify-email" || stage === "verify-mfa",
      done: false,
    },
    { id: "step3", title: "Open workspace", active: false, done: false },
  ];

  return (
    <section className="sc-root relative min-h-[90vh] overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
      {styles}

      {/* Soft ambient color that follows the selected role */}
      <div className={`sc-float pointer-events-none absolute -top-32 -left-24 h-[26rem] w-[26rem] rounded-full blur-3xl transition-colors duration-700 ${theme.blob}`} />
      <div className={`sc-float-b pointer-events-none absolute -right-24 -bottom-32 h-[26rem] w-[26rem] rounded-full blur-3xl transition-colors duration-700 ${theme.blob2}`} />

      <div className="relative z-10 mx-auto max-w-5xl">
        {/* Header: brand + role switcher */}
        <header className="mb-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <ApertureLogo gradient={theme.gradient} spinKey={role} />
            <div>
              <p className="sc-display text-lg font-bold leading-tight text-slate-800">SnapClass</p>
              <p className="text-xs text-slate-500">Smart attendance, simply done</p>
            </div>
          </div>

          {/* Segmented control with sliding indicator */}
          <div
            role="tablist"
            aria-label="Choose your role"
            className="relative grid w-full max-w-xs grid-cols-3 rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm backdrop-blur sm:w-80"
          >
            <span
              aria-hidden="true"
              className={`absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-gradient-to-r ${theme.buttonGradient} shadow-md transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)]`}
              style={{ transform: `translateX(${roleIndex * 100}%)` }}
            />
            {ROLE_ORDER.map((id) => {
              const item = ROLE_THEMES[id];
              const active = role === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleRoleSwitch(id)}
                  className={`relative z-10 cursor-pointer rounded-full py-2 text-sm font-semibold transition-colors duration-300 ${
                    active ? "text-white" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </header>

        {/* Card with viewfinder corners */}
        <div className="relative">
          <span className={`pointer-events-none absolute -top-2 -left-2 h-6 w-6 rounded-tl-xl border-t-2 border-l-2 transition-colors duration-500 ${theme.bracket}`} />
          <span className={`pointer-events-none absolute -top-2 -right-2 h-6 w-6 rounded-tr-xl border-t-2 border-r-2 transition-colors duration-500 ${theme.bracket}`} />
          <span className={`pointer-events-none absolute -bottom-2 -left-2 h-6 w-6 rounded-bl-xl border-b-2 border-l-2 transition-colors duration-500 ${theme.bracket}`} />
          <span className={`pointer-events-none absolute -right-2 -bottom-2 h-6 w-6 rounded-br-xl border-r-2 border-b-2 transition-colors duration-500 ${theme.bracket}`} />

          <div className={`grid overflow-hidden rounded-3xl border border-white bg-white/85 shadow-xl backdrop-blur-xl transition-shadow duration-500 lg:grid-cols-12 ${theme.shadow}`}>
            {/* Left: calm role intro */}
            <aside className={`flex flex-col justify-between p-7 transition-colors duration-500 lg:col-span-5 lg:p-9 ${theme.tint}`}>
              <div key={role} className="sc-enter">
                <h1 className="sc-display text-3xl font-extrabold tracking-tight text-slate-800">
                  {theme.label} portal
                </h1>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
                  {theme.tagline}
                </p>

                <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
                  {theme.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2.5">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm ${theme.accentText}`}>
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Compact progress */}
              <ol className="mt-8 hidden space-y-2 lg:block" aria-label="Sign in progress">
                {steps.map((s) => (
                  <li
                    key={s.id}
                    className={`flex items-center gap-3 text-xs transition-colors duration-300 ${
                      s.active ? "font-semibold text-slate-800" : s.done ? "text-emerald-600" : "text-slate-400"
                    }`}
                  >
                    <span className="relative flex h-4 w-4 items-center justify-center">
                      {s.active && (
                        <span className={`sc-ring absolute inset-0 rounded-full ${theme.accentDot} opacity-40`} />
                      )}
                      <span
                        className={`relative h-2.5 w-2.5 rounded-full transition-colors duration-300 ${
                          s.active ? theme.accentDot : s.done ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                    </span>
                    {s.title}
                  </li>
                ))}
              </ol>
            </aside>

            {/* Right: forms */}
            <div className="p-6 sm:p-9 lg:col-span-7">
              {(stage === "login" || stage === "register") && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div key={stage} className="sc-enter">
                    <h2 className="sc-display text-xl font-bold text-slate-800">
                      {stage === "register"
                        ? `Create your ${theme.label.toLowerCase()} account`
                        : `Welcome back, ${theme.label.toLowerCase()}`}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {stage === "register"
                        ? "We will email you a code to confirm it is you."
                        : "Sign in and we will send you a quick security code."}
                    </p>
                  </div>

                  <div className="relative inline-grid grid-cols-2 rounded-full bg-slate-100 p-1">
                    <span
                      aria-hidden="true"
                      className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-white shadow transition-transform duration-400 ease-[cubic-bezier(.22,1,.36,1)]"
                      style={{ transform: `translateX(${stage === "register" ? "100%" : "0"})` }}
                    />
                    {[
                      { id: "login", text: "Sign in" },
                      { id: "register", text: "Register" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleStageSwitch(t.id)}
                        className={`relative z-10 cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-colors duration-300 ${
                          stage === t.id ? "text-slate-800" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {t.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Banners */}
              {statusMessage && (
                <div
                  role="status"
                  className="sc-enter mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span>{statusMessage}</span>
                </div>
              )}
              {errorMessage && (
                <div
                  role="alert"
                  className="sc-enter mb-5 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Email verification */}
              {stage === "verify-email" && (
                <div className="sc-enter">
                  <OtpForm
                    key="verify-email-vault"
                    badge="STEP 2 • EMAIL OWNERSHIP VERIFICATION"
                    title="Verify Your Email"
                    description="Enter the 6-digit OTP sent to your email. Once verified, you will transition smoothly to the login portal."
                    email={form.email}
                    accentClass={theme.buttonGradient}
                    loading={loading}
                    onSubmit={handleEmailOtpVerify}
                    onResend={handleResendOtp}
                    onBack={() => handleStageSwitch("register")}
                  />
                </div>
              )}

              {/* MFA */}
              {stage === "verify-mfa" && (
                <div className="sc-enter">
                  <OtpForm
                    key="verify-mfa-vault"
                    badge="STEP 2 • MULTI-FACTOR AUTHENTICATION"
                    title="Enter MFA Security Code"
                    description="Your primary credentials succeeded. Enter the 6-digit login code sent to your registered email to unlock your session."
                    email={form.email}
                    accentClass={theme.buttonGradient}
                    loading={loading}
                    onSubmit={handleMfaOtpVerify}
                    onResend={handleResendOtp}
                    onBack={() => handleStageSwitch("login")}
                  />
                </div>
              )}

              {/* Register */}
              {stage === "register" && (
                <form
                  key={`register-${role}`}
                  onSubmit={handleRegisterSubmit}
                  className="sc-stagger space-y-4"
                >
                  <Field label="Full name">
                    <input
                      name="fullName"
                      value={form.fullName}
                      onChange={handleInputChange}
                      required
                      autoComplete="name"
                      placeholder={
                        role === "faculty"
                          ? "Dr. Aarav Sharma"
                          : role === "admin"
                          ? "System Administrator"
                          : "Enter your full name"
                      }
                      className={`${inputBase} ${theme.focus}`}
                    />
                  </Field>

                  <Field label="Email address">
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleInputChange}
                      required
                      autoComplete="email"
                      placeholder={`${role}@snapclass.edu`}
                      className={`${inputBase} ${theme.focus}`}
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <PasswordField
                      label={`Password (min ${theme.minPassword} characters)`}
                      name="password"
                      value={form.password}
                      onChange={handleInputChange}
                      minLength={theme.minPassword}
                      placeholder={`At least ${theme.minPassword} characters`}
                      focus={theme.focus}
                    />
                    <PasswordField
                      label="Confirm password"
                      name="confirmPassword"
                      value={form.confirmPassword}
                      onChange={handleInputChange}
                      placeholder="Re-enter password"
                      focus={theme.focus}
                    />
                  </div>

                  {/* Student face enrollment */}
                  {isStudent && (
                    <div className={`rounded-2xl border border-dashed p-4 ${theme.accentBorder} ${theme.tint}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Add your face photo</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Take a live photo or upload a recent portrait for face sign in.
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setCameraOpen((prev) => !prev)}
                            className={`cursor-pointer rounded-xl bg-gradient-to-r ${theme.buttonGradient} px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-95`}
                          >
                            {cameraOpen ? "Hide camera" : "Use camera"}
                          </button>

                          <label className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95">
                            Upload photo
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={handleFileUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>

                      {cameraOpen && (
                        <div className="sc-enter mt-4">
                          <CameraCapture
                            modeLabel="Student Enrollment Scan"
                            onCapture={(file) => {
                              setFaceImage(file);
                              setCameraOpen(false);
                              setStatusMessage("Live biometric portrait captured!");
                            }}
                            onCancel={() => setCameraOpen(false)}
                          />
                        </div>
                      )}

                      {faceImage && facePreview && !cameraOpen && (
                        <div className="sc-enter mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-white p-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={facePreview}
                              alt="Enrolled face preview"
                              className="h-14 w-14 rounded-xl border-2 border-emerald-300 object-cover"
                            />
                            <div>
                              <p className="text-sm font-semibold text-emerald-600">Photo ready</p>
                              <p className="text-xs text-slate-400">
                                {faceImage.name} ({(faceImage.size / 1024).toFixed(1)} KB)
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFaceImage(null)}
                            className="cursor-pointer text-xs font-semibold text-rose-500 hover:underline"
                          >
                            Retake
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className={`sc-btn mt-1 w-full cursor-pointer rounded-xl bg-gradient-to-r ${theme.buttonGradient} px-5 py-3.5 text-sm font-semibold text-white shadow-lg ${theme.shadow} transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {loading ? "Creating account..." : `Create ${theme.label.toLowerCase()} account`}
                  </button>
                </form>
              )}

              {/* Login */}
              {stage === "login" && (
                <form
                  key={`login-${role}-${studentLoginMethod}`}
                  onSubmit={handleLoginSubmit}
                  className="sc-stagger space-y-5"
                >
                  {isStudent && (
                    <div className="relative grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
                      <span
                        aria-hidden="true"
                        className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-xl bg-white shadow transition-transform duration-400 ease-[cubic-bezier(.22,1,.36,1)]"
                        style={{
                          transform: `translateX(${studentLoginMethod === "face" ? "100%" : "0"})`,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setStudentLoginMethod("password");
                          setCameraOpen(false);
                          clearAlerts();
                        }}
                        className={`relative z-10 cursor-pointer rounded-xl py-2.5 text-xs font-semibold transition-colors duration-300 ${
                          studentLoginMethod === "password" ? "text-slate-800" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        Email & password
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStudentLoginMethod("face");
                          setFaceImage(null);
                          setCameraOpen(true);
                          clearAlerts();
                        }}
                        className={`relative z-10 cursor-pointer rounded-xl py-2.5 text-xs font-semibold transition-colors duration-300 ${
                          studentLoginMethod === "face" ? "text-slate-800" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        Face ID
                      </button>
                    </div>
                  )}

                  {isStudent && studentLoginMethod === "face" ? (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-500">
                        Look into the camera. We will match your face and email you a security code.
                      </p>

                      {!faceImage || cameraOpen ? (
                        <CameraCapture
                          modeLabel="AI Face Login Scanner"
                          onCapture={(file) => {
                            setFaceImage(file);
                            setCameraOpen(false);
                            setStatusMessage("Face scan locked! Click Authenticate below.");
                          }}
                        />
                      ) : (
                        <div className="sc-enter flex items-center justify-between rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                          <div className="flex items-center gap-3.5">
                            <img
                              src={facePreview}
                              alt="Captured face scan"
                              className="h-16 w-16 rounded-xl border-2 border-sky-300 object-cover"
                            />
                            <div>
                              <p className="text-sm font-semibold text-sky-700">Photo captured</p>
                              <p className="text-xs text-slate-500">Ready to match your face</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setFaceImage(null);
                              setCameraOpen(true);
                            }}
                            className="cursor-pointer rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 active:scale-95"
                          >
                            Retake
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <Field label="Registered email">
                        <input
                          type="email"
                          name="email"
                          value={form.email}
                          onChange={handleInputChange}
                          required
                          autoComplete="email"
                          placeholder={`${role}@snapclass.edu`}
                          className={`${inputBase} ${theme.focus}`}
                        />
                      </Field>

                      <PasswordField
                        label="Password"
                        name="password"
                        value={form.password}
                        onChange={handleInputChange}
                        placeholder="Enter your password"
                        focus={theme.focus}
                      />
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={loading || (isStudent && studentLoginMethod === "face" && !faceImage)}
                    className={`sc-btn w-full cursor-pointer rounded-xl bg-gradient-to-r ${theme.buttonGradient} px-5 py-3.5 text-sm font-semibold text-white shadow-lg ${theme.shadow} transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    {loading
                      ? "Signing in..."
                      : isStudent && studentLoginMethod === "face"
                      ? "Sign in with Face ID"
                      : `Sign in to ${theme.label.toLowerCase()} portal`}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}