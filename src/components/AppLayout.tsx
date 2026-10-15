import {type PageAction} from "@/components/PageAction";
import {Dialog,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import DialogContent from "@/components/WorkspaceDialogContent";
import {useCallback,useEffect,useRef,useState} from "react";
import {Link,NavLink,Outlet,useLocation,useNavigate,useSearchParams} from "react-router-dom";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Home,WalletCards,ArrowLeftRight,ChartNoAxesCombined,PiggyBank,Settings,LogOut,Plus,Menu,Search,Target,Receipt,HelpCircle,ShieldCheck,Files,ArrowUpDown} from "lucide-react";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle,SheetTrigger} from "@/components/ui/sheet";
import {Button} from "@/components/WorkspaceButton";
import LunaLogo from "@/components/LunaLogo";
import TransactionDialog from "@/components/TransactionDialog";
import {api,send} from "@/lib/api";
const workspace=[["/","Dashboard",Home],["/budgets","Budgets",PiggyBank],["/bills","Bills",Receipt],["/goals","Goals",Target],["/transactions","Transactions",ArrowLeftRight],["/statements","Statements",Files],["/accounts","Accounts",WalletCards],["/analytics","Analytics",ChartNoAxesCombined]] as const;
const manage=[["/import-export","Import & Export",ArrowUpDown],["/settings","Settings",Settings],["/help","Help",HelpCircle]] as const;
type Result={type:string;id:number;label:string;detail:string};
export default function AppLayout(){
 const nav=useNavigate(),location=useLocation(),client=useQueryClient(),[params,setParams]=useSearchParams(),[drawer,setDrawer]=useState(false),[entry,setEntry]=useState(false),[query,setQuery]=useState(""),[term,setTerm]=useState(""),[searchOpen,setSearchOpen]=useState(false),[active,setActive]=useState(-1),[signingOut,setSigningOut]=useState(false),[pageAction,setPageAction]=useState<(PageAction&{path:string})|null>(null),[mobileSearch,setMobileSearch]=useState(false),[error,setError]=useState(""),search=useRef<HTMLInputElement>(null),searchNavigating=useRef(false);
 const prefs=useQuery({queryKey:["preferences"],queryFn:()=>api<{default_transaction_currency:string;shortcuts:number;bill_alerts:number;budget_alerts:number;goal_alerts:number}>("preferences")}),profile=useQuery({queryKey:["profile"],queryFn:()=>api<{user:{username:string}}>("auth/me")});
 const results=useQuery({queryKey:["search",term],queryFn:()=>api<Result[]>(`search?q=${encodeURIComponent(term)}`),enabled:Boolean(term)});
 const registerAction=useCallback((action:PageAction|null)=>setPageAction(action?{...action,path:location.pathname}:null),[location.pathname]);
 const contextual=pageAction?.path===location.pathname?pageAction:null;
 const hasDefaultAction=["/","/transactions","/statements"].includes(location.pathname.replace(/\/$/,"")||"/");
 const statementPage=location.pathname.replace(/\/$/,"")==="/statements",headerActionLabel=contextual?.label??(statementPage?"Add statement":"Add transaction");
 function openHeaderAction(){if(contextual){contextual.onClick();return;}if(statementPage){const next=new URLSearchParams(params);next.set("upload","1");setParams(next);}else setEntry(true);}
 useEffect(()=>{const timer=setTimeout(()=>{setTerm(query.trim());setActive(-1);},200);return()=>clearTimeout(timer);},[query]);
 useEffect(()=>{if(params.get("new")==="1")setEntry(true);},[params]);
 useEffect(()=>{setDrawer(false);setSearchOpen(false);setMobileSearch(false);},[location.pathname]);
 useEffect(()=>{function dismiss(e:KeyboardEvent){if(e.key==="Escape"&&searchOpen&&!document.querySelector('[role="dialog"],[role="alertdialog"]')){search.current?.focus();setSearchOpen(false);setActive(-1);}}window.addEventListener("keydown",dismiss);return()=>window.removeEventListener("keydown",dismiss);},[searchOpen]);
 useEffect(()=>{if(searchOpen&&active>=0)document.getElementById(`search-result-${active}`)?.scrollIntoView({block:"nearest"});},[searchOpen,active]);
 useEffect(()=>{function shortcut(e:KeyboardEvent){if(searchOpen&&Boolean(term)||prefs.data?.shortcuts!==1||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||e.repeat||document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]')||(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')))return;if(e.key.toLowerCase()==="n"){e.preventDefault();setEntry(true);}if(e.key==="/"){e.preventDefault();if(window.matchMedia("(max-width:560px)").matches)setMobileSearch(true);else search.current?.focus();}}window.addEventListener("keydown",shortcut);return()=>window.removeEventListener("keydown",shortcut);},[prefs.data,searchOpen,term]);
 function choose(r:Result){searchNavigating.current=mobileSearch;setMobileSearch(false);setSearchOpen(false);setActive(-1);setQuery("");nav(`/${r.type==="transaction"?"transactions":r.type==="account"?"accounts":"bills"}?id=${r.id}`);}
 function closeEntry(open:boolean){setEntry(open);if(!open&&params.has("new")){const next=new URLSearchParams(params);next.delete("new");setParams(next,{replace:true});}}
 async function logout(){if(signingOut)return;setSigningOut(true);setError("");try{await send("auth/logout");client.clear();nav("/login");}catch(e){setError((e as Error).message);}finally{setSigningOut(false);}}
 const searchWorkspace=(<div className={mobileSearch?"relative":"relative hidden min-w-0 flex-1 sm:block sm:max-w-xl"}>
     <label className="flex min-h-10 items-center gap-2 rounded-full bg-secondary px-4"><Search size={18} className="shrink-0 text-muted-foreground" aria-hidden/><span className="sr-only">Search transactions, accounts, bills</span><input ref={search} type="search" className="min-w-0 w-full bg-transparent py-2 text-sm" placeholder="Search your workspace…" value={query} onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);}} role="combobox" aria-expanded={searchOpen&&Boolean(term)} aria-controls={searchOpen&&term?"search-results":undefined} aria-autocomplete="list" aria-activedescendant={searchOpen&&term&&active>=0&&results.data?.[active]?`search-result-${active}`:undefined} onKeyDown={e=>{const count=results.data?.length??0;if(e.key==="Escape"){setSearchOpen(false);setActive(-1);}if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setSearchOpen(true);setActive(n=>count?(n<0?(e.key==="ArrowDown"?0:count-1):(n+(e.key==="ArrowDown"?1:count-1))%count):-1);}if(e.key==="Enter"&&searchOpen&&active>=0&&results.data?.[active]){e.preventDefault();choose(results.data[active]);}}}/>{prefs.data?.shortcuts===1&&<kbd className="hidden rounded-sm border bg-card px-2 text-xs text-muted-foreground sm:block">/</kbd>}</label>
     {searchOpen&&term&&<div className={`${mobileSearch?"mobile-search-results":"absolute inset-x-0 top-full"} mt-2 max-h-96 overflow-y-auto rounded-lg border bg-popover p-2`}><p role={results.error&&!results.isFetching?"alert":"status"} className="p-3 text-xs text-muted-foreground">{results.isFetching?"Searching…":results.error?results.error.message:`${results.data?.length??0} results`}</p><ul id="search-results" role="listbox" aria-label="Workspace search results">{!results.error&&results.data?.map((r,i)=><li id={`search-result-${i}`} role="option" aria-selected={i===active} key={`${r.type}-${r.id}`} className={`rounded-md hover:bg-muted ${i===active?"bg-muted":""}`} onPointerDown={e=>{e.preventDefault();}} onClick={()=>choose(r)}><span className="block min-h-12 cursor-pointer p-3 text-left"><strong className="block text-sm">{r.label}</strong><span className="text-xs text-muted-foreground">{r.type} · {r.detail}</span></span></li>)}</ul>{!results.isFetching&&!results.error&&!results.data?.length&&<p className="p-3 text-sm">No matching records in your workspace.</p>}<button className="quiet mt-2 w-full" onClick={()=>setSearchOpen(false)}>Close search</button></div>}
    </div>);
 const navigation=<div data-dark className="flex min-h-full flex-col bg-sidebar px-4 pb-4 pt-5 text-sidebar-foreground">
  <Link to="/" aria-label="Luna home" className="mb-5 inline-flex min-h-12 w-fit items-center rounded-md"><LunaLogo className="w-24"/></Link>
  {[["Workspace",workspace],["Manage",manage]].map(([label,links])=><div key={String(label)} className="mb-5">
   <p className="mb-3 px-4 text-xs font-semibold uppercase tracking-[.16em] text-white/60">{String(label)}</p>
   <nav aria-label={String(label)} className="grid gap-1">{(links as typeof workspace|typeof manage).map(([to,name,Icon])=><NavLink to={to} key={to} end={to==="/"} onClick={()=>setDrawer(false)} className={({isActive})=>`flex min-h-10 items-center gap-2 rounded-full px-3 py-2 text-sm ${isActive?"bg-sidebar-primary font-semibold text-sidebar-primary-foreground":"text-white/75 hover:bg-sidebar-accent hover:text-white"}`}><Icon size={19} strokeWidth={1.7} aria-hidden/>{name}</NavLink>)}</nav>
  </div>)}
  <div className="mt-auto grid gap-4 border-t border-sidebar-border pt-5">
   <button onClick={()=>{setDrawer(false);setEntry(true);}} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"><Plus size={18} aria-hidden/>Add transaction</button>
   <Link to="/settings" className="flex min-h-12 items-center gap-3 rounded-md px-2 py-2 hover:bg-sidebar-accent"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-sidebar-accent text-sm font-semibold">{profile.data?.user.username?.slice(0,1).toUpperCase()??"L"}</span><span className="min-w-0"><strong className="block truncate text-sm">{profile.data?.user.username??"Workspace"}</strong><span className="text-xs text-white/60">{profile.data?.user ? "Admin" : "User"}</span></span></Link>
   <button onClick={logout} disabled={signingOut} aria-busy={signingOut} className="flex min-h-11 items-center gap-3 rounded-full px-4 text-sm text-white/70 hover:bg-sidebar-accent hover:text-white"><LogOut size={18} aria-hidden/>{signingOut?"Signing out…":"Sign out"}</button>
   {error&&<p role="alert" className="text-sm">{error}</p>}
  </div>
 </div>;
 return <div className="min-h-screen lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
  <a href="#main" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-full bg-card px-5 py-3 focus:translate-y-0">Skip to content</a>
  <aside className="sticky top-0 hidden h-dvh overflow-y-auto bg-sidebar lg:block">{navigation}</aside>
  <div className="min-w-0">
   <header className="sticky top-0 z-20 flex min-h-16 items-center gap-2 border-b bg-card px-4 py-2 sm:gap-3 sm:px-6">
    <Sheet open={drawer} onOpenChange={setDrawer}>
     <SheetTrigger asChild><Button variant="outline" size="icon" className="shrink-0 lg:hidden" aria-label="Open navigation"><Menu size={20}/></Button></SheetTrigger>
     <SheetContent onCloseAutoFocus={event=>{if(document.querySelector('[role="dialog"][data-state="open"]'))event.preventDefault();}} data-dark side="left" className="w-72 overflow-y-auto border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-none"><SheetHeader className="sr-only"><SheetTitle>Luna navigation</SheetTitle><SheetDescription>Workspace and management pages.</SheetDescription></SheetHeader>{navigation}</SheetContent>
    </Sheet>
    <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search workspace" onClick={()=>setMobileSearch(true)}><Search size={20} aria-hidden/></Button>
    {!mobileSearch&&searchWorkspace}
    <Dialog open={mobileSearch} onOpenChange={open=>{setMobileSearch(open);if(!open)setSearchOpen(false);}}><DialogContent onCloseAutoFocus={event=>{if(searchNavigating.current){event.preventDefault();searchNavigating.current=false;}}}><DialogHeader><DialogTitle>Search workspace</DialogTitle><DialogDescription>Find transactions, accounts, and bills.</DialogDescription></DialogHeader>{mobileSearch&&searchWorkspace}</DialogContent></Dialog>
    <div className="ml-auto hidden items-center gap-2 whitespace-nowrap text-xs text-muted-foreground xl:flex"><ShieldCheck size={16} aria-hidden/>Private by design</div>
    {(contextual||hasDefaultAction)&&<Button onClick={openHeaderAction} disabled={contextual?.disabled} className="ml-auto min-w-0 shrink gap-2 whitespace-normal px-3 text-left sm:px-4"><Plus size={18} className="shrink-0" aria-hidden/>{headerActionLabel}</Button>}
   </header>
   <main id="main" tabIndex={-1} className="mx-auto workspace-main max-w-[1440px] p-4 sm:p-6"><Outlet context={{openTransaction:()=>setEntry(true),registerAction}}/></main>
  </div>
  <TransactionDialog open={entry} onOpenChange={closeEntry}/>
 </div>;
}
