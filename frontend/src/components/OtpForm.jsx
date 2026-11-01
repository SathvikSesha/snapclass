import { useState } from "react";

export default function OtpForm({
  title,
  description,
  value,
  onChange,
  onSubmit,
  loading = false,
  onBack,
  onResend,
}) {
  const [internalOtp, setInternalOtp] = useState("");

  const currentOtp = value !== undefined ? value : internalOtp;

  function handleInputChange(event) {
    const nextVal = event.target.value.replace(/\D/g, "").slice(0, 6);
    if (onChange) {
      onChange(nextVal);
    } else {
      setInternalOtp(nextVal);
    }
  }

  async function handleSubmit(event) {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    if (currentOtp.trim().length === 6 && onSubmit) {
      await onSubmit(currentOtp.trim());
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div>
        <h3 className="text-xl font-bold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </div>

      <div>
        <label htmlFor="otp" className="mb-2 block text-sm font-medium text-slate-700">
          Six-digit verification code
        </label>

        <input
          id="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={currentOtp}
          onChange={handleInputChange}
          placeholder="e.g. 123456"
          required
          autoFocus
          className="w-full text-center text-2xl font-mono tracking-widest rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
        />
      </div>

      <button
        type="submit"
        disabled={loading || currentOtp.trim().length !== 6}
        className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2 justify-center">
            <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Verifying code...
          </span>
        ) : (
          "Verify OTP"
        )}
      </button>

      <div className="flex flex-col gap-2 pt-2 text-center">
        {onResend && (
          <button
            type="button"
            disabled={loading}
            onClick={onResend}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition"
          >
            Didn't receive the code? Resend OTP
          </button>
        )}

        {onBack && (
          <button
            type="button"
            disabled={loading}
            onClick={onBack}
            className="text-sm text-slate-500 hover:text-slate-800 transition"
          >
            ← Back to sign in
          </button>
        )}
      </div>
    </form>
  );
}
