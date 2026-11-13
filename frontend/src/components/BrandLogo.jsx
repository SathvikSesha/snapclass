// components/BrandLogo.jsx
export default function BrandLogo({ size = "md", showText = true }) {
  const box = size === "sm" ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-2xl";
  const icon = size === "sm" ? "h-5 w-5" : "h-6 w-6";

  return (
    <span className="group inline-flex items-center gap-3">
      <span
        className={`flex ${box} items-center justify-center bg-gradient-to-br from-indigo-400 to-sky-400 text-white shadow-lg shadow-indigo-200/70 transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-105`}
      >
        <svg
          className={`${icon} transition-transform duration-700 group-hover:rotate-90`}
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
      </span>
      {showText && (
        <span className="sc-display text-lg font-bold tracking-tight text-slate-800">
          SnapClass
        </span>
      )}
    </span>
  );
}

