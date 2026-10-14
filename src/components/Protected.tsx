import {useEffect, useState} from "react";
import {Navigate} from "react-router-dom";
import {api, ApiError} from "@/lib/api";
import {Button} from "@/components/WorkspaceButton";

export default function Protected({children}: {children: React.ReactNode}) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let mounted = true;
    api<{user: unknown}>("auth/me").then(result => {
      if (mounted) setOk(Boolean(result.user));
    }).catch(e => {
      if (!mounted) return;
      if (e instanceof ApiError && e.status === 401) setOk(false);
      else setError(e instanceof Error ? e.message : "Luna could not check your session. Try again.");
    });
    return () => { mounted = false; };
  }, [attempt]);
  if (error) return <main className="grid min-h-dvh place-items-center p-6"><section className="panel max-w-lg space-y-4"><h1>Cannot open your workspace</h1><p role="alert" className="text-destructive">{error}</p><Button className="min-h-11" onClick={() => {setError("");setOk(null);setAttempt(n => n + 1);}}>Check connection and retry</Button></section></main>;
  if (ok === null) return <div role="status" className="grid min-h-screen place-items-center text-muted-foreground">Checking your session…</div>;
  return ok ? <>{children}</> : <Navigate to="/login" replace/>;
}
