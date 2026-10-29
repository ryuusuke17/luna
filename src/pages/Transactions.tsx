import {useSearchParams} from "react-router-dom";
import TransactionHistory from "@/components/TransactionHistory";
export default function Transactions(){
 const [params,setParams]=useSearchParams();
 return <><header className="page-heading"><div><h1>Transactions</h1><p className="mt-2 text-muted-foreground">Browse and manage manually entered transactions from non-card accounts.</p></div></header><TransactionHistory manualOnly params={params} onParamsChange={setParams}/></>;
}
