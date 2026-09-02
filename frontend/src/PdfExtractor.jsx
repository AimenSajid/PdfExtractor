import React, { useState } from "react";
import { FileText } from "lucide-react";
import { apiFetch } from "./apiConfig";
import { Button, Card, Dropzone } from "./ui";

// Checked here as well as on the server, because the host may reject an
// oversized request before it ever reaches our code — on Vercel the ceiling is
// 4.5MB, and what comes back is a platform error page rather than our own
// message. Catching it before the upload starts gives the user a sentence that
// explains itself.
const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 4;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export default function PdfExtractor({ onExtracted }) {
  const [file, setFile] = useState(null);
  // The Dropzone owns an uncontrolled file input internally; remounting it via
  // this key is what actually clears its selection on Reset (a browser file
  // input's change event does not fire again for re-picking the same file
  // otherwise).
  const [resetCount, setResetCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSlowMessage, setShowSlowMessage] = useState(false);

  function handleFileSelected(selected) {
    setFile(selected);
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setError(
        `That file is ${mb} MB. The limit is ${MAX_UPLOAD_MB} MB — try a smaller PDF.`
      );
      return;
    }

    setLoading(true);
    setError(null);
    const slowTimer = setTimeout(() => setShowSlowMessage(true), 5000);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await apiFetch("/api/extract", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        // FastAPI reports errors as {"detail": "..."}; show that sentence rather
        // than dumping the raw JSON envelope at the user.
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Server error (${res.status})`);
      }

      const data = await res.json();
      onExtracted(data);
      // Clear the form so the dropzone doesn't keep showing the file that was
      // just extracted -- Reset also bumps resetCount to remount the Dropzone's
      // hidden input, otherwise re-picking the same file next time wouldn't
      // fire a change event.
      setFile(null);
      setResetCount((n) => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      clearTimeout(slowTimer);
      setShowSlowMessage(false);
      setLoading(false);
    }
  }

  function handleReset() {
    setFile(null);
    setError(null);
    setResetCount((n) => n + 1);
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit}>
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <Dropzone
            key={resetCount}
            title="Drag & drop your PDF here"
            formats="PDF"
            maxSizeLabel={`${MAX_UPLOAD_MB}MB`}
            buttonLabel="Choose File"
            accept="application/pdf"
            onFileSelected={handleFileSelected}
          />

          <div className="flex flex-col gap-4">
            <div>
              <h2 className="mb-2 font-display text-xl font-bold tracking-tight text-strong">
                Upload a paper
              </h2>
              <p className="text-sm leading-relaxed text-muted">
                We read the PDF to pull out title, authors, year, DOI, URL,
                abstract and conclusion.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-input border border-line-subtle bg-sunken px-3.5 py-3">
              <FileText size={17} className="shrink-0 text-muted" />
              <span className="flex-1 truncate text-sm text-body">
                {file ? file.name : `No file chosen — max ${MAX_UPLOAD_MB}MB`}
              </span>
            </div>

            {loading && (
              <div className="flex flex-col gap-2">
                <span className="text-sm text-body">Extracting metadata…</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-line-subtle">
                  <div
                    className="h-full w-[30%] rounded-full bg-accent"
                    style={{ animation: "barslide 1.1s cubic-bezier(0.2,0.8,0.2,1) infinite" }}
                  />
                </div>
                {showSlowMessage && (
                  <p className="text-sm text-accent">This may take a while…</p>
                )}
              </div>
            )}

            <div className="flex gap-2.5">
              <Button type="submit" disabled={!file || loading}>
                {loading ? "Processing…" : "Upload & Extract"}
              </Button>
              <Button type="button" variant="secondary" onClick={handleReset}>
                Reset
              </Button>
            </div>

            {error && <p className="text-sm text-status-red">{error}</p>}
          </div>
        </div>
      </form>
    </Card>
  );
}
