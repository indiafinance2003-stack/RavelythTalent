"use client";

import { useState, type ChangeEvent } from "react";
import { Alert, Button, Card } from "@/components/ui/primitives";
import { importTargetsAction } from "@/lib/assistant/target-actions";
import { parseTargetCsv, type TargetCsvRow } from "@/lib/assistant/targets-csv";

export function TargetsCsvImport() {
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<TargetCsvRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewComplete, setPreviewComplete] = useState(false);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setCsv("");
    setRows([]);
    setError(null);
    setPreviewComplete(false);
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("CSV file must be no larger than 2 MB.");
      return;
    }
    const contents = await file.text();
    try {
      const parsed = parseTargetCsv(contents);
      setRows(parsed);
      const response = await fetch("/api/admin/assistant/targets/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: contents }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { rows: TargetCsvRow[] };
        error?: { message?: string };
      };
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Unable to validate this CSV on the server.");
      }
      setRows(payload.data.rows);
      setCsv(contents);
      setPreviewComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to read CSV.");
    }
  }

  const validCount = rows.filter((row) => row.data).length;
  const invalidCount = rows.length - validCount;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-navy">Import targets from CSV</h2>
        <p className="mt-1 text-sm text-slate-600">
          Columns: Company Name and Website are required; City, State, Industry and Source are optional.
          Up to 1,000 rows and 2 MB; domains already in the portal are skipped.
        </p>
      </div>
      <label className="block text-sm font-semibold text-navy" htmlFor="targets-csv">
        CSV file
      </label>
      <input
        accept=".csv,text/csv"
        className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-tint file:px-3 file:py-2 file:font-semibold file:text-navy"
        id="targets-csv"
        onChange={selectFile}
        type="file"
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {rows.length ? (
        <>
          <p className="text-sm text-slate-700" role="status">
            Preview: {validCount} valid row(s), {invalidCount} row error or existing domain(s).
          </p>
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">CSV row</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Website</th>
                  <th className="px-3 py-2">Domain</th>
                  <th className="px-3 py-2">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.row}>
                    <td className="px-3 py-2">{row.row}</td>
                    <td className="px-3 py-2">{row.data?.companyName ?? "—"}</td>
                    <td className="px-3 py-2">{row.data?.website ?? "—"}</td>
                    <td className="px-3 py-2">{row.data?.domain ?? "—"}</td>
                    <td className={`px-3 py-2 ${row.error ? "text-red-700" : "text-emerald-700"}`}>
                      {row.error ?? "Ready"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={importTargetsAction}>
            <input name="csv" type="hidden" value={csv} />
            <Button disabled={!validCount || !previewComplete} type="submit">
              Import {validCount} valid row(s)
            </Button>
          </form>
        </>
      ) : null}
    </Card>
  );
}
