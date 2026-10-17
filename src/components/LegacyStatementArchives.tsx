import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@/components/WorkspaceButton";
import {api} from "@/lib/api";

type Archive={id:number;filename:string;created_at:string;summary:Record<string,string|number>;warnings:string[];rows:unknown[];rawSummary:unknown[]};
export default function LegacyStatementArchives({account,initialId}:{account?:string;initialId?:number}={}){
 const [open,setOpen]=useState(Boolean(initialId)),[page,setPage]=useState(1),[id,setId]=useState<number|null>(initialId??null);
 const list=useQuery({queryKey:["legacy-statement-archives",account,page],queryFn:()=>api<{items:Archive[];total:number;pageSize:number}>(`statement-archives?page=${page}${account?`&account=${encodeURIComponent(account)}`:""}`),enabled:open});
 const detail=useQuery({queryKey:["legacy-statement-archive",account,id],queryFn:()=>api<Archive>(`statement-archives/${id}`),enabled:open&&id!==null});
 return <details open={open} className="panel mt-6" onToggle={e=>setOpen(e.currentTarget.open)}><summary className="min-h-11 cursor-pointer">Legacy reference archives</summary><p className="my-4">Existing files remain unchanged. Legacy archives lack validated card/currency/payment coverage; excluded from dashboard totals. Re-import originals through Import for reviewed tracking.</p>
  {list.isPending?<p role="status">Loading legacy archives…</p>:list.error?<p role="alert">{list.error.message}</p>:list.data&&<><ul className="space-y-3">{list.data.items.map(s=><li key={s.id} className="flex flex-wrap items-center gap-3 break-words"><span>{s.filename} · {s.created_at}</span><Button variant="outline" onClick={()=>setId(s.id)}>Inspect legacy archive {s.id}</Button><a className="quiet inline-flex min-h-11 items-center underline" href={`/api/statement-archives/${s.id}/download`}>Download original {s.id}</a></li>)}</ul>{!list.data.total&&<p>No legacy archives.</p>}<div className="mt-4 flex flex-wrap gap-3"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous legacy archives</Button><Button variant="outline" disabled={page*list.data.pageSize>=list.data.total} onClick={()=>setPage(p=>p+1)}>Next legacy archives</Button></div></>}
  {id&&<section className="mt-4" aria-label="Legacy source data">{detail.isPending?<p role="status">Loading original fields…</p>:detail.error?<p role="alert">{detail.error.message}</p>:<pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{JSON.stringify(detail.data,null,2)}</pre>}<Button variant="outline" onClick={()=>setId(null)}>Close legacy source</Button></section>}
 </details>;
}
