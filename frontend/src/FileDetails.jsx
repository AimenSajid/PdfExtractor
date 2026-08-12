import React from "react";

function RenderTable({ title, data }) {
  if (!data || data === "") return null;
  let parsedData = null;
    try {
    parsedData = JSON.parse(data);
  } catch {
    parsedData = data; // fallback: keep it as string
  }
  return (
    <div className="p-4 bg-gray-50 rounded-lg border mb-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      <p>{renderValue(parsedData)}</p>
    </div>
  );
}

function renderValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object")
    return JSON.stringify(value, null, 2);
  return value.toString();
}

export default function FileDetails({ file, onBack }) {
  return (
    <div className="mt-6">
      <button
        onClick={onBack}
        className="mb-4 px-3 py-1 border rounded text-sm"
      >
        ← Back
      </button>

      <h2 className="text-xl font-bold mb-4">{file.title}</h2>
      <RenderTable title="Authors" data={(file.authors || []).join(", ")} />
      <RenderTable title="Year" data={file.year} />
      <RenderTable title="DOI" data={file.doi} />
      <RenderTable title="Abstract" data={file.abstract} />
      <RenderTable title="Conclusion" data={file.conclusion} />
      <RenderTable title="URL" data={file.url} />
    </div>
  );
}
