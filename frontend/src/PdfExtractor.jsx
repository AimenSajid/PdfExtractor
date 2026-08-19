import React, { useRef, useState } from "react";
import { apiFetch } from "./apiConfig";

// Checked here as well as on the server, because the host may reject an
// oversized request before it ever reaches our code — on Vercel the ceiling is
// 4.5MB, and what comes back is a platform error page rather than our own
// message. Catching it before the upload starts gives the user a sentence that
// explains itself.
const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 4;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export default function PdfExtractor({ onExtracted }) {
  const [file, setFile] = useState(null);
  // A file input is uncontrolled -- React cannot drive its value, so clearing
  // the `file` state alone leaves the chosen filename on screen. Resetting the
  // DOM node is the only way to actually deselect it.
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSlowMessage, setShowSlowMessage] = useState(false);
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
    } catch (err) {
      setError(err.message);
    } finally {
      clearTimeout(slowTimer);
      setShowSlowMessage(false);
      setLoading(false);
    }
  }
  const handleReset = () => {
    setFile(null);
    setError(null);
    // Clearing the state is not enough -- without this the filename stays
    // visible, and re-picking the same file would fire no change event.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="mb-8 p-6 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-2">Upload PDF</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
          className="block w-full text-sm"
        />
        <p className="text-xs text-gray-500">PDF, up to {MAX_UPLOAD_MB} MB.</p>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!file || loading}
            className="px-4 py-2 bg-black text-white rounded"
          >
            {loading ? "Processing..." : "Upload & Extract"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 border rounded"
          >
            Reset
          </button>
        </div>
        {loading && showSlowMessage && (
          <p className="text-teal-600 text-sm mt-2">This may take a while...</p>
        )}
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </form>
    </div>
  );
}
