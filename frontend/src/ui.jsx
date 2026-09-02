import React, { useRef, useState } from "react";
import { CloudUpload } from "lucide-react";

// Shared visual primitives for the app's design system (colors/radius/shadows
// come from the CSS variables in styles.css, wired into tailwind.config.cjs).
// Kept presentational and behaviour-free -- callers own state and handlers.

const BUTTON_VARIANTS = {
  primary: "bg-primary text-primary-text border border-transparent hover:bg-primary-hover",
  secondary: "bg-secondary-bg text-secondary-text border border-secondary-border hover:bg-surface-hover",
  ghost: "bg-transparent text-body border border-transparent hover:bg-surface-hover",
};

const BUTTON_SIZES = {
  sm: "h-[34px] px-3 text-[13.5px]",
  md: "h-10 px-4 text-[15px]",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...props
}) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center gap-2 rounded-button font-semibold transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ tone = "card", className = "", children, ...props }) {
  const bg = tone === "sunken" ? "bg-sunken" : "bg-card";
  return (
    <div
      className={`rounded-card border border-line-subtle ${bg} shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-sunken text-muted border border-line-subtle",
  info: "bg-status-blue-bg text-status-blue border border-transparent",
  success: "bg-status-green-bg text-status-green border border-transparent",
  danger: "bg-status-red-bg text-status-red border border-transparent",
};

export function Badge({ tone = "neutral", className = "", children }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const ICON_BUTTON_VARIANTS = {
  default: "bg-transparent border border-transparent hover:bg-surface-hover text-muted",
  outline: "bg-card border border-line-strong hover:bg-surface-hover text-muted",
};

export function IconButton({
  label,
  variant = "default",
  className = "",
  children,
  ...props
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-input transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        ICON_BUTTON_VARIANTS[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}

export function Avatar({ name, picture, size = 30 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (picture) {
    return (
      <img
        src={picture}
        alt=""
        referrerPolicy="no-referrer"
        className="rounded-full object-cover"
        style={style}
      />
    );
  }
  const initials = (name || "")
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-primary font-semibold text-primary-text"
      style={style}
    >
      {initials || "?"}
    </span>
  );
}

export function BackLink({ label, ...props }) {
  return (
    <button
      type="button"
      className="text-sm text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
      {...props}
    >
      {label}
    </button>
  );
}

// Drag-and-drop file picker. Presentational + the drag/drop and file-input
// wiring; the caller decides what a selected file means (onFileSelected).
export function Dropzone({
  title = "Drag & drop your PDF here",
  buttonLabel = "Choose File",
  formats = "PDF",
  maxSizeLabel,
  accept,
  onFileSelected,
  className = "",
}) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (fileList) => {
    const file = fileList?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={[
        "flex flex-col items-center justify-center gap-3 rounded-dropzone border-2 border-dashed px-6 py-10 text-center transition-colors",
        dragActive ? "border-accent bg-accent-soft" : "border-line-dashed bg-page-alt",
        className,
      ].join(" ")}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-bronze-600">
        <CloudUpload size={20} />
      </div>
      <p className="text-[15px] font-semibold text-strong">{title}</p>
      <p className="text-xs text-subtle">
        {formats}
        {maxSizeLabel ? ` · up to ${maxSizeLabel}` : ""}
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-1 inline-flex h-9 items-center rounded-button border border-secondary-border bg-secondary-bg px-4 text-sm font-semibold text-secondary-text transition-colors hover:bg-surface-hover"
      >
        {buttonLabel}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
    </div>
  );
}
