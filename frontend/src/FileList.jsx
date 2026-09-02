import React, { useState, useRef } from "react";
import PdfModal from "./PdfModal";

// Presentational only: persistence is the caller's job, handed in via onUpdate /
// onDelete. This component owns the inline-edit interaction and which row's PDF
// is open, and nothing else.
//
// canViewPdf gates the view action. Guest uploads are never persisted
// server-side, so for signed-out visitors there is no PDF to open at all.
export default function FileList({
  files,
  onUpdate,
  onDelete,
  canViewPdf = false,
}) {
  const [editingCell, setEditingCell] = useState({ id: null, field: null });
  const [cellValue, setCellValue] = useState("");
  const [pdfRow, setPdfRow] = useState(null);
  const submittedRef = useRef(false);

  const commit = (id, field, value) => {
    const updatedValue =
      field === "authors"
        ? value
            .split(",")
            .map((a) => a.trim())
            .filter((a) => a.length > 0) // remove empty strings
        : value ?? null;

    onUpdate(id, field, updatedValue);
  };

  const startEditing = (fileId, field, value) => {
    submittedRef.current = false;
    setEditingCell({ id: fileId, field });
    setCellValue(field === "authors" ? (value || []).join(", ") : value || "");
  };

  // submittedRef stops a double commit: Enter commits and unmounts the textarea,
  // and that unmount fires a native blur that would otherwise commit again.
  const stopEditing = (shouldCommit = true) => {
    if (shouldCommit && editingCell.id !== null && !submittedRef.current) {
      submittedRef.current = true;
      commit(editingCell.id, editingCell.field, cellValue);
    }
    setEditingCell({ id: null, field: null });
    setCellValue("");
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-gray-300 text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-4 py-2 text-left">No.</th>
            <th className="border px-4 py-2 text-left">Title</th>
            <th className="border px-4 py-2 text-left">Year</th>
            <th className="border px-4 py-2 text-left">Authors</th>
            <th className="border px-4 py-2 text-left">Url</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file, index) => (
            <tr key={file.id} className="border-b hover:bg-gray-50 cursor-pointer">
              <td className="border px-4 py-2">{index + 1}</td>
              {["title", "year", "authors", "url"].map((field) => (
                <td
                  key={field}
                  className="border px-4 py-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditing(file.id, field, file[field]);
                  }
                  }
                >
                  {editingCell.id === file.id && editingCell.field === field ? (
                    <textarea
                      value={cellValue}
                      autoFocus
                      rows={4}
                      onChange={(e) => setCellValue(e.target.value)}
                      onBlur={() => stopEditing(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            stopEditing(true);
                          };
                        if (e.key === "Escape") stopEditing(false);
                      }}
                      className="w-full border px-1 py-0.5 text-sm"
                    />
                  ) : field === "authors" ? (
                    file[field]?.join(", ") || "-"
                  ) : (
                    file[field] || "-"
                  )}
                </td>
              ))}
              <td className="p-2 text-center whitespace-nowrap">
                {canViewPdf && (
                  <button
                    onClick={() => setPdfRow(file)}
                    className="mr-2 text-blue-600 hover:text-blue-800"
                    title="View PDF"
                  >
                    👁️
                  </button>
                )}
                <button
                  onClick={() => onDelete(file.id)}
                  className="text-red-500 hover:text-red-700"
                  title="Delete"
                >
                  🗑️
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
