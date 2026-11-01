import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../config/axios";
import { useAuth } from "../context/AuthContext";

const initialForm = {
  fullName: "",
  email: "",
  password: "",
  otp: "",
};

export default function AdminAuthPanel({ onBack }) {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState("form");
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  const isRegister = mode === "register";

  function updateForm(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: name === "otp"
        ? value.replace(/\D/g, "").slice(0, 6)
        : value,
    }));
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setStep("form");
    setForm(initialForm);
    setError("");
    setMessage("");
  }

  async function handleResendOtp() {
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (step === "email-verification") {
        const response = await api.post("/auth/send-email-verification-otp", {
          email: form.email.trim(),
        });
        setMessage(
          response.data?.message ||
            "A new verification code has been sent to your email."
        );
      } else if (step === "mfa") {
        const response = await api.post("/auth/admin/login", {
          email: form.email.trim(),
          password: form.password,
        });
        setMessage(
          response.data?.message ||
            "A new MFA code has been sent to your email."
        );
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Please wait a moment before requesting another code."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      // Step 1: Verify the registration email.
      if (step === "email-verification") {
        const response = await api.post("/auth/verify-email", {
          email: form.email,
          otp: form.otp,
        });

        setStep("form");
        setMode("login");
        setForm((previous) => ({
          ...previous,
          password: "",
          otp: "",
        }));

        setMessage(
          response.data?.message ||
            "Email verified successfully. You can now sign in."
        );
        return;
      }

      // Step 2: Verify the login MFA OTP.
      if (step === "mfa") {
        const response = await api.post("/auth/admin/verify-mfa", {
          email: form.email,
          otp: form.otp,
        });

        const userData =
          response.data?.user ??
          response.data?.admin ??
          response.data?.data?.user;

        if (!userData) {
          throw new Error(
            "MFA succeeded but the response did not contain a user object. Check the verifyAdminMfaController response."
          );
        }

        login({
          ...userData,
          role: "admin",
        });

        navigate("/dashboard");
        return;
      }

      // Step 3: Register admin.
      if (isRegister) {
        try {
          await api.post("/auth/admin/register", {
            fullName: form.fullName.trim(),
            email: form.email.trim(),
            password: form.password,
          });
        } catch (regErr) {
          const regErrMsg = regErr.response?.data?.message || regErr.message || "";
          if (
            regErr.response?.status === 409 &&
            regErrMsg.toLowerCase().includes("already exists")
          ) {
            try {
              await api.post("/auth/send-email-verification-otp", {
                email: form.email.trim(),
              });
            } catch {
              // ignore cooldown
            }

            setStep("email-verification");
            setForm((previous) => ({
              ...previous,
              otp: "",
            }));

            setMessage(
              "An account with this email already exists. Please enter the verification code sent to your email to verify it."
            );
            return;
          }
          throw regErr;
        }

        // Request an email verification code.
        try {
          await api.post("/auth/send-email-verification-otp", {
            email: form.email.trim(),
          });
        } catch (otpErr) {
          console.warn("Email OTP dispatch warning:", otpErr);
        }

        setStep("email-verification");
        setForm((previous) => ({
          ...previous,
          otp: "",
        }));

        setMessage(
          "Registration submitted. Check your email for the verification code."
        );
        return;
      }

      // Step 4: Start admin login; the backend initiates MFA.
      await api.post("/auth/admin/login", {
        email: form.email.trim(),
        password: form.password,
      });

      setStep("mfa");
      setForm((previous) => ({
        ...previous,
        otp: "",
      }));

      setMessage("Login accepted. Check your email for the MFA code.");
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || "";

      // Check if email verification is required before login
      if (
        err.response?.status === 403 &&
        (err.response?.data?.code === "EMAIL_VERIFICATION_REQUIRED" ||
          errMsg.toLowerCase().includes("email verification is required") ||
          errMsg.toLowerCase().includes("verify your email"))
      ) {
        try {
          await api.post("/auth/send-email-verification-otp", {
            email: form.email.trim(),
          });
        } catch {
          // ignore cooldown
        }

        setStep("email-verification");
        setForm((previous) => ({
          ...previous,
          otp: "",
        }));
        setMessage(
          "Email verification is required. We have sent a verification code to your email."
        );
        return;
      }

      setError(
        errMsg || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const isOtpStep =
    step === "mfa" || step === "email-verification";

  return (
    <section className="mx-auto w-full max-w-xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-7 text-sm font-medium text-slate-500 hover:text-indigo-600"
      >
        ← Back to role selection
      </button>

      <div className="mb-8">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-2xl text-indigo-700">
          ♙
        </div>

        <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
          SnapClass · Administration
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          {step === "mfa"
            ? "Verify your identity"
            : step === "email-verification"
              ? "Verify your email"
              : isRegister
                ? "Create admin account"
                : "Welcome back"}
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          {step === "mfa"
            ? "Enter the six-digit login code sent to your registered email."
            : step === "email-verification"
              ? "Verify your email before signing in."
              : isRegister
                ? "Create an administrator account to manage users, faculty, and subjects."
                : "Sign in to manage users, faculty, and subjects."}
        </p>
      </div>

      {!isOtpStep && (
        <div className="mb-6 flex rounded-xl bg-slate-100 p-1">
          {["login", "register"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => changeMode(item)}
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

      {message && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-emerald-50 p-3 text-sm leading-5 text-emerald-700"
        >
          {message}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-red-50 p-3 text-sm leading-5 text-red-700"
        >
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {isOtpStep ? (
          <>
            <div>
              <label
                htmlFor="admin-otp-email"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Email address
              </label>
              <input
                id="admin-otp-email"
                type="email"
                value={form.email}
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600"
              />
            </div>

            <div>
              <label
                htmlFor="admin-otp"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Six-digit verification code
              </label>
              <input
                id="admin-otp"
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={form.otp}
                onChange={updateForm}
                placeholder="000000"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-xl tracking-[0.4em] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
              />
              <p className="mt-2 text-xs text-slate-500">
                {step === "mfa"
                  ? "This code verifies your admin login."
                  : "This code verifies your email address."}
              </p>
            </div>
          </>
        ) : (
          <>
            {isRegister && (
              <div>
                <label
                  htmlFor="admin-fullName"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Full name
                </label>
                <input
                  id="admin-fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={form.fullName}
                  onChange={updateForm}
                  placeholder="Enter your full name"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="admin-email"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Email address
              </label>
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={updateForm}
                placeholder="admin@university.edu"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
              />
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={8}
                required
                value={form.password}
                onChange={updateForm}
                placeholder={
                  isRegister ? "At least 8 characters" : "Enter your password"
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
              />
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={
            loading ||
            (step !== "form" && form.otp.length !== 6)
          }
          className="w-full rounded-xl bg-indigo-600 px-5 py-3.5 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Please wait..."
            : step === "mfa"
              ? "Verify and sign in"
              : step === "email-verification"
                ? "Verify email"
                : isRegister
                  ? "Create admin account"
                  : "Continue to verification"}
        </button>

        {isOtpStep && (
          <div className="flex flex-col gap-2 pt-2 text-center">
            <button
              type="button"
              disabled={loading}
              onClick={handleResendOtp}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              Didn't receive the code? Resend OTP
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("form");
                setForm((previous) => ({ ...previous, otp: "" }));
                setError("");
                setMessage("");
              }}
              className="w-full text-sm font-medium text-slate-500 hover:text-indigo-600"
            >
              Back
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
