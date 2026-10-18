import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@/components/WorkspaceButton";
import {api} from "@/lib/api";

type Archive={id:number;filename:string;created_at:string;summary:Record<string,string|number>;warnings:string[];rows:unknown[];rawSummary:unknown[]};
export default function LegacyStatementArchives({account,initialId}:{account?:string;initialId?:number}={}){
 const [open,setOpen]=useState(Boolean(initialId)),[page,setPage]=useState(1),[id,setId]=useState<number|null>(initialId??null);
 const list=useQuery({queryKey:["legacy-statement-archives",account,page],queryFn:()=>api<{items:Archive[];total:number;pageSize:number}>(`statement-archives?page=${page}${account?`&account=${encodeURIComponent(account)}`:""}`),enabled:open&&!initialId});
 const detail=useQuery({queryKey:["legacy-statement-archive",account,id],queryFn:()=>api<Archive>(`statement-archives/${id}`),enabled:open&&id!==null});
 if(initialId)return <section className="mt-2 min-w-0 space-y-2 text-xs" aria-label="Legacy source data"><p className="text-muted-foreground">Legacy reference · original fields retained; excluded from dashboard totals.</p>{detail.isPending?<p role="status">Loading original fields…</p>:detail.error?<p role="alert">{detail.error.message}</p>:<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(detail.data,null,2)}</pre>}</section>;
 return <details open={open} className="panel mt-3 p-3 sm:p-4 text-sm" onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary className="cursor-pointer font-semibold py-1">Legacy reference archives</summary>
  <p className="my-2 text-xs text-muted-foreground">Existing files remain unchanged. Legacy archives lack validated card/currency/payment coverage; excluded from dashboard totals. Re-import originals through Import for reviewed tracking.</p>
  {list.isPending?<p role="status" className="text-xs text-muted-foreground">Loading legacy archives…</p>:list.error?<p role="alert" className="text-xs text-destructive">{list.error.message}</p>:list.data&&<>
   <ul className="divide-y divide-border">{list.data.items.map(s=><li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 break-words">
    <span className="text-xs">{s.filename} · {s.created_at}</span>
    <div className="flex flex-wrap items-center gap-2">
     <Button variant="outline" size="sm" onClick={()=>setId(s.id)}>Inspect legacy archive {s.id}</Button>
     <a className="quiet inline-flex min-h-9 items-center text-xs underline" href={`/api/statement-archives/${s.id}/download`}>Download original {s.id}</a>
    </div>
   </li>)}</ul>
   {!list.data.total&&<p className="text-xs text-muted-foreground">No legacy archives.</p>}
   <div className="mt-2 flex flex-wrap gap-2 pt-2 border-t border-border">
    <Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</Button>
    <Button variant="outline" size="sm" disabled={page*list.data.pageSize>=list.data.total} onClick={()=>setPage(p=>p+1)}>Next</Button>
   </div>
  </>}
  {id&&<section className="mt-3 pt-2 border-t border-border" aria-label="Legacy source data">
   {detail.isPending?<p role="status" className="text-xs">Loading original fields…</p>:detail.error?<p role="alert" className="text-xs text-destructive">{detail.error.message}</p>:<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(detail.data,null,2)}</pre>}
   <Button variant="outline" size="sm" className="mt-2" onClick={()=>setId(null)}>Close legacy source</Button>
  </section>}
 </details>;
}
