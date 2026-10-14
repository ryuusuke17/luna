import {useState} from "react";
import {Button} from "@/components/WorkspaceButton";
import {downloadExport} from "@/lib/api";

export default function ExportButton({format, children}: {format: "json" | "csv"; children: React.ReactNode}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true);setError("");setStatus("");
    try {await downloadExport(format);setStatus("Export ready. Your browser has been asked to download the file.");}
    catch(e) {setError(e instanceof Error ? e.message : "Luna could not download this export. Try again.");}
    finally {setBusy(false);}
  }
  return <div className="space-y-2"><Button variant="outline" className="min-h-11" disabled={busy} aria-busy={busy} onClick={download}>{busy ? "Preparing export…" : children}</Button>{error && <p role="alert" className="max-w-sm text-sm text-destructive">{error}</p>}{status && <p role="status" className="max-w-sm text-sm text-muted-foreground">{status}</p>}</div>;
}
