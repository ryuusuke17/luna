import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {ArrowUpRight} from "lucide-react";
import LunaLogo from "@/components/LunaLogo";
import {send} from "@/lib/api";

export default function Login(){
 const[username,setUsername]=useState(""),[password,setPassword]=useState(""),[setupToken,setToken]=useState(""),[setup,setSetup]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false),nav=useNavigate();
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError("");try{if(setup){await send("auth/setup",{username,password,setupToken});await send("auth/login",{username,password})}else await send("auth/login",{username,password});nav("/")}catch(e){setError(e instanceof Error?e.message:"Unable to sign in")}finally{setBusy(false)}}
 return <main className="grid min-h-dvh bg-card lg:grid-cols-[1.1fr_1fr]">
  <section data-dark className="dark-band relative flex flex-col justify-between overflow-hidden px-6 py-8 sm:px-12 lg:min-h-dvh lg:p-14">
   <a href="/" aria-label="Luna home" className="inline-flex min-h-12 w-fit items-center rounded-md"><LunaLogo className="w-36"/></a>
   <div className="mb-2 mt-8 max-w-2xl lg:my-20">
    <p className="mb-6 hidden text-xs font-semibold uppercase tracking-[.2em] text-white/65 lg:block">Your money. Your perspective.</p>
    <h1 className="login-display">A clearer view.<br/><span className="text-white/55">A little more<br className="hidden lg:block"/> freedom.</span></h1>
    <p className="mt-8 hidden max-w-sm text-base leading-relaxed text-white/70 lg:block">Know where you stand. Make space for what comes next. Your private finance workspace, all in one place.</p>
   </div>
   <div className="hidden flex-wrap items-center justify-end gap-4 border-t border-white/15 pt-5 text-xs text-white/65 lg:flex"><span>PHP · Personal finance</span></div>
  </section>
  <section className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:p-16">
   <form aria-busy={busy} onSubmit={submit} className="mx-auto w-full max-w-sm">
    <h2 className="text-4xl font-medium tracking-tight">{setup?"Make it yours.":"Welcome back."}</h2>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{setup?"Create your owner account to get started with Luna.":"Your next chapter starts with a clearer picture. Sign in to Luna."}</p>
    <fieldset disabled={busy} className="contents">
     <label className="mt-9 block">Username<input autoComplete="username" required minLength={3} maxLength={40} value={username} onChange={e=>setUsername(e.target.value)} className="field"/></label>
     <label className="mt-5 block">Password<input autoComplete={setup?"new-password":"current-password"} aria-invalid={Boolean(error)} aria-describedby={error?"login-error":undefined} type="password" required minLength={setup?12:1} value={password} onChange={e=>setPassword(e.target.value)} className="field"/></label>
     {setup&&<label className="mt-5 block">Setup token (if required)<input value={setupToken} onChange={e=>setToken(e.target.value)} className="field"/></label>}
     {error&&<p id="login-error" role="alert" className="mt-4 rounded-md bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
    </fieldset>
    {busy&&<p role="status" className="mt-4 text-sm text-muted-foreground">{setup?"Creating your owner account and signing in…":"Signing in to your workspace…"}</p>}
    <button disabled={busy} aria-busy={busy} className="action mt-7 w-full">{busy?setup?"Creating account…":"Signing in…":setup?"Create account":"Sign in"}<ArrowUpRight size={18} aria-hidden/></button>
    <button disabled={busy} type="button" onClick={()=>{setSetup(!setup);setError("")}} className="mt-5 min-h-12 w-full rounded-full px-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">{setup?"I already have an account":"First time here? Set up owner account"}</button>
   </form>
  </section>
 </main>;
}
