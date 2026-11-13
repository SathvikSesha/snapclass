import { useEffect, useRef, useState } from "react";

export default function CameraCapture({
  onCapture,
  onCancel,
  modeLabel = "Biometric Face Scan",
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsReady(true);
        }
      } catch {
        if (mounted) {
          setError(
            "Camera permission denied or no webcam detected. Please allow camera access in your browser."
          );
        }
      }
    }

    initCamera();

    return () => {
      mounted = false;
      clearInterval(countdownTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function takeSnapshot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("Camera sensor is still calibrating. Please wait a second.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `biometric-scan-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          onCapture(file);
        } else {
          setError("Frame capture failed. Please try again.");
        }
      },
      "image/jpeg",
      0.95
    );
  }

  function triggerCountdownCapture() {
    if (!isReady || countdown !== null) return;
    let current = 3;
    setCountdown(current);

    countdownTimerRef.current = setInterval(() => {
      current -= 1;
      if (current <= 0) {
        clearInterval(countdownTimerRef.current);
        setCountdown(null);
        takeSnapshot();
      } else {
        setCountdown(current);
      }
    }, 650);
  }

  return (
    <div className="cc-enter relative overflow-hidden rounded-3xl border border-white bg-white/90 p-4 shadow-xl shadow-slate-200/70">
      <style>{`
        @keyframes cc-enter { from { opacity: 0; transform: translateY(10px) scale(.99); } to { opacity: 1; transform: none; } }
        @keyframes cc-scan { 0% { top: 8%; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { top: 92%; opacity: 0; } }
        @keyframes cc-count { 0% { transform: scale(.4); opacity: 0; } 40% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes cc-breathe { 0%,100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.025); opacity: 1; } }
        .cc-enter { animation: cc-enter .45s cubic-bezier(.22,1,.36,1) both; }
        .cc-scan { animation: cc-scan 2.6s ease-in-out infinite; }
        .cc-count { animation: cc-count .5s cubic-bezier(.34,1.56,.64,1) both; }
        .cc-breathe { animation: cc-breathe 3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .cc-enter, .cc-scan, .cc-count, .cc-breathe { animation: none; } }
      `}</style>

      {/* Status bar */}
      <div className="mb-3 flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${
                isReady ? "animate-ping bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                isReady ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
          </span>
          {modeLabel}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            isReady ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
          }`}
        >
          {isReady ? "Camera ready" : "Starting camera..."}
        </span>
      </div>

      {/* Viewfinder */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-100">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full scale-x-[-1] object-cover"
        />

        {/* Loading placeholder */}
        {!isReady && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-100 to-slate-200">
            <svg className="h-9 w-9 animate-pulse text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8a2 2 0 012-2h2l1.5-2h5L16 6h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
            </svg>
            <p className="text-xs font-medium text-slate-400">Waiting for camera access</p>
          </div>
        )}

        {/* Scan line */}
        {isReady && !error && (
          <div className="cc-scan pointer-events-none absolute inset-x-8 h-0.5 rounded-full bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_14px_rgba(255,255,255,0.9)]" />
        )}

        {/* Face guide */}
        {isReady && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="cc-breathe h-44 w-36 rounded-full border-2 border-dashed border-white/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.18)] sm:h-52 sm:w-40" />
          </div>
        )}

        {/* Corner brackets */}
        <div className="pointer-events-none absolute top-3 left-3 h-6 w-6 rounded-tl-lg border-t-2 border-l-2 border-white/90" />
        <div className="pointer-events-none absolute top-3 right-3 h-6 w-6 rounded-tr-lg border-t-2 border-r-2 border-white/90" />
        <div className="pointer-events-none absolute bottom-3 left-3 h-6 w-6 rounded-bl-lg border-b-2 border-l-2 border-white/90" />
        <div className="pointer-events-none absolute right-3 bottom-3 h-6 w-6 rounded-br-lg border-r-2 border-b-2 border-white/90" />

        {/* Tip */}
        {isReady && countdown === null && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] font-medium text-white drop-shadow">
            Center your face in the oval
          </p>
        )}

        {/* Countdown */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
            <span key={countdown} className="cc-count sc-display text-7xl font-extrabold text-white drop-shadow-lg">
              {countdown}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Controls */}
      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={!isReady || countdown !== null}
          onClick={takeSnapshot}
          className="flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
        >
          Take photo
        </button>

        <button
          type="button"
          disabled={!isReady || countdown !== null}
          onClick={triggerCountdownCapture}
          className="cursor-pointer rounded-xl bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          3s timer
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[.98]"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}