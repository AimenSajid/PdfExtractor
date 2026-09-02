import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, ShieldCheck, CloudUpload, X } from "lucide-react";
import PdfExtractor from "./PdfExtractor";
import FileList from "./FileList";
import LoginPage from "./LoginPage";
import { useAuth } from "./AuthContext";
import { Avatar, Badge, Button, IconButton } from "./ui";
import {
  apiStore,
  declineImport,
  getPendingGuestRows,
  getStore,
  hasDeclinedImport,
  localStore,
} from "./dataStore";

export default function App() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [pendingImport, setPendingImport] = useState(0);
  const [importing, setImporting] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

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

  const handleLogout = useCallback(async () => {
    await logout();
    setShowLogin(false);
  }, [logout]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-sm text-subtle">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated && showLogin) {
    return <LoginPage onBack={() => setShowLogin(false)} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="flex h-16 flex-none items-center justify-between border-b border-line-subtle bg-nav px-6 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-text">
            <FileText size={17} />
          </div>
          <span className="font-display text-[17px] font-extrabold tracking-tight text-strong">
            PDF Extractor
          </span>
        </div>
        {isAuthenticated ? (
          <div className="flex items-center gap-3.5">
            <Avatar name={user.name || user.email} picture={user.picture} size={30} />
            <span className="hidden text-sm text-body sm:inline">
              {user.name || user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setShowLogin(true)}>
            Sign In
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-auto px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-6">
          {!isAuthenticated && !noticeDismissed && (
            <div className="flex items-center gap-4 rounded-lg border border-bronze-200 bg-accent-soft p-4">
              <ShieldCheck size={18} className="shrink-0 text-bronze-600" />
              <p className="flex-1 text-sm leading-relaxed text-bronze-600">
                You&apos;re working as a guest. Documents are kept in this browser
                only — they aren&apos;t saved to an account, and clearing your
                browser data removes them.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => setShowLogin(true)}
              >
                Sign In To Save
              </Button>
              <IconButton
                label="Dismiss notice"
                className="shrink-0"
                onClick={() => setNoticeDismissed(true)}
              >
                <X size={16} />
              </IconButton>
            </div>
          )}

          {pendingImport > 0 && (
            <div className="rounded-card border border-bronze-200 bg-card p-5 shadow-sm">
              <div className="flex items-center gap-5">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-accent-soft text-bronze-600">
                  <CloudUpload size={19} />
                </div>
                <div className="flex-1">
                  <p className="text-[15px] font-semibold text-strong">
                    You have {pendingImport} document{pendingImport === 1 ? "" : "s"}{" "}
                    saved in this browser from before you signed in. Import{" "}
                    {pendingImport === 1 ? "it" : "them"} into your account?
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Only the extracted metadata comes across. The original PDF
                    files stay in this browser, so imported rows won&apos;t have a
                    View PDF action.
                  </p>
                </div>
                <div className="flex flex-none gap-2.5">
                  <Button variant="ghost" size="sm" disabled={importing} onClick={handleDeclineImport}>
                    Not Now
                  </Button>
                  <Button size="sm" disabled={importing} onClick={handleImportGuestRows}>
                    {importing ? "Importing…" : "Import"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <PdfExtractor onExtracted={handleExtracted} />

          {error && (
            <p className="rounded-card border border-status-red bg-status-red-bg p-3 text-sm text-status-red">
              {error}
            </p>
          )}

          <div className="flex items-baseline justify-between pt-2">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl font-bold tracking-tight text-strong">
                Extracted documents
              </h2>
              <Badge>
                {files.length === 1 ? "1 document" : `${files.length} documents`}
              </Badge>
            </div>
          </div>

          {files.length > 0 ? (
            <FileList
              files={files}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              canViewPdf={isAuthenticated}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-card border border-line-subtle bg-sunken py-14 text-center">
              <FileText size={30} className="text-subtle" />
              <p className="text-[17px] font-semibold text-strong">
                No files uploaded yet.
              </p>
              <p className="text-sm text-muted">
                Your extracted papers will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
