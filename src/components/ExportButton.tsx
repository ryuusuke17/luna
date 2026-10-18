import {useState} from "react";
import {Button} from "@/components/WorkspaceButton";
import {downloadExport} from "@/lib/api";

export default function ExportButton({format, children, size}: {format: "json" | "csv"; children: React.ReactNode; size?: "default" | "sm" | "lg" | "icon"}) {
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
  return <div className="space-y-1"><Button variant="outline" size={size} className={size==="sm"?"":"min-h-11"} disabled={busy} aria-busy={busy} onClick={download}>{busy ? "Preparing export…" : children}</Button>{error && <p role="alert" className="max-w-sm text-xs text-destructive">{error}</p>}{status && <p role="status" className="max-w-sm text-xs text-muted-foreground">{status}</p>}</div>;
}
