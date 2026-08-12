import React, { useState, useRef } from "react";
import { apiFetch } from "./apiConfig";

export default function FileList({ files, onUpdate, onDelete /*, onSelect*/ }) {
  const [editingCell, setEditingCell] = useState({ id: null, field: null });
  const [cellValue, setCellValue] = useState("");
  const submittedRef = useRef(false);

  const handleUpdate = async (id, field, value) => {
    const updatedValue = field === "authors"
    ? value
      .split(",")
      .map(a => a.trim())
      .filter(a => a.length > 0)  // remove empty strings
  : value ?? null;

    try {
      const res = await apiFetch(`/api/extractions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: updatedValue })
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);

      onUpdate(id, field, updatedValue);

    } catch (err) {
      console.error("Failed to update:", err);
    }
  };

  const startEditing = (fileId, field, value) => {
    submittedRef.current = false;
    setEditingCell({ id: fileId, field });
    setCellValue(field === "authors" ? (value || []).join(", ") : value || "");
  };

  const stopEditing = (commit = true) => {
    if (commit && editingCell.id !== null && !submittedRef.current) {
      submittedRef.current = true;
      handleUpdate(editingCell.id, editingCell.field, cellValue);
    }
    setEditingCell({ id: null, field: null });
    setCellValue("");
  };

  return (
    <div className="mt-6 overflow-x-auto">
      <h2 className="text-xl font-bold mb-2">Extracted Files</h2>
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
            <tr
              key={file.id}
              className="border-b hover:bg-gray-50 cursor-pointer"
              /*onClick={() => onSelect(file.id)}*/
            >
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
              <td className="p-2 text-center">
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
    </div>
  );
}
