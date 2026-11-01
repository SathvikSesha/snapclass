import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  startFacultyLogin,
  completeFacultyMfa,
  registerFaculty,
  sendEmailVerificationOtp,
  verifyEmail,
} from "../services/auth.service";
import { useAuth } from "../context/AuthContext";

export default function StaffAuthPanel({ role = "faculty", onBack }) {
  const isAdmin = role === "admin";
  const navigate = useNavigate();
  const { login } = useAuth();

  const [mode, setMode] = useState("login");
  const [step, setStep] = useState("credentials"); // "credentials" | "mfa" | "email-verification"
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const roleLabel = isAdmin ? "Administrator" : "Faculty";
  const isOtpStep = step === "mfa" || step === "email-verification";

  // Reset all form state when the user switches roles
  useEffect(() => {
    setMode("login");
    setStep("credentials");
    setFullName("");
    setEmail("");
    setPassword("");
    setOtp("");
    setLoading(false);
    setError("");
    setMessage("");
  }, [role]);

  function resetMessages() {
    setError("");
    setMessage("");
  }

  function handleModeChange(nextMode) {
    setMode(nextMode);
    setStep("credentials");
    setOtp("");
    resetMessages();
  }

  async function handleFacultyLogin(event) {
    event.preventDefault();
    resetMessages();

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      await startFacultyLogin({ email, password });
      setStep("mfa");
      setOtp("");
      setMessage("Check your email for your verification code.");
    } catch (err) {
      const errMsg = err?.response?.data?.message || "";
      if (
        err?.response?.status === 403 &&
        (errMsg.toLowerCase().includes("verify your email") ||
          err?.response?.data?.code === "EMAIL_VERIFICATION_REQUIRED")
      ) {
        try {
          await sendEmailVerificationOtp(email);
        } catch {
          // Ignore cooldown or rate limits
        }
        setStep("email-verification");
        setOtp("");
        setMessage(
          "Your email is not verified yet. We have sent a verification code to your email."
        );
        return;
      }

      setError(
        errMsg ||
          "Unable to start faculty login. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleFacultyRegister(event) {
    event.preventDefault();
    resetMessages();

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      setError("Please enter your full name (at least 2 characters).");
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);

    try {
      const response = await registerFaculty({
        fullName: trimmedName,
        email: trimmedEmail,
        password,
      });

      // Dispatch verification code to the registered email
      try {
        await sendEmailVerificationOtp(trimmedEmail);
      } catch (otpErr) {
        console.warn("Email OTP dispatch warning:", otpErr);
      }

      setStep("email-verification");
      setOtp("");
      setMessage(
        response?.message ||
          "Faculty account created! Check your email for the verification code."
      );
    } catch (err) {
      const errMsg =
        err?.response?.data?.message ||
        "Unable to register faculty account. Please try again.";

      // If user already exists but unverified, route to verification
      if (
        err?.response?.status === 409 &&
        errMsg.toLowerCase().includes("already exists")
      ) {
        try {
          await sendEmailVerificationOtp(trimmedEmail);
        } catch {
          // Ignore cooldown
        }
        setStep("email-verification");
        setOtp("");
        setMessage(
          "An account with this email already exists. Please verify your email with the OTP code."
        );
        return;
      }

      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }

  async function handleFacultyMfa(event) {
    event.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      const response = await completeFacultyMfa({ email, otp });
      const userData = response?.data?.user ?? response?.user;

      if (!userData) {
        setError(
          "Verification returned no user information. Check your existing auth service response shape."
        );
        return;
      }

      login({ ...userData, role: "faculty" });
      navigate("/dashboard");
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Verification failed. Check the code and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyEmail(event) {
    event.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      const response = await verifyEmail({ email, otp });
      setMessage(
        response?.message ||
          "Email verified successfully! You can now sign in with your credentials."
      );
      setStep("credentials");
      setMode("login");
      setPassword("");
      setOtp("");
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Email verification failed. Please check the code and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendEmailOtp() {
    resetMessages();
    setLoading(true);

    try {
      const response = await sendEmailVerificationOtp(email);
      setMessage(
        response?.message || "A new verification code has been sent to your email."
      );
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Please wait a moment before requesting another code."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleAdminSubmit(event) {
    event.preventDefault();
    resetMessages();

    setError(
      "The Admin UI is ready, but its submission must be connected to your existing admin API routes. No request was sent."
    );
  }

  return (
    <div className="w-full max-w-xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-7 text-sm font-medium text-slate-500 hover:text-indigo-600"
      >
        ← Back to role selection
      </button>

      <div className="mb-8">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-2xl text-indigo-700">
          {isAdmin ? "♙" : "▤"}
        </div>
        <p className="text-sm font-semibold text-indigo-600">
          SNAPCLASS · {roleLabel.toUpperCase()}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          {step === "mfa"
            ? "Verify your identity"
            : step === "email-verification"
              ? "Verify your email"
              : mode === "register"
                ? `Create ${roleLabel.toLowerCase()} account`
                : `Welcome back${isAdmin ? "" : ", faculty"}!`}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {step === "mfa"
            ? `Enter the six-digit login code sent to ${email}.`
            : step === "email-verification"
              ? `Enter the six-digit verification code sent to ${email}.`
              : mode === "register"
                ? isAdmin
                  ? "Set up the initial SnapClass administrator account."
                  : "Create an account to manage classes, attendance, and students."
                : isAdmin
                  ? "Manage subjects, faculty, students, and your platform."
                  : "Sign in to manage courses, attendance, and learning resources."}
        </p>
      </div>

      {step === "mfa" ? (
        <form onSubmit={handleFacultyMfa} className="space-y-5">
          <div>
            <label htmlFor="staff-otp" className="mb-2 block text-sm font-medium">
              Six-digit verification code
            </label>
            <input
              id="staff-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-xl tracking-[0.4em] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {message && (
            <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full rounded-xl bg-indigo-600 px-5 py-3.5 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify and continue"}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("credentials");
              setOtp("");
              resetMessages();
            }}
            className="w-full text-sm font-medium text-slate-500 hover:text-indigo-600"
          >
            Back to login
          </button>
        </form>
      ) : step === "email-verification" ? (
        <form onSubmit={handleVerifyEmail} className="space-y-5">
          <div>
            <label
              htmlFor="staff-verify-email"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Email address
            </label>
            <input
              id="staff-verify-email"
              type="email"
              value={email}
              readOnly
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600"
            />
          </div>

          <div>
            <label htmlFor="staff-otp" className="mb-2 block text-sm font-medium">
              Six-digit verification code
            </label>
            <input
              id="staff-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-xl tracking-[0.4em] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {message && (
            <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full rounded-xl bg-indigo-600 px-5 py-3.5 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify email"}
          </button>

          <div className="flex flex-col gap-2 pt-2 text-center">
            <button
              type="button"
              disabled={loading}
              onClick={handleResendEmailOtp}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              Didn't receive the code? Resend OTP
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setMode("login");
                setOtp("");
                resetMessages();
              }}
              className="text-sm font-medium text-slate-500 hover:text-indigo-600"
            >
              Back to sign in
            </button>
          </div>
        </form>
      ) : (
        <>
          {!isOtpStep && (
            <div className="mb-6 flex rounded-xl bg-slate-100 p-1">
              {["login", "register"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleModeChange(item)}
                  className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold capitalize transition ${
                    mode === item
                      ? "bg-white text-indigo-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {item === "login" ? "Sign in" : "Register"}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={
              isAdmin
                ? handleAdminSubmit
                : mode === "register"
                  ? handleFacultyRegister
                  : handleFacultyLogin
            }
            className="space-y-5"
          >
            {mode === "register" && (
              <div>
                <label htmlFor="staff-name" className="mb-2 block text-sm font-medium">
                  Full name
                </label>
                <input
                  id="staff-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Jane Doe"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                />
              </div>
            )}

            <div>
              <label htmlFor="staff-email" className="mb-2 block text-sm font-medium">
                Email address
              </label>
              <input
                id="staff-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="faculty@university.edu"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
              />
            </div>

            <div>
              <label htmlFor="staff-password" className="mb-2 block text-sm font-medium">
                Password
              </label>
              <input
                id="staff-password"
                type="password"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "register" ? "At least 8 characters" : "Enter your password"
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            {message && (
              <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 px-5 py-3.5 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading
                ? "Please wait..."
                : isAdmin
                  ? mode === "register"
                    ? "Create admin account"
                    : "Sign in as admin"
                  : mode === "register"
                    ? "Create faculty account"
                    : "Continue to verification"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
