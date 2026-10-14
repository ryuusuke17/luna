import {expect,type Locator,type Page} from "@playwright/test";

// Rendered DOM checks supplement, not replace, assistive-technology/device testing.
export async function reviewDialog(dialog:Locator){
 await expect(dialog).toHaveAccessibleName(/.+/);
 await expect(dialog).toHaveAccessibleDescription(/.+/);
 await dialog.evaluate(async root=>{await Promise.all(root.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
 const failures=await dialog.evaluate(root=>{
  const issues:string[]=[];
  const rgb=(value:string)=>{const parts=value.match(/[\d.]+/g)?.map(Number)??[];return [parts[0]??0,parts[1]??0,parts[2]??0,parts[3]??1];};
  const blend=(front:number[],back:number[])=>front.slice(0,3).map((v,i)=>v*front[3]+back[i]*(1-front[3])).concat(1);
  const background=(element:Element)=>{const chain:Element[]=[];for(let e:Element|null=element;e;e=e.parentElement)chain.unshift(e);return chain.reduce((color,e)=>blend(rgb(getComputedStyle(e).backgroundColor),color),[255,255,255,1]);};
  const luminance=(color:number[])=>color.slice(0,3).map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const contrast=(a:number[],b:number[])=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const visible=(e:HTMLElement)=>e.getClientRects().length&&getComputedStyle(e).visibility!=="hidden";
  if(root.scrollWidth>root.clientWidth+1)issues.push("Dialog horizontal overflow");
  for(const node of [root,...Array.from(root.querySelectorAll<HTMLElement>("*"))]){
   const e=node as HTMLElement;if(!visible(e)||e.closest(":disabled"))continue;
   const style=getComputedStyle(e),bg=background(e),text=Array.from(e.childNodes).some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim());
   if(text&&style.opacity!=="0"){
    const size=parseFloat(style.fontSize),large=size>=24||size>=18.66&&Number(style.fontWeight)>=700;
    const ratio=contrast(blend(rgb(style.color),bg),bg);
    if(ratio<(large?3:4.5))issues.push(`Text contrast ${ratio.toFixed(2)}: ${e.textContent?.trim().slice(0,70)}`);
   }
   if(e.matches("button,input:not([type=hidden]),select,textarea")){
    const rect=e.getBoundingClientRect(),target=e.matches("input[type=checkbox],input[type=radio]")?e.closest("label")?.getBoundingClientRect():rect;
    if(!target||target.width<44||target.height<44)issues.push(`Small target: ${e.getAttribute("aria-label")??e.textContent??e.tagName}`);
    if(e.matches("input,select,textarea")&&!e.getAttribute("aria-label")&&!e.getAttribute("aria-labelledby")&&!(e as HTMLInputElement).labels?.length)issues.push(`Unnamed field: ${e.tagName}`);
    if(e.matches("button")&&!e.getAttribute("aria-label")&&!e.getAttribute("aria-labelledby")&&!e.textContent?.trim())issues.push("Unnamed button");
   }
  }
  return issues;
 });
 expect(failures).toEqual([]);
}

export async function reviewFocusLoop(page:Page,dialog:Locator){
 const count=await dialog.locator('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]').count();
 for(const key of ["Tab","Shift+Tab"]){
  for(let i=0;i<count+2;i++){
   await page.keyboard.press(key);
   const focused=await dialog.evaluate(root=>{
    const active=document.activeElement as HTMLElement|null;
    if(!active||!root.contains(active))return {inside:false,visible:false,outlined:false};
    const rect=active.getBoundingClientRect(),bounds=root.getBoundingClientRect(),style=getComputedStyle(active);
    return {inside:true,visible:rect.top>=Math.max(0,bounds.top)-1&&rect.bottom<=Math.min(innerHeight,bounds.bottom)+1,outlined:style.outlineStyle!=="none"&&parseFloat(style.outlineWidth)>=2};
   });
   expect(focused).toEqual({inside:true,visible:true,outlined:true});
  }
 }
}
