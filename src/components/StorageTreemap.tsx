import { useMemo, useState } from "react";
import type { TreeNodeMap } from "../App";
import { FORMAT_SIZE } from "../constants";
import { layoutTreemap } from "../treemap";

export default function StorageTreemap({ nodes, root, onInspect }: { nodes:TreeNodeMap; root:number|null; onInspect:(id:number)=>void }) {
  const [trail,setTrail]=useState<number[]>(root==null ? [] : [root]);
  const [page,setPage]=useState(0);
  const current=trail[trail.length-1]??root;
  const siblings=useMemo(()=>Object.values(nodes).filter(n=>n.parent===current && n.size_bytes>0).sort((a,b)=>b.size_bytes-a.size_bytes),[nodes,current]);
  const total=siblings.reduce((n,i)=>n+i.size_bytes,0);
  const pageCount=Math.max(1,Math.ceil(siblings.length/100));
  const currentPage=Math.min(page,pageCount-1);
  const listed=siblings.slice(currentPage*100,currentPage*100+100);
  const visible=siblings.slice(0,79);
  const rest=siblings.slice(79).reduce((n,i)=>n+i.size_bytes,0);
  const tiles=layoutTreemap([...visible.map(n=>({id:n.id,size:n.size_bytes})),...(rest>0 ? [{id:-1,size:rest}] : [])],100,100);
  const explore=(id:number)=>{
    const node=nodes[id]; if(!node)return;
    if(node.kind==="dir"){setTrail(t=>[...t,id]);setPage(0);} else onInspect(id);
  };
  return <section className="treemap-panel panel"><div className="panel-heading"><div><span>Interactive space map</span><h2>See where it goes</h2></div><span className="data-note">Area = size</span></div><nav className="map-breadcrumbs" aria-label="Treemap location">{trail.map((id,index)=><button key={id} onClick={()=>{setTrail(t=>t.slice(0,index+1));setPage(0);}} aria-current={index===trail.length-1 ? "location" : undefined}>{nodes[id]?.name||"Scan root"}</button>)}</nav><p className="map-help">Select a folder to look inside; select a file to inspect it. Sizes reflect the files included in this scan.</p>{tiles.length ? <><div className="treemap" aria-label="Area-proportional storage map">{tiles.map((tile,index)=>{
    const node=nodes[tile.id], small=tile.width<12||tile.height<12;
    const label=node ? `${node.name}, ${FORMAT_SIZE(tile.size)}, ${(tile.size/total*100).toFixed(1)} percent, ${node.kind==="dir"?"open folder":"inspect file"}` : `Other items, ${FORMAT_SIZE(tile.size)}`;
    return tile.id===-1 ? <div key="other" className="map-tile map-other" title={label} style={{left:`${tile.x}%`,top:`${tile.y}%`,width:`${tile.width}%`,height:`${tile.height}%`}}>Other</div> : <button key={tile.id} className={`map-tile tone-${index%5} ${small?"small-tile":""}`} style={{left:`${tile.x}%`,top:`${tile.y}%`,width:`${tile.width}%`,height:`${tile.height}%`}} onClick={()=>explore(tile.id)} aria-label={label} title={label}><strong>{node.name}</strong><span>{FORMAT_SIZE(tile.size)}</span><small>{node.kind==="dir"?"Folder ↗":"File"}</small></button>;
  })}</div><details className="map-list"><summary>Accessible list of all {siblings.length} items</summary><ul>{listed.map(n=><li key={n.id}><button onClick={()=>explore(n.id)}><span>{n.name}</span><b>{FORMAT_SIZE(n.size_bytes)}</b><small>{n.kind==="dir"?"Open folder":"Inspect file"}</small></button></li>)}</ul>{pageCount>1&&<div className="map-pagination"><button disabled={currentPage===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {currentPage+1} of {pageCount}</span><button disabled={currentPage===pageCount-1} onClick={()=>setPage(p=>p+1)}>Next</button></div>}</details></> : <div className="map-empty">No non-empty items were included at this level. Use the location buttons above to go back.</div>}</section>;
}
