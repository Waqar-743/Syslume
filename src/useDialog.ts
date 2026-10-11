import { useEffect, useRef, type RefObject } from "react";

export function useDialog(ref: RefObject<HTMLElement | null>, open: boolean, onClose:()=>void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(()=>{
    if(!open || !ref.current)return;
    const previous=document.activeElement as HTMLElement | null;
    const element=ref.current;
    const focusable=()=>Array.from(element.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, textarea, a[href], summary, [tabindex="0"]'));
    focusable()[0]?.focus();
    const handler=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();closeRef.current();}
      if(event.key==="Tab"){
        const items=focusable(),first=items[0],last=items[items.length-1];
        if(!items.length){event.preventDefault();return;}
        if(event.shiftKey && (document.activeElement===first || !element.contains(document.activeElement))){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener("keydown",handler);
    return()=>{document.removeEventListener("keydown",handler);previous?.focus();};
  },[ref,open]);
}
