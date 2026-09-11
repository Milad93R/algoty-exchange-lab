const names={gt:'Above',gte:'At least',lt:'Below',lte:'At most',crossAbove:'Crosses above',crossBelow:'Crosses below',all:'AND · all conditions',any:'OR · any condition',not:'NOT · invert',sequence:'Ordered sequence',consecutive:'Consecutive candles',schedule:'Trading hours'};
const describe=v=>typeof v==='number'?String(v):[v?.kind?.toUpperCase(),v?.period&&`Period ${v.period}`,v?.offset&&`${v.offset} candles back`,v?.symbol,v?.timeframe].filter(Boolean).join(' · ');
export function missionGraph(flow){
 const nodes=[],edges=[];let row=0;
 function add(id,title,detail,kind,x,y,rule,phase,inputs=[]){const n={id,type:'mission',position:{x,y},data:{title,detail,kind,rule,phase,inputs}};nodes.push(n);return n;}
 function edge(source,target,port){edges.push({id:`${source}>${target}:${port}`,source,target,targetHandle:port,type:'smoothstep'});}
 function visit(rule,phase){
  const kids=rule.children||(rule.child?[rule.child]:[]);const dependencies=[];
  if(rule.left!==undefined){for(const [side,v] of [['a',rule.left],['b',rule.right]]){const n=add(`${phase}:${rule.id}:${side}`,typeof v==='number'?'Value':v.kind.toUpperCase(),describe(v),typeof v==='number'?'value':'indicator',0,row++*150,rule.id,phase);dependencies.push([n,side]);}}
  else for(const [i,k] of kids.entries())dependencies.push([visit(k,phase),`in${i}`]);
  const x=dependencies.length?Math.max(...dependencies.map(([n])=>n.position.x))+285:0;
  const y=dependencies.length?dependencies.reduce((s,[n])=>s+n.position.y,0)/dependencies.length:row++*150;
  const detail=rule.left!==undefined?'A → compare → B':rule.op==='schedule'?`${rule.startHour}:00–${rule.endHour}:00 UTC`:rule.bars?`${rule.bars} closed candles`:rule.within?`Within ${rule.within} candles`:`${kids.length} inputs`;
  const n=add(`${phase}:${rule.id}`,names[rule.op]||rule.op,detail,rule.left!==undefined?'condition':'logic',x,y,rule.id,phase,dependencies.map(([,port])=>port));dependencies.forEach(([d,port])=>edge(d.id,n.id,port));return n;
 }
 for(const phase of ['entry','exit']){const n=visit(flow[phase],phase);const out=add(`${phase}:output`,phase==='entry'?'Entry signal':'Exit signal',phase==='entry'?'Continue to risk & AI checks':'Continue to exit rules','output',n.position.x+285,n.position.y,null,phase,['signal']);edge(n.id,out.id,'signal');row+=1.5;}
 return {nodes,edges};
}
