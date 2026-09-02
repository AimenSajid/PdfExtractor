import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Download, FileText, X } from "lucide-react";
import { apiFetch } from "./apiConfig";
import { IconButton } from "./ui";

/**
 * PdfModal -- full-screen modal that renders one extraction's stored PDF.
 *
 * Props contract
 * --------------
 *   extractionId : number   (required) id of the extraction whose PDF to show.
 *                           Changing it refetches; the previous object URL is
 *                           revoked before the new one is created.
 *   filename     : string   (optional) shown in the header and used as the
 *                           dialog's accessible name. Falls back to "Document".
 *   onClose      : fn       (required) called with no arguments when the user
 *                           dismisses via Escape, the backdrop, or the close
 *                           button. The parent owns visibility: this component
 *                           renders unconditionally, so mount it only while the
 *                           modal should be open and unmount it in onClose.
 *                           Nothing here hides itself.
 *
 * Usage:
 *   {openId !== null && (
 *     <PdfModal
 *       extractionId={openId}
 *       filename={file.filename}
 *       onClose={() => setOpenId(null)}
 *     />
 *   )}
 *
 * Notes for the integrator
 * ------------------------
 * - The PDF is fetched through apiFetch (credentials: "include"); a bare fetch
 *   would 401 because the session is an httpOnly cookie.
 * - Rendering uses the browser's built-in PDF viewer in an <iframe>. No pdf.js,
 *   no new dependency. Consequence: while focus is inside that iframe, key
 *   events (including Escape) are handled by the embedded viewer and never reach
 *   this document, so the visible close button is the reliable escape hatch.
 * - A 404 is an expected outcome, not a failure: guest-era and imported rows
 *   have no stored bytes. It is presented as neutral information, distinct from
 *   the 401 "session expired" case.
 */
export default function PdfModal({ extractionId, filename, onClose }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  // { kind: "missing" | "auth" | "server" | "network", message: string }
  const [error, setError] = useState(null);

  const dialogRef = useRef(null);
  const titleId = useId();

  // Keep the latest onClose in a ref so the key/scroll effects can stay mounted
  // for the modal's whole lifetime instead of re-binding on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    onCloseRef.current?.();
  }, []);

  const displayName = filename || "Document";

  // --- fetch the PDF ---------------------------------------------------------
  // The cleanup does three things, and all three matter: aborts the in-flight
  // request, flips `cancelled` so a response that lands after unmount cannot
  // setState, and revokes the object URL. Skipping the revoke would pin the
  // entire PDF in memory for the lifetime of the page.
  useEffect(() => {
    if (extractionId === null || extractionId === undefined) {
      setLoading(false);
      setError({ kind: "missing", message: "No document was selected." });
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    let createdUrl = null;

    setLoading(true);
    setError(null);
    setObjectUrl(null);

    (async () => {
      try {
        const res = await apiFetch(`/api/extractions/${extractionId}/pdf`, {
          signal: controller.signal,
        });

        if (cancelled) return;

        if (!res.ok) {
          setError(describeHttpError(res.status));
          return;
        }

        const blob = await res.blob();
        if (cancelled) return;

        // Some browsers only hand a blob: URL to the built-in viewer when the
        // MIME type is exactly application/pdf, so normalise it.
        const pdfBlob =
          blob.type === "application/pdf"
            ? blob
            : new Blob([blob], { type: "application/pdf" });

        createdUrl = URL.createObjectURL(pdfBlob);
        setObjectUrl(createdUrl);
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        setError({
          kind: "network",
          message:
            "Could not reach the server. Check your connection and try again.",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [extractionId]);

  // --- body scroll lock ------------------------------------------------------
  // Restore the *previous* inline value rather than clearing it, so a page that
  // legitimately set overflow itself is not silently un-set by our cleanup.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // --- focus: move in on open, restore on close ------------------------------
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus the dialog itself (tabIndex={-1}) so screen readers announce the
    // labelled dialog before the user starts tabbing through its controls.
    dialogRef.current?.focus();

    return () => {
      // The trigger may have been unmounted along with the modal (e.g. the row
      // was deleted), so check it is still in the document before focusing it.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  // --- Escape to close + focus trap -----------------------------------------
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = getFocusable(dialog);
      if (focusable.length === 0) {
        // Nothing tabbable inside: keep focus on the dialog container.
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === dialog || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [requestClose]);

  return (
    <div
      // mousedown (not click) so a drag that starts inside the panel and ends on
      // the backdrop does not read as a backdrop dismissal.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(34,51,62,0.35)] p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-[90vh] max-h-[900px] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-xl border border-line-subtle bg-card shadow-float outline-none"
      >
        <div className="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
          <FileText size={18} className="shrink-0 text-muted" />
          <h2
            id={titleId}
            className="flex-1 truncate font-mono text-[12.5px] text-muted"
            title={displayName}
          >
            {displayName}
          </h2>
          {objectUrl && (
            <a
              href={objectUrl}
              download={displayName}
              className="inline-flex h-[34px] shrink-0 items-center gap-2 rounded-button px-3 text-sm font-semibold text-body transition-colors hover:bg-surface-hover"
            >
              <Download size={16} />
              Download
            </a>
          )}
          <IconButton
            label="Close PDF viewer"
            variant="outline"
            className="shrink-0"
            onClick={requestClose}
          >
            <X size={16} />
          </IconButton>
        </div>

        <div className="relative flex-1 bg-sunken">
          {loading && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-subtle">Loading PDF…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex h-full items-center justify-center p-6">
              <div
                className={`max-w-md rounded-card border p-4 text-center text-sm ${
                  error.kind === "missing"
                    ? "border-bronze-200 bg-accent-soft text-bronze-600"
                    : "border-status-red bg-status-red-bg text-status-red"
                }`}
              >
                <p>{error.message}</p>
              </div>
            </div>
          )}

          {!loading && !error && objectUrl && (
            <iframe
              src={objectUrl}
              title={`PDF preview of ${displayName}`}
              className="h-full w-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Map an HTTP status from the PDF endpoint onto something a human can act on. */
function describeHttpError(status) {
  if (status === 404) {
    return {
      kind: "missing",
      message:
        "No PDF is stored for this document. Documents added before PDFs were " +
        "saved -- and those imported from guest mode -- keep their extracted " +
        "details but not the original file.",
    };
  }
  if (status === 401) {
    return {
      kind: "auth",
      message: "Your session has expired. Sign in again to view this PDF.",
    };
  }
  if (status === 403) {
    return {
      kind: "auth",
      message: "You do not have access to this document.",
    };
  }
  if (status >= 500) {
    return {
      kind: "server",
      message:
        "The server could not return this PDF. The stored file may be damaged.",
    };
  }
  return {
    kind: "server",
    message: `Could not load the PDF (error ${status}).`,
  };
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Tabbable descendants of `root`, in document order, skipping hidden ones. */
function getFocusable(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0
  );
}
