'use client';
import {useMemo,useEffect,useRef,memo} from 'react';
import {ReactFlow,ReactFlowProvider,Background,Controls,MiniMap,Handle,Position,useNodesState,useReactFlow,MarkerType} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {missionGraph} from './mission-graph.mjs';
const icons={indicator:'∿',value:'#',condition:'⋚',pattern:'▮',logic:'⋈',output:'↗'};
const MissionNode=memo(function MissionNode({data,selected}){return <div className={`mission-flow-node ${data.kind} ${data.status||'idle'} ${selected?'chosen':''}`}>
 {data.inputs.map((p,i)=><Handle key={p} id={p} type="target" position={Position.Left} isConnectable={false} style={{top:`${100*(i+1)/(data.inputs.length+1)}%`}}/>)}
 <div className="mission-flow-node-head"><span className="mission-flow-node-icon">{icons[data.kind]}</span><strong>{data.title}</strong><span className="mission-flow-node-status">{data.status==='pass'?'✓':data.status==='fail'?'−':'○'}</span></div>
 <div className="mission-flow-node-detail">{data.detail}</div><div className="mission-flow-node-footer">{data.phase.toUpperCase()}<span>{data.kind==='output'?'SIGNAL':data.kind==='indicator'||data.kind==='value'?'NUMBER':'BOOLEAN'}</span></div>
 {data.kind!=='output'&&<Handle id="out" type="source" position={Position.Right} isConnectable={false}/>}
 </div>});
const nodeTypes={mission:MissionNode};
const EMPTY_TRACE={};
function Canvas({flow,trace=EMPTY_TRACE,selected,onSelect}){
 const graph=useMemo(()=>missionGraph(flow),[flow]);const topology=graph.nodes.map(n=>n.id).join('|');
 const [nodes,setNodes,onNodesChange]=useNodesState([]);const api=useReactFlow();const previous=useRef('');const surface=useRef(null);
 useEffect(()=>{let timer;const observer=new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>api.fitView({padding:.18,maxZoom:1}),120)});if(surface.current)observer.observe(surface.current);return()=>{observer.disconnect();clearTimeout(timer)}},[api]);
 useEffect(()=>{const changed=previous.current!==topology;previous.current=topology;setNodes(old=>{const positions=new Map(old.map(n=>[n.id,n.position]));return graph.nodes.map(n=>({...n,position:!changed&&positions.has(n.id)?positions.get(n.id):n.position,selected:!!n.data.rule&&n.data.rule===selected,data:{...n.data,status:trace[n.data.rule]?.status||'idle'}}))});if(changed){const t=setTimeout(()=>api.fitView({padding:.18,maxZoom:1}),100);return()=>clearTimeout(t)}},[graph,trace,selected,topology,setNodes,api]);
 const edges=graph.edges.map(e=>{const n=graph.nodes.find(n=>n.id===e.source);const pass=trace[n?.data.rule]?.status==='pass';return {...e,markerEnd:{type:MarkerType.ArrowClosed,width:16,height:16,color:pass?'#487657':'#a6a79e'},style:{stroke:pass?'#487657':'#a6a79e',strokeWidth:1.6},animated:pass}});
 return <div className="scanner-flow-canvas"><div className="scanner-flow-canvas-toolbar"><span><i/> MISSION FLOW</span><button type="button" onClick={()=>{setNodes(graph.nodes.map(n=>({...n,data:{...n.data,status:trace[n.data.rule]?.status||'idle'}})));setTimeout(()=>api.fitView({padding:.18,maxZoom:1}),50)}}>Arrange nodes ↗</button></div><div className="scanner-flow-canvas-surface" ref={surface}><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeClick={(_,n)=>{if(n.data.rule)onSelect?.(n.data.rule)}} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} minZoom={.12} maxZoom={1.8} fitView fitViewOptions={{padding:.18,maxZoom:1}} proOptions={{hideAttribution:true}}><Background color="#d2d2c8" gap={20} size={1}/><Controls showInteractive={false}/><MiniMap nodeColor={n=>({indicator:'#adb5a6',condition:'#d8cbbc',logic:'#626a5b',value:'#d4d3c9',output:'#ed603c'})[n.data.kind]} pannable zoomable/></ReactFlow></div><div className="scanner-flow-canvas-caption"><span>Drag nodes · Scroll to zoom · Drag canvas to pan</span><span>{onSelect?'Select a node to inspect its rule':'Rule connections'} · {nodes.length} nodes</span></div></div>
}
export default function MissionCanvas(props){return <ReactFlowProvider><Canvas {...props}/></ReactFlowProvider>}
