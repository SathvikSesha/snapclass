import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../config/axios";
import { useAuth } from "../context/AuthContext";
import OtpForm from "../components/OtpForm";
import CameraCapture from "../components/CameraCapture";
import AdminAuthPanel from "../components/AdminAuthPanel";
import StaffAuthPanel from "../components/StaffAuthPanel";

const roles = [
  {
    type: "student",
    label: "Student",
    description: "Access courses and attendance",
  },
  {
    type: "faculty",
    label: "Faculty",
    description: "Manage classes and students",
  },
  {
    type: "admin",
    label: "Admin",
    description: "Manage the platform",
  },
];

const initialForm = {
  fullName: "",
  email: "",
  password: "",
};

function extractErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (!err) return fallback;

  if (typeof err.response?.data?.message === "string" && err.response.data.message.trim()) {
    return err.response.data.message;
  }

  if (typeof err.response?.data?.error === "string" && err.response.data.error.trim()) {
    return err.response.data.error;
  }

  if (typeof err.response?.data?.detail === "string" && err.response.data.detail.trim()) {
    return err.response.data.detail;
  }

  if (typeof err.response?.data === "string" && err.response.data.trim()) {
    const trimmed = err.response.data.trim();
    if (!trimmed.startsWith("<!DOCTYPE") && !trimmed.startsWith("<html")) {
      return trimmed;
    }
  }

  if (err.response?.status === 429) {
    return "Too many requests. Please wait a moment before trying again.";
  }
  if (err.response?.status === 401) {
    return "Invalid email, password, or biometric credentials.";
  }
  if (err.response?.status === 403) {
    return "Access restricted or email verification required.";
  }
  if (err.response?.status === 404) {
    return "Account or service was not found.";
  }
  if (err.response?.status === 409) {
    return "An account with these credentials already exists.";
  }
  if (err.response?.status === 502 || err.response?.status === 503) {
    return "Face recognition or authentication service is temporarily unavailable. Please try again.";
  }

  if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
    return "Unable to connect to the backend server. Please check your network connection.";
  }

  if (typeof err.message === "string" && err.message && !err.message.includes("is not a function")) {
    return err.message;
  }

  return fallback;
}

function StudentAuthForm({
  mode,
  loginMethod,
  step,
  form,
  faceImage,
  facePreview,
  voiceFile,
  otp,
  cameraOpen,
  message,
  error,
  loading,
  isRegister,
  isOtpStep,
  currentRole,
  changeMode,
  changeLoginMethod,
  updateForm,
  handleSubmit,
  handleVerifyOtp,
  handleResendOtp,
  handleFileSelection,
  handleCameraCapture,
  setFaceImage,
  setVoiceFile,
  setCameraOpen,
  setStep,
  setOtp,
  resetMessages,
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold capitalize text-indigo-600">
            Student account
          </p>

          <h2 className="mt-1 text-2xl font-bold">
            {step === "mfa"
              ? "Verify your login"
              : step === "email-verification"
                ? "Verify your email"
                : isRegister
                  ? "Create your account"
                  : "Sign in"}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            {currentRole.description}
          </p>
        </div>

        {!isOtpStep && (
          <div className="flex rounded-lg bg-slate-100 p-1">
            {["login", "register"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeMode(item)}
                className={`rounded-md px-4 py-2 text-sm font-medium capitalize ${
                  mode === item
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      {message && (
        <p
          role="status"
          className="mt-6 rounded-lg bg-green-50 p-3 text-sm text-green-800"
        >
          {message}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {isOtpStep ? (
        <OtpForm
          title={
            step === "mfa"
              ? "Two-step verification"
              : "Email verification"
          }
          description={
            step === "email-verification"
              ? `Enter the 6-digit code sent to ${form.email}.`
              : loginMethod === "face"
                ? `Enter the 6-digit code sent to ${form.email || "your registered email"}.`
                : `Enter the 6-digit code sent to ${form.email}.`
          }
          value={otp}
          onChange={setOtp}
          onSubmit={handleVerifyOtp}
          onResend={handleResendOtp}
          loading={loading}
          onBack={() => {
            setStep("form");
            setOtp("");
            setCameraOpen(false);
            resetMessages();
          }}
        />
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-5"
        >
          {isRegister && (
            <div>
              <label
                htmlFor="fullName"
                className="mb-2 block text-sm font-medium"
              >
                Full name
              </label>

              <input
                id="fullName"
                name="fullName"
                value={form.fullName}
                onChange={updateForm}
                autoComplete="name"
                required
                placeholder="Enter your full name"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          )}

          {(isRegister || loginMethod === "password") && (
            <>
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium"
                >
                  Email address
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={updateForm}
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium"
                >
                  Password
                </label>

                <input
                  id="password"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={updateForm}
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                  minLength={isRegister ? 12 : undefined}
                  required
                  placeholder={
                    isRegister
                      ? "At least 12 characters"
                      : "Enter your password"
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </>
          )}

          {!isRegister && (
            <div>
              <p className="mb-2 text-sm font-medium">
                Choose login method
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => changeLoginMethod("password")}
                  className={`rounded-lg border p-3 text-sm font-medium ${
                    loginMethod === "password"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  Email & password
                </button>

                <button
                  type="button"
                  onClick={() => changeLoginMethod("face")}
                  className={`rounded-lg border p-3 text-sm font-medium ${
                    loginMethod === "face"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  Face recognition
                </button>
              </div>
            </div>
          )}

          {(isRegister ||
            (!isRegister && loginMethod === "face")) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-semibold text-slate-800">
                  {isRegister ? "Face photo enrollment" : "Face recognition photo"}
                  <span className="ml-1 text-red-500">*</span>
                </label>
                {faceImage && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Photo ready
                  </span>
                )}
              </div>

              <p className="mb-3 text-xs text-slate-500">
                {isRegister
                  ? "A clear photo of your face is required for biometric authentication (JPEG, PNG, or WebP up to 5MB)."
                  : "Provide a face image to recognize your account (JPEG, PNG, or WebP up to 5MB)."}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCameraOpen(true);
                    resetMessages();
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {cameraOpen ? "Camera open" : "Use camera"}
                </button>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition">
                  <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Upload image
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileSelection}
                  />
                </label>

                {faceImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setFaceImage(null);
                      resetMessages();
                    }}
                    className="ml-auto text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
                  >
                    Remove photo
                  </button>
                )}
              </div>

              {cameraOpen && (
                <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-700">
                    Live camera
                  </p>
                  <CameraCapture
                    onCapture={handleCameraCapture}
                    onCancel={() => setCameraOpen(false)}
                  />
                </div>
              )}

              {faceImage && facePreview && (
                <div className="mt-4 flex items-center gap-3.5 rounded-xl border border-green-200 bg-green-50/70 p-3">
                  <img
                    src={facePreview}
                    alt="Selected face preview"
                    className="h-16 w-16 rounded-lg border border-green-300 object-cover shadow-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-green-900" title={faceImage.name}>
                      {faceImage.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-green-700">
                      {faceImage.size ? `${(faceImage.size / 1024).toFixed(1)} KB` : "Captured image"} • Ready to submit
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {isRegister && (
            <div className="rounded-xl border border-slate-200 p-4">
              <label
                htmlFor="voiceFile"
                className="block text-sm font-medium"
              >
                Optional voice sample
              </label>

              <p className="mt-1 text-sm text-slate-500">
                You can choose an audio sample for future voice enrollment.
                It will not be uploaded because the existing registration
                endpoint accepts only the face image.
              </p>

              <input
                id="voiceFile"
                type="file"
                accept="audio/*"
                onChange={(event) =>
                  setVoiceFile(event.target.files?.[0] ?? null)
                }
                className="mt-3 block w-full text-sm"
              />

              {voiceFile && (
                <p className="mt-2 text-xs text-slate-500">
                  Selected: {voiceFile.name}
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : isRegister
                ? "Create student account"
                : "Continue"}
          </button>
        </form>
      )}
    </>
  );
}

export default function AuthPage() {
  const [selectedRole, setSelectedRole] = useState("student");
  const [mode, setMode] = useState("login");
  const [loginMethod, setLoginMethod] = useState("password");

  const [form, setForm] = useState(initialForm);
  const [faceImage, setFaceImage] = useState(null);
  const [facePreview, setFacePreview] = useState(null);
  const [voiceFile, setVoiceFile] = useState(null);

  const [step, setStep] = useState("form");
  const [otp, setOtp] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const isStudent = selectedRole === "student";
  const isRegister = mode === "register";
  const isOtpStep =
    step === "mfa" || step === "email-verification";

  // Clean object URL on image change / unmount
  useEffect(() => {
    if (!faceImage) {
      setFacePreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(faceImage);
    setFacePreview(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [faceImage]);

  function updateForm(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function resetMessages() {
    setMessage("");
    setError("");
  }

  function changeRole(role) {
    setSelectedRole(role);
    setMode("login");
    setLoginMethod("password");
    setStep("form");
    setForm(initialForm);
    setOtp("");
    setFaceImage(null);
    setVoiceFile(null);
    setCameraOpen(false);
    resetMessages();
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setStep("form");
    setOtp("");
    setFaceImage(null);
    setVoiceFile(null);
    setCameraOpen(false);
    resetMessages();
  }

  function changeLoginMethod(method) {
    setLoginMethod(method);
    setFaceImage(null);
    setCameraOpen(false);
    resetMessages();
  }

  function handleFileSelection(event) {
    const file = event.target.files?.[0];
    // Reset input value so re-selecting the same file triggers onChange
    event.target.value = "";

    if (!file) {
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Please select a valid image (JPEG, PNG, or WebP).");
      return;
    }

    // Backend limit is 5MB
    if (file.size > 5 * 1024 * 1024) {
      setError("Image file size must be less than 5MB.");
      return;
    }

    setFaceImage(file);
    setCameraOpen(false);
    setMessage(`Face image "${file.name}" selected successfully.`);
    setError("");
  }

  function handleCameraCapture(file) {
    if (!file) {
      setError("Unable to capture image from camera.");
      return;
    }
    setFaceImage(file);
    setCameraOpen(false);
    setMessage("Face photo captured successfully.");
    setError("");
  }

  async function handleRegistration() {
    if (!faceImage) {
      setError("A face image is required. Please upload or capture a face image.");
      return;
    }

    const data = new FormData();
    data.append("fullName", form.fullName.trim());
    data.append("email", form.email.trim().toLowerCase());
    data.append("password", form.password);
    data.append("faceImage", faceImage, faceImage.name || "face-image.jpg");

    let response;
    try {
      response = await api.post("/auth/student/register", data);
    } catch (regErr) {
      const errMsg = extractErrorMessage(regErr);
      // If user already registered but unverified, direct them to verify
      if (regErr.response?.status === 409 && errMsg.toLowerCase().includes("already exists")) {
        try {
          await api.post("/auth/send-email-verification-otp", {
            email: form.email.trim().toLowerCase(),
          });
        } catch {
          // Ignore cooldown or rate limit
        }
        setStep("email-verification");
        setMessage("An account with this email already exists. Please verify your email with the OTP.");
        return;
      }
      throw regErr;
    }

    try {
      await api.post("/auth/send-email-verification-otp", {
        email: form.email.trim().toLowerCase(),
      });
    } catch (otpErr) {
      console.warn("OTP dispatch warning:", otpErr);
    }

    setStep("email-verification");
    setMessage(
      response?.data?.message ||
        "Registration successful! Check your email for the verification OTP."
    );
  }

  async function handlePasswordLogin() {
    try {
      await api.post("/auth/student/login", {
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      setStep("mfa");
      setMessage("Verification OTP sent to your registered email.");
    } catch (err) {
      if (err.response?.data?.code === "EMAIL_VERIFICATION_REQUIRED") {
        try {
          await api.post("/auth/send-email-verification-otp", {
            email: form.email.trim().toLowerCase(),
          });
        } catch {
          // Ignore cooldown
        }
        setStep("email-verification");
        setMessage(
          "Your email is not verified yet. We have sent a verification code to your email."
        );
        return;
      }
      throw err;
    }
  }

  async function handleFaceLogin() {
    if (!faceImage) {
      setError("A face image is required. Please capture or upload your face image.");
      return;
    }

    const data = new FormData();
    data.append("faceImage", faceImage, faceImage.name || "face-image.jpg");

    try {
      const response = await api.post("/auth/student/face-login", data);

      if (response.data?.email) {
        setForm((previous) => ({
          ...previous,
          email: response.data.email,
        }));
      }

      setStep("mfa");
      setMessage(
        response.data?.message ||
          "If your face was recognized, a verification OTP was sent to your registered email."
      );
    } catch (err) {
      if (err.response?.data?.code === "EMAIL_VERIFICATION_REQUIRED") {
        setStep("email-verification");
        setMessage(
          "Your email is not verified yet. Please enter the verification OTP sent to your email."
        );
        return;
      }
      throw err;
    }
  }

  async function handleVerifyOtp(submittedOtp) {
    resetMessages();
    const code = (typeof submittedOtp === "string" ? submittedOtp : otp).trim();

    if (!code || !/^\d{6}$/.test(code)) {
      setError("Please enter a valid 6-digit OTP code.");
      return;
    }

    setLoading(true);

    if (step === "email-verification") {
      try {
        const response = await api.post("/auth/verify-email", {
          email: form.email.trim().toLowerCase(),
          otp: code,
        });

        setMessage(
          response.data?.message || "Email verified successfully! You can now sign in."
        );
        setStep("form");
        setMode("login");
        setOtp("");
      } catch (err) {
        setError(
          extractErrorMessage(
            err,
            "Failed to verify email OTP. Please check the code and try again."
          )
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (step === "mfa") {
      const emailToUse = (form.email || "").trim().toLowerCase();
      if (!emailToUse) {
        setError("Account email is required to verify the login OTP.");
        setLoading(false);
        return;
      }

      try {
        const response = await api.post("/auth/student/verify-mfa", {
          email: emailToUse,
          otp: code,
        });

        login(response.data.user);
        navigate("/dashboard");
      } catch (err) {
        setError(
          extractErrorMessage(
            err,
            "Invalid or expired login code. Please try again."
          )
        );
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleResendOtp() {
    resetMessages();
    const emailToUse = (form.email || "").trim().toLowerCase();
    if (!emailToUse) {
      setError("Account email is required to resend the verification code.");
      return;
    }

    setLoading(true);
    try {
      if (step === "email-verification") {
        const response = await api.post("/auth/send-email-verification-otp", {
          email: emailToUse,
        });
        setMessage(
          response.data?.message ||
            "A new verification code has been sent to your email."
        );
      } else {
        if (loginMethod === "password" && form.password) {
          const response = await api.post("/auth/student/login", {
            email: emailToUse,
            password: form.password,
          });
          setMessage(
            response.data?.message ||
              "A new verification code has been sent to your email."
          );
        } else {
          setMessage("To receive a new login code, please recapture your face photo.");
        }
      }
    } catch (err) {
      setError(
        extractErrorMessage(
          err,
          "Please wait a moment before requesting another code."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    resetMessages();

    // 1. Role validation — staff roles are handled by StaffAuthPanel
    if (!isStudent) {
      return;
    }

    // 2. Immediate client-side validations before registration submission
    if (isRegister) {
      if (!form.fullName.trim()) {
        setError("Please enter your full name.");
        return;
      }
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        setError("Please enter a valid email address.");
        return;
      }
      if (!form.password || form.password.length < 12) {
        setError("Password must be at least 12 characters.");
        return;
      }
      if (!faceImage) {
        setError("A face image is required. Please upload or capture a face image.");
        return;
      }

      setLoading(true);
      try {
        await handleRegistration();
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    // 3. Immediate client-side validations before login submission
    if (loginMethod === "face") {
      if (!faceImage) {
        setError("A face image is required. Please capture or upload your face image to log in.");
        return;
      }

      setLoading(true);
      try {
        await handleFaceLogin();
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    // Password login validation
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!form.password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      await handlePasswordLogin();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const currentRole = roles.find(
    (role) => role.type === selectedRole
  );

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 text-center">
        <span className="rounded-full bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-700">
          SNAPCLASS AUTHENTICATION
        </span>

        <h1 className="mt-5 text-3xl font-bold sm:text-4xl">
          Welcome to SnapClass
        </h1>

        <p className="mt-3 text-slate-600">
          One platform for your entire classroom.
        </p>
      </div>

      <div className="grid min-h-[540px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[1fr_3fr]">
        <aside className="bg-slate-100 p-5 sm:p-7">
          <h2 className="mb-5 text-xs font-bold uppercase tracking-wider text-slate-500">
            Continue as
          </h2>

          <div className="flex gap-2 md:flex-col">
            {roles.map((role) => (
              <button
                key={role.type}
                type="button"
                onClick={() => changeRole(role.type)}
                className={`flex-1 rounded-xl border p-3 text-left ${
                  selectedRole === role.type
                    ? "border-indigo-600 bg-white text-indigo-700 shadow-sm"
                    : "border-transparent hover:bg-white"
                }`}
              >
                <span className="font-semibold">{role.label}</span>

                <span className="mt-1 hidden text-xs text-slate-500 sm:block">
                  {role.description}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="p-6 sm:p-10">
          {!isStudent ? (
            selectedRole === "admin" ? (
              <AdminAuthPanel
                onBack={() => changeRole("student")}
              />
            ) : (
              <StaffAuthPanel
                role="faculty"
                onBack={() => changeRole("student")}
              />
            )
          ) : (
            <StudentAuthForm
              mode={mode}
              loginMethod={loginMethod}
              step={step}
              form={form}
              faceImage={faceImage}
              facePreview={facePreview}
              voiceFile={voiceFile}
              otp={otp}
              cameraOpen={cameraOpen}
              message={message}
              error={error}
              loading={loading}
              isRegister={isRegister}
              isOtpStep={isOtpStep}
              currentRole={currentRole}
              changeMode={changeMode}
              changeLoginMethod={changeLoginMethod}
              updateForm={updateForm}
              handleSubmit={handleSubmit}
              handleVerifyOtp={handleVerifyOtp}
              handleResendOtp={handleResendOtp}
              handleFileSelection={handleFileSelection}
              handleCameraCapture={handleCameraCapture}
              setFaceImage={setFaceImage}
              setVoiceFile={setVoiceFile}
              setCameraOpen={setCameraOpen}
              setStep={setStep}
              setOtp={setOtp}
              resetMessages={resetMessages}
            />
          )}
        </div>
      </div>
    </section>
  );
}
