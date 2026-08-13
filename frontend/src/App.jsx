import React, { useCallback, useEffect, useMemo, useState } from "react";
import PdfExtractor from "./PdfExtractor";
import FileList from "./FileList";
import LoginPage from "./LoginPage";
import { useAuth } from "./AuthContext";
import {
  apiStore,
  declineImport,
  getPendingGuestRows,
  getStore,
  hasDeclinedImport,
  localStore,
} from "./dataStore";

export default function App() {
  const { user, loading, isGuest, isAuthenticated, logout } = useAuth();
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [pendingImport, setPendingImport] = useState(0);
  const [importing, setImporting] = useState(false);

  // Swapping stores is the only place auth state affects data access.
  const store = useMemo(() => getStore(isAuthenticated), [isAuthenticated]);

  const handleExtracted = useCallback(
    async (extractionResult) => {
      try {
        const row = await store.create(extractionResult);
        setFiles((prev) => [...prev, row]);
        setError(null);
      } catch (err) {
        // A guest storage write can fail (quota, private mode) -- show it rather
        // than losing the result silently.
        console.error("Could not save extraction:", err);
        setError(err.message);
      }
    },
    [store]
  );

  const handleUpdate = useCallback(
    async (id, field, value) => {
      try {
        await store.update(id, field, value);
        setFiles((prev) =>
          prev.map((file) => (file.id === id ? { ...file, [field]: value } : file))
        );
        setError(null);
      } catch (err) {
        console.error("Failed to update:", err);
        setError(err.message);
      }
    },
    [store]
  );

  const handleDelete = useCallback(
    async (id) => {
      try {
        await store.remove(id);
        setFiles((prev) => prev.filter((file) => file.id !== id));
        setError(null);
      } catch (err) {
        console.error("Delete failed:", err);
        setError(err.message);
      }
    },
    [store]
  );

  // Clear rows first so signing out never leaves the previous account's documents
  // on screen, then load whatever the now-current store holds. The cancel flag
  // keeps an in-flight list from landing after the store has already changed.
  useEffect(() => {
    let cancelled = false;
    setFiles([]);
    setError(null);

    (async () => {
      try {
        const rows = await store.list();
        if (!cancelled) setFiles(rows);
      } catch (err) {
        console.error("Could not load files:", err);
        if (!cancelled) setError(err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [store]);

  // Once signed in, notice any documents still held in this browser from a guest
  // session so they can be adopted into the account instead of appearing lost.
  useEffect(() => {
    if (!isAuthenticated || hasDeclinedImport()) {
      setPendingImport(0);
      return;
    }
    setPendingImport(getPendingGuestRows().length);
  }, [isAuthenticated]);

  const handleImportGuestRows = useCallback(async () => {
    setImporting(true);
    try {
      const rows = getPendingGuestRows();
      const imported = await apiStore.importMany(rows);
      // Only discard the local copy once the server has confirmed the rows.
      localStore.clear();
      setFiles((prev) => [...prev, ...imported]);
      setPendingImport(0);
      setError(null);
    } catch (err) {
      console.error("Import failed:", err);
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }, []);

  const handleDeclineImport = useCallback(() => {
    declineImport();
    setPendingImport(0);
  }, []);

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

        {pendingImport > 0 && (
          <div className="mb-6 p-3 rounded border border-blue-300 bg-blue-50 text-blue-900 text-sm flex items-center justify-between gap-4">
            <span>
              You have {pendingImport} document{pendingImport === 1 ? "" : "s"}{" "}
              saved in this browser from before you signed in. Import{" "}
              {pendingImport === 1 ? "it" : "them"} into your account?
              <span className="block text-xs text-blue-700 mt-1">
                The extracted details carry over, but the original PDFs were never
                uploaded and so cannot be viewed.
              </span>
            </span>
            <span className="flex gap-2 shrink-0">
              <button
                onClick={handleImportGuestRows}
                disabled={importing}
                className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
              >
                {importing ? "Importing..." : "Import"}
              </button>
              <button
                onClick={handleDeclineImport}
                disabled={importing}
                className="px-3 py-1 border border-blue-300 rounded disabled:opacity-50"
              >
                Not now
              </button>
            </span>
          </div>
        )}

        <PdfExtractor onExtracted={handleExtracted} />

        {error && (
          <p className="mb-4 p-3 rounded border border-red-300 bg-red-50 text-red-700 text-sm">
            {error}
          </p>
        )}

        {files.length > 0 ? (
          <FileList
            files={files}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            canViewPdf={isAuthenticated}
          />
        ) : (
          <p className="text-gray-500 text-center mt-4">No files uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
