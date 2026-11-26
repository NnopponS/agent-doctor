import {analyzeMcpServer} from './engine/analyzer.js';
import {parseToolInput} from './engine/schema-input.js';

const $ = id => document.getElementById(id);
const sample = [
  {
    name: 'lookup_device_status',
    description: 'Look up the device status and return its latest recorded state. Catalog generated 2026-11-17T03:00:00Z. ' +
      'Use this lookup to return the recorded state for a known device identifier. '.repeat(10),
    inputSchema: {type:'object',properties:{deviceId:{type:'string'}},required:['deviceId','obsoleteFilter']}
  },
  {
    name: 'list_status_codes',
    description: 'List the documented device status codes and their meanings.',
    inputSchema: {type:'object',properties:{}},
    annotations: {readOnlyHint:true,destructiveHint:false}
  }
];
const candidate = [{
  name: 'lookup_device_status',
  description: 'Return the latest recorded status for a known device.',
  inputSchema: {type:'object',properties:{deviceId:{type:'string',description:'The exact device identifier.'}},required:['deviceId']},
  annotations: {readOnlyHint:true,destructiveHint:false}
},sample[1]];
const format = new Intl.NumberFormat('en');
const rank = {error:0,warning:1,info:2};
let report = null;

function el(name, text){
  const node=document.createElement(name);
  if(text!==undefined) node.textContent=text;
  return node;
}
function note(message, error=false){
  $('notice').textContent=message;
  $('notice').toggleAttribute('data-error',error);
}
function clearReport(){
  report=null;
  for(const id of ['score','tokens','issues']) $(id).textContent='–';
  for(const id of ['bars','findings','comparison','tool-count']) $(id).replaceChildren();
  $('mode').textContent='Static tool-schema analysis';
  $('comparison').hidden=true;
  $('download').disabled=true;
}
function audited(text,label) {
  return analyzeMcpServer({mode:'static-schema',serverName:label,tools:parseToolInput(text)});
}
function renderFindings(){
  const root=$('findings');
  root.replaceChildren();
  if(!report)return;
  const view=report.candidate||report.baseline;
  const filter=$('severity').value;
  const list=view.findings.filter(f=>filter==='all'||filter===f.severity)
    .sort((a,b)=>rank[a.severity]-rank[b.severity]);
  if(!list.length){root.append(el('p','No findings in this filter.'));return;}
  for(const f of list.slice(0,150)){
    const details=el('details');details.className='finding';details.dataset.level=f.severity;
    const summary=el('summary');summary.append(el('span',f.severity),document.createTextNode(' '+f.ruleId+' · '+f.target));
    details.append(summary,el('p',f.message),el('p',f.suggestion));
    root.append(details);
  }
  if (list.length>150)root.append(el('p','Showing 150 of '+list.length+' findings. Export JSON to see all.'));
}
function render(){
  $('download').disabled=false;
  const view=report.candidate||report.baseline;
  $('mode').textContent=report.candidate?'Candidate result · compared against baseline':'Baseline · static analysis only';
  $('score').textContent=view.score+'/100';
  $('tokens').textContent=format.format(view.totalTokens);
  $('issues').textContent=format.format(view.findings.length);
  $('tool-count').textContent=view.toolCount>8?'Top 8 of '+view.toolCount:view.toolCount+' tools';
  $('bars').replaceChildren();
  for(const p of view.tools.slice(0,8)){
    const item=el('li'),meter=el('progress');
    meter.max=Math.max(1,view.totalTokens);
    meter.value=p.totalTokens;
    meter.setAttribute('aria-label','Estimated tokens for '+p.name);
    item.append(el('span',p.name),meter,el('b',format.format(p.totalTokens)));$('bars').append(item);
  }
  const comparison=$('comparison');comparison.replaceChildren();comparison.hidden=!report.candidate;
  if(report.candidate){
    const before=report.baseline;
    const delta=view.totalTokens-before.totalTokens;
    const direction=delta===0?'No estimated token change':format.format(Math.abs(delta))+' estimated tokens '+(delta<0?'fewer':'more');
    comparison.append(el('strong',direction),el('span',before.score+' → '+view.score+' score · '+before.findings.length+' → '+view.findings.length+' findings · '+before.toolCount+' → '+view.toolCount+' tools'));
  }
  renderFindings();
}
function run(){
  try{
    if(!$('input').value.trim())throw new Error('Paste tool JSON or load the example first.');
    const baseline=audited($('input').value,'baseline');
    const candidate=$('candidate').open && $('second').value.trim()?audited($('second').value,'candidate'):null;
    report={format:'agent-doctor-static-report-v1',baseline,candidate};
    render();note('Audit complete. Token counts are estimates; this is not a live server or security audit.');
  }catch(error){clearReport();note(error instanceof Error?error.message:'Could not read this schema.',true);}
}
function load(compare){
  $('input').value=JSON.stringify(sample,null,2);
  $('candidate').open=compare;
  $('second').value=compare?JSON.stringify({jsonrpc:'2.0',id:1,result:{tools:candidate}},null,2):'';
  run();
}
$('sample').addEventListener('click',()=>load(false));
$('compare-example').addEventListener('click',()=>load(true));
$('audit').addEventListener('click',run);
$('severity').addEventListener('change',renderFindings);
for(const id of ['input','second'])$(id).addEventListener('input',()=>{ if(report){clearReport();note('Input changed. Run the audit again.');} });
$('candidate').addEventListener('toggle',()=>{if(report&&!!report.candidate!==($('candidate').open&&!!$('second').value.trim())){clearReport();note('Comparison changed. Run the audit again.');}});
$('reset').addEventListener('click',()=>{$('input').value='';$('second').value='';$('candidate').open=false;$('open').value='';clearReport();note('Input cleared.');$('input').focus();});
$('open').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{if(file.size>1_000_000)throw new Error('Choose a JSON file up to 1 MB.');$('input').value=await file.text();run();}
  catch(error){clearReport();note(error.message,true);}
  finally{event.target.value='';}
});
$('download').addEventListener('click',()=>{
  if(!report)return;
  const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='agent-doctor-report.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
load(false);
