import React, { useCallback, useEffect, useState } from "react";
import PdfExtractor from "./PdfExtractor";
import FileList from "./FileList";
import LoginPage from "./LoginPage";
import { useAuth } from "./AuthContext";
import { apiFetch } from "./apiConfig";

export default function App() {
  const { user, loading, isGuest, isAuthenticated, logout } = useAuth();
  const [files, setFiles] = useState([]);

  const fetchFiles = useCallback(async () => {
    // Guests have no server-side rows; calling the API would only 401.
    if (!isAuthenticated) return;
    try {
      const res = await apiFetch("/api/extractions");
      if (!res.ok) throw new Error(`Failed to load files (${res.status})`);
      setFiles(await res.json());
    } catch (err) {
      console.error("Could not load files:", err);
    }
  }, [isAuthenticated]);

  const handleDelete = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/extractions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setFiles((prev) => prev.filter((file) => file.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Signing out should not leave the previous account's rows on screen.
  useEffect(() => {
    if (!isAuthenticated) setFiles([]);
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated && !isGuest) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-6">
      <div className="w-full max-w-4xl">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold">PDF Extractor</h1>
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              {user.picture && (
                <img
                  src={user.picture}
                  alt=""
                  className="w-8 h-8 rounded-full"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="text-sm text-gray-600">
                {user.name || user.email}
              </span>
              <button
                onClick={logout}
                className="text-sm px-3 py-1 border rounded hover:bg-gray-100"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                localStorage.removeItem("pdfx_guest_mode");
                window.location.reload();
              }}
              className="text-sm px-3 py-1 border rounded hover:bg-gray-100"
            >
              Sign in
            </button>
          )}
        </header>

        {isGuest && !isAuthenticated && (
          <div className="mb-6 p-3 rounded border border-amber-300 bg-amber-50 text-amber-900 text-sm">
            You&apos;re not signed in. Extracted documents are kept in this browser
            only and will be lost if you clear its data.{" "}
            <strong>Sign in to save them to your account.</strong>
          </div>
        )}

        <PdfExtractor onExtracted={fetchFiles} />

        {files.length > 0 ? (
          <FileList
            files={files}
            onUpdate={(id, field, value) => {
              setFiles((prev) =>
                prev.map((file) =>
                  file.id === id ? { ...file, [field]: value } : file
                )
              );
            }}
            onDelete={handleDelete}
          />
        ) : (
          <p className="text-gray-500 text-center mt-4">No files uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
