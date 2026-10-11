export interface MapItem { id: number; size: number; }
export interface MapTile extends MapItem { x: number; y: number; width: number; height: number; }

/** Balanced binary partition: sibling areas are proportional and never overlap. */
export function layoutTreemap(items: MapItem[], width: number, height: number): MapTile[] {
  const source = items.filter(i => Number.isFinite(i.size) && i.size > 0).sort((a,b)=>b.size-a.size);
  const tiles: MapTile[]=[];
  function partition(group: MapItem[], x: number, y: number, w: number, h: number) {
    if (!group.length || w <= 0 || h <= 0) return;
    if (group.length===1) { tiles.push({...group[0],x,y,width:w,height:h}); return; }
    const total=group.reduce((n,i)=>n+i.size,0);
    let sum=0,split=1,best=Infinity;
    for(let i=0;i<group.length-1;i++) {
      sum+=group[i].size;
      if(Math.abs(total/2-sum)<best) {best=Math.abs(total/2-sum);split=i+1;}
    }
    const fraction=group.slice(0,split).reduce((n,i)=>n+i.size,0)/total;
    if(w>=h) { partition(group.slice(0,split),x,y,w*fraction,h); partition(group.slice(split),x+w*fraction,y,w*(1-fraction),h); }
    else { partition(group.slice(0,split),x,y,w,h*fraction); partition(group.slice(split),x,y+h*fraction,w,h*(1-fraction)); }
  }
  partition(source,0,0,width,height);
  return tiles;
}
