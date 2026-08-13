import React, { useRef, useState } from "react";
import { apiFetch } from "./apiConfig";

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
        const txt = await res.text();
        throw new Error(txt || "Server error");
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
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
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
