import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import PdfModal from "./PdfModal";
import { Badge, Button, Card, IconButton } from "./ui";

function authorsToText(authors) {
  return (authors || []).join(", ");
}

function textToAuthors(text) {
  return text
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

function commitOnEnter(e) {
  if (e.key === "Enter") e.currentTarget.blur();
}

function Field({ label, value, onChange, onBlur, mono = false, accent = false }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      <input
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={commitOnEnter}
        className={[
          "w-full rounded-input border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition-colors",
          "hover:bg-surface-hover focus:border-focus focus:bg-card focus:ring-2 focus:ring-focus",
          mono ? "font-mono text-[12.5px]" : "",
          accent ? "text-bronze-600" : "text-body",
        ].join(" ")}
      />
    </label>
  );
}

function LongField({ label, value, onChange, onBlur }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line-subtle bg-sunken p-3.5">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      <textarea
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        rows={4}
        className="w-full resize-y rounded-input border border-transparent bg-transparent px-1.5 py-1 text-sm leading-relaxed text-body outline-none transition-colors hover:bg-card focus:border-focus focus:bg-card focus:ring-2 focus:ring-focus"
      />
    </div>
  );
}

// Owns the local edit drafts for one row. Fields commit to the store on blur
// (or Enter, for single-line fields) rather than on every keystroke, so typing
// doesn't fire a network request per character. Keyed by file.id in the parent,
// so a real remount (new/removed row) is what resets drafts -- not our own
// commits echoing back through props.
function DocumentCard({ file, onUpdate, onDelete, onView, canView, badgeTone, badgeLabel }) {
  const [draft, setDraft] = useState(() => ({
    filename: file.filename || "",
    title: file.title || "",
    authors: authorsToText(file.authors),
    year: file.year || "",
    doi: file.doi || "",
    url: file.url || "",
    abstract: file.abstract || "",
    conclusion: file.conclusion || "",
  }));

  const set = (field) => (e) =>
    setDraft((d) => ({ ...d, [field]: e.target.value }));

  const commit = (field) => () => {
    const value = draft[field];
    const original = field === "authors" ? authorsToText(file.authors) : file[field] || "";
    if (value === original) return;
    onUpdate(file.id, field, field === "authors" ? textToAuthors(value) : value);
  };

  return (
    <Card className="p-5 sm:p-6">
      {/* On narrow screens the filename would otherwise be squeezed to a few
          visible characters sharing a row with the badge and delete button --
          give it order-2 so flex-wrap drops it to its own full-width line,
          matching the design's mobile layout. Reset to normal order at sm:. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line-subtle pb-4">
        <input
          value={draft.filename}
          onChange={set("filename")}
          onBlur={commit("filename")}
          onKeyDown={commitOnEnter}
          className="order-2 w-full min-w-0 rounded-input border border-transparent bg-transparent px-2 py-1 font-mono text-xs text-muted outline-none transition-colors hover:bg-surface-hover focus:border-focus focus:bg-card focus:text-strong focus:ring-2 focus:ring-focus sm:order-none sm:w-auto sm:flex-none sm:basis-[340px]"
        />
        <Badge tone={badgeTone} className="order-1 sm:order-none">
          {badgeLabel}
        </Badge>
        <span className="order-1 flex-1 sm:order-none" />
        {canView && (
          <Button variant="secondary" size="sm" className="order-1 sm:order-none" onClick={onView}>
            View PDF
          </Button>
        )}
        <IconButton
          label="Delete document"
          className="order-1 sm:order-none"
          onClick={() => onDelete(file.id)}
        >
          <Trash2 size={16} />
        </IconButton>
      </div>

      <input
        value={draft.title}
        onChange={set("title")}
        onBlur={commit("title")}
        onKeyDown={commitOnEnter}
        className="mt-3 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 font-display text-lg font-bold tracking-tight text-strong outline-none transition-colors hover:bg-surface-hover focus:border-focus focus:bg-card focus:ring-2 focus:ring-focus sm:text-xl"
      />

      <div className="mt-2 grid grid-cols-1 gap-3.5 py-2 sm:grid-cols-[2fr_0.7fr_1.3fr_1.3fr] sm:gap-4">
        <Field label="Authors" value={draft.authors} onChange={set("authors")} onBlur={commit("authors")} />
        <Field label="Year" value={draft.year} onChange={set("year")} onBlur={commit("year")} mono />
        <Field label="DOI" value={draft.doi} onChange={set("doi")} onBlur={commit("doi")} mono />
        <Field label="URL" value={draft.url} onChange={set("url")} onBlur={commit("url")} mono accent />
      </div>

      <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
        <LongField label="Abstract" value={draft.abstract} onChange={set("abstract")} onBlur={commit("abstract")} />
        <LongField label="Conclusion" value={draft.conclusion} onChange={set("conclusion")} onBlur={commit("conclusion")} />
      </div>
    </Card>
  );
}

// canViewPdf is really "is this visitor signed in" -- per-row viewability also
// depends on file.has_pdf (absent/false for guest rows and imported rows,
// which were never stored server-side).
export default function FileList({ files, onUpdate, onDelete, canViewPdf = false }) {
  const [pdfRow, setPdfRow] = useState(null);

  return (
    <div className="flex flex-col gap-4">
      {files.map((file) => {
        const canView = canViewPdf && !!file.has_pdf;
        const badgeTone = canView ? "info" : "neutral";
        const badgeLabel = canView
          ? "PDF stored"
          : canViewPdf
          ? "Metadata only"
          : "In this browser";

        return (
          <DocumentCard
            key={file.id}
            file={file}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onView={() => setPdfRow(file)}
            canView={canView}
            badgeTone={badgeTone}
            badgeLabel={badgeLabel}
          />
        );
      })}

      {/* PdfModal never hides itself -- mounting it is what opens it. */}
      {pdfRow && (
        <PdfModal
          extractionId={pdfRow.id}
          filename={pdfRow.filename}
          onClose={() => setPdfRow(null)}
        />
      )}
    </div>
  );
}
