import { useEffect, useRef, useState } from "react";

// Pick literal Tailwind classes from the accent gradient passed by AuthPage
function getTone(accentClass = "") {
  if (accentClass.includes("emerald")) {
    return {
      focus: "focus:border-emerald-400 focus:ring-emerald-100",
      filled: "border-emerald-300 bg-emerald-50 text-emerald-700",
      link: "text-emerald-600 hover:text-emerald-700",
      bar: "from-emerald-400 to-teal-400",
      shadow: "shadow-emerald-200/70",
    };
  }
  if (
    accentClass.includes("rose") ||
    accentClass.includes("purple") ||
    accentClass.includes("fuchsia")
  ) {
    return {
      focus: "focus:border-rose-400 focus:ring-rose-100",
      filled: "border-rose-300 bg-rose-50 text-rose-700",
      link: "text-rose-600 hover:text-rose-700",
      bar: "from-fuchsia-400 to-rose-400",
      shadow: "shadow-rose-200/70",
    };
  }
  return {
    focus: "focus:border-indigo-400 focus:ring-indigo-100",
    filled: "border-indigo-300 bg-indigo-50 text-indigo-700",
    link: "text-indigo-600 hover:text-indigo-700",
    bar: "from-indigo-400 to-sky-400",
    shadow: "shadow-indigo-200/70",
  };
}

export default function OtpForm({
  badge = "SECURITY VERIFICATION",
  title,
  description,
  email,
  accentClass = "from-indigo-500 to-cyan-500",
  loading = false,
  onSubmit,
  onResend,
  onBack,
}) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [expirySeconds, setExpirySeconds] = useState(600);
  const inputsRef = useRef([]);
  const tone = getTone(accentClass);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      setExpirySeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const otpCode = digits.join("");

  function handleDigitChange(index, val) {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    const char = clean.slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);

    if (index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i += 1) {
      next[i] = pasted[i];
    }
    setDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    inputsRef.current[focusIdx]?.focus();
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    if (otpCode.length === 6 && !loading) {
      await onSubmit(otpCode);
    }
  }

  async function triggerResend() {
    if (resendCooldown > 0 || loading || !onResend) return;
    await onResend();
    setResendCooldown(30);
    setExpirySeconds(600);
    setDigits(["", "", "", "", "", ""]);
    inputsRef.current[0]?.focus();
  }

  const minutes = String(Math.floor(expirySeconds / 60)).padStart(2, "0");
  const seconds = String(expirySeconds % 60).padStart(2, "0");
  const expiryPct = Math.round((expirySeconds / 600) * 100);
  const expiring = expirySeconds > 0 && expirySeconds <= 60;

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 3v6c0 4.5-3.2 8.3-8 9-4.8-.7-8-4.5-8-9V6l8-3z" />
          </svg>
          {badge}
        </span>
        <h3 className="sc-display mt-3 text-2xl font-bold text-slate-800 sm:text-3xl">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{description}</p>
        {email && (
          <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <span className="truncate">
              Code sent to <strong className="font-semibold">{email}</strong>
            </span>
          </div>
        )}
      </div>

      {/* 6 OTP boxes */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-600">Enter the 6-digit code</span>
          <span className={`font-medium tabular-nums ${expiring ? "text-rose-500" : "text-slate-400"}`}>
            {expirySeconds > 0 ? `Expires in ${minutes}:${seconds}` : "Code expired. Request a new one."}
          </span>
        </div>

        <div className="grid grid-cols-6 gap-2 sm:gap-3" onPaste={handlePaste}>
          {digits.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => {
                inputsRef.current[idx] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={idx === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={digit}
              aria-label={`Digit ${idx + 1}`}
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className={`aspect-square w-full rounded-2xl border text-center text-2xl font-bold outline-none transition-all duration-200 focus:ring-4 ${
                digit ? `${tone.filled} scale-[1.04]` : "border-slate-200 bg-white text-slate-800"
              } ${tone.focus}`}
            />
          ))}
        </div>

        {/* Expiry bar */}
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${expiring ? "from-rose-400 to-rose-500" : tone.bar} transition-all duration-1000 ease-linear`}
            style={{ width: `${expiryPct}%` }}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || otpCode.length !== 6}
        className={`w-full cursor-pointer rounded-xl bg-gradient-to-r ${accentClass} px-5 py-3.5 text-sm font-semibold text-white shadow-lg ${tone.shadow} transition duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:translate-y-0`}
      >
        {loading ? "Verifying..." : "Verify and continue"}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="cursor-pointer font-medium text-slate-500 transition hover:text-slate-800 disabled:opacity-50"
        >
          ← Change details
        </button>

        {onResend && (
          <button
            type="button"
            onClick={triggerResend}
            disabled={loading || resendCooldown > 0}
            className={`cursor-pointer font-semibold transition disabled:cursor-not-allowed disabled:text-slate-300 ${tone.link}`}
          >
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
          </button>
        )}
      </div>
    </form>
  );
}