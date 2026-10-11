import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/treemap.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { layoutTreemap } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
for (const values of [[1],[1,1],[90,7,2,1],[1,7,19,43,67,81],Array.from({length:1000},(_,i)=>(i*7919%10000)+1)]) {
  const sum=values.reduce((a,b)=>a+b,0);
  const tiles=layoutTreemap(values.map((size,id)=>({id,size})),800,350);
  assert.equal(tiles.length,values.length);
  assert.ok(Math.abs(tiles.reduce((a,t)=>a+t.width*t.height,0)-800*350)<1e-6);
  for(const t of tiles){
    assert.ok(t.x>=-1e-8 && t.y>=-1e-8 && t.x+t.width<=800+1e-8 && t.y+t.height<=350+1e-8);
    assert.ok(Math.abs(t.width*t.height/(800*350)-t.size/sum)<1e-8);
  }
  for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
    const a=tiles[i],b=tiles[j];
    const overlapW=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);
    const overlapH=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
    assert.ok(overlapW<1e-7 || overlapH<1e-7,'tiles must not overlap');
  }
}
assert.deepEqual(layoutTreemap([{id:1,size:0},{id:2,size:NaN},{id:3,size:-10}],800,350),[]);
assert.deepEqual(layoutTreemap([{id:1,size:5}],0,350),[]);
console.log('Treemap checks passed: proportional areas, boundaries, no overlaps, 1,000 nodes, empty and invalid data.');
