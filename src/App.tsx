import {Toaster} from "@/components/ui/toaster";
import {Toaster as Sonner} from "@/components/ui/sonner";
import {TooltipProvider} from "@/components/ui/tooltip";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {BrowserRouter,Routes,Route,Navigate,useLocation} from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Accounts from "./pages/Accounts";
import AccountDetails from "./pages/AccountDetails";
import Transactions from "./pages/Transactions";
import ImportExport from "./pages/ImportExport";
import Statements from "./pages/Statements";
import Analytics from "./pages/Analytics";
import Budgets from "./pages/Budgets";
import Settings from "./pages/Settings";
import Bills from "./pages/Bills";
import Goals from "./pages/Goals";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";
import Protected from "@/components/Protected";
import AppLayout from "@/components/AppLayout";
const queryClient=new QueryClient();
function ImportRedirect(){const location=useLocation(),params=new URLSearchParams(location.search),statement=params.get("statement");if(statement){params.set("batch",statement);params.delete("statement");}params.delete("duplicate");if(params.has("batch")||params.has("legacy"))params.set("tab","history");return <Navigate to={`/import-export${params.size?`?${params}`:""}`} replace/>;}
function TransactionsRoute(){return new URLSearchParams(useLocation().search).get("upload")==="1"?<ImportRedirect/>:<Transactions/>;}
function StatementsRoute(){const params=new URLSearchParams(useLocation().search);return params.has("statement")||params.has("batch")?<ImportRedirect/>:<Statements/>;}
function AccountsRoute(){const location=useLocation(),params=new URLSearchParams(location.search),id=params.get("id");if(!id)return <Accounts/>;params.delete("id");return <Navigate replace to={`/accounts/${encodeURIComponent(id)}${params.size?`?${params}`:""}`}/>;}
export default function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><Toaster/><Sonner/><BrowserRouter><Routes><Route path="/login" element={<Login/>}/><Route element={<Protected><AppLayout/></Protected>}><Route index element={<Index/>}/><Route path="/accounts" element={<AccountsRoute/>}/><Route path="/accounts/:id" element={<AccountDetails/>}/><Route path="/transactions" element={<TransactionsRoute/>}/><Route path="/import-export" element={<ImportExport/>}/><Route path="/analytics" element={<Analytics/>}/><Route path="/budgets" element={<Budgets/>}/><Route path="/bills" element={<Bills/>}/><Route path="/goals" element={<Goals/>}/><Route path="/imports" element={<ImportRedirect/>}/><Route path="/statements" element={<StatementsRoute/>}/><Route path="/settings" element={<Settings/>}/><Route path="/help" element={<Help/>}/></Route><Route path="*" element={<NotFound/>}/></Routes></BrowserRouter></TooltipProvider></QueryClientProvider>;}
