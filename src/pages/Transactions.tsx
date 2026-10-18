import {useSearchParams} from "react-router-dom";
import TransactionHistory from "@/components/TransactionHistory";
export default function Transactions(){
 const [params,setParams]=useSearchParams();
 return <><header className="page-heading"><div><h1>Transactions</h1><p className="mt-2 text-muted-foreground">View and manage your posted transactions.</p></div></header><TransactionHistory params={params} onParamsChange={setParams}/></>;
}
