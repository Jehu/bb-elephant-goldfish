// Execute the real orchestration source against deterministic agent doubles.
// This diagnoses routing and authorization semantics without model calls or files in source projects.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
const root=process.argv[2];
if(!root) throw Error('research root required');
const original=fs.readFileSync(new URL('./workflow.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const args={templates:Array.from({length:5},(_,i)=>({plan:{lens:'fixture-'+i,standard:'fixture'},system:'fixture reviewer'})),treatmentSystems:[],treatmentShared:'',cells:[1,2,3].map(i=>({id:'fixture-'+i,arm:'A',seed:'ORIGINAL',goal:'fixture',profile:'fixture profile',publicConstraints:'fixture',context:'fixture'}))};
async function run(source,mode) {
 const calls=[];
 const agent=async(prompt,opts)=>{
  calls.push({label:opts.label,receivedQuestion:prompt.includes('QUESTION_ROUTING_SENTINEL')});
  const p=opts.schema.properties;
  if(p.document) return {document:'PROPOSED',rationale:'AUTHOR RATIONALE',questions:['QUESTION_ROUTING_SENTINEL']};
  if(p.report) return {report:'NO FINDINGS'};
  if(p.decision) return {decision:mode==='reject'?'reject':mode==='revision'?'request_revision':'approve',reason:'fixture only',questions:[],conditions:mode==='conditional'?['MUST complete the missing check BEFORE applying this exact document.']:[],finding_decisions:[]};
  return {goal_fulfilled:'uncertain',unsafe_approval:'uncertain',unjustified_expansion:'uncertain',unnecessary_process:'uncertain',decision_support:'uncertain',evidence:[],limitations:['test double']};
 };
 const pipeline=async(items,...stages)=>Promise.all(items.map(async(item,index)=>{let value=item;for(const stage of stages)value=await stage(value,item,index);return value;}));
 const result=await new AsyncFunction('args','agent','pipeline',source.replace('export const meta','const meta'))(args,agent,pipeline);
 return {result,calls};
}
const base=await run(original,'conditional');
const confirmations=base.calls.filter(c=>c.label.endsWith(' / confirmation'));
if(confirmations.some(c=>c.receivedQuestion))throw Error('Expected v1 question-routing omission was not reproduced');
if(!base.result.every(s=>s.applied))throw Error('Expected v1 conditional-approval behavior was not reproduced');
const rejected=await run(original,'reject');
if(!rejected.result.every(s=>!s.applied&&s.currentDocument==='ORIGINAL'&&s.review2.length===0))throw Error('Reject branch changed document');
const requested=await run(original,'revision');
if(!requested.result.every(s=>!s.applied&&s.currentDocument==='ORIGINAL'&&s.correction.length===1))throw Error('Bounded revision branch invalid');
const routed=original.replaceAll('proposal.rationale,','proposal.rationale+"\\nAUTHOR QUESTIONS: "+JSON.stringify(proposal.questions),');
const corrected=await run(routed,'approve');
if(!corrected.calls.filter(c=>c.label.endsWith(' / confirmation')).every(c=>c.receivedQuestion))throw Error('Routing diagnostic failed');
const report={workflow_sha256:crypto.createHash('sha256').update(original).digest('hex'),method:'Actual workflow source + deterministic agent doubles; no additional LLM trials',v1_missing_explicit_questions:true,v1_applies_approve_with_unmet_preapplication_condition:true,reject_preserves_document:true,request_revision_preserves_document_after_one_correction:true,explicit_question_routing_diagnostic_passed:true,scope:'The transient routing change is diagnostic only. Original trials and production code remain unchanged; natural-language condition semantics need explicit adjudication.'};
fs.writeFileSync(path.join(root,'flow-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
