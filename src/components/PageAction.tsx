import {useEffect,useRef} from "react";
import {useOutletContext} from "react-router-dom";

export type PageAction={label:string;onClick:()=>void;disabled?:boolean};
export type WorkspaceContext={openTransaction:()=>void;registerAction:(action:PageAction|null)=>void};

export function usePageAction(label:string,onClick:()=>void,disabled=false){
 const {registerAction}=useOutletContext<WorkspaceContext>();
 const callback=useRef(onClick);
 useEffect(()=>{callback.current=onClick;});
 useEffect(()=>{registerAction({label,onClick:()=>callback.current(),disabled});return()=>registerAction(null);},[label,disabled,registerAction]);
}
