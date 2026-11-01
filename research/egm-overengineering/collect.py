"""Archive bounded workflow pages, validate state transitions and materialize proxy-approved text."""
from __future__ import annotations
import argparse
import hashlib
import json
import subprocess
from pathlib import Path


def digest(s: str) -> str:
 return hashlib.sha256(s.encode()).hexdigest()


def collect(root: Path, run_id: str) -> tuple[dict, list[dict]]:
 folder=root/'runs'/run_id;folder.mkdir(parents=True,exist_ok=True)
 status=json.loads(subprocess.check_output(['bb','workflows','status',run_id],text=True))
 (folder/'status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n')
 cursor=0;records=[]
 while True:
  p=folder/f'history-{cursor}.jsonl'
  with p.open('w') as f:
   subprocess.run(['bb','workflows','history',run_id,'--cursor',str(cursor),'--limit','100'],stdout=f,check=True)
  page=[json.loads(l) for l in p.read_text().splitlines()]
  records.extend(d for d in page if d.get('type')=='call')
  meta=next(d for d in page if d.get('type')=='page')
  if not meta['hasMore']:break
  cursor=meta['nextCursor']
 if status['status']!='succeeded':
  return {'run':run_id,'status':status['status'],'calls':status['calls']},[]
 first=json.loads((folder/'history-0.jsonl').read_text().splitlines()[0])
 values=first.get('result',status.get('result'))
 if not isinstance(values,list) or len(values)!=3 or any(v is None for v in values):
  raise ValueError(f'{run_id}: expected three complete non-null cell states')
 rows=[]
 for v in values:
  cell=v['cell'];path=root/'cells'/cell['id'];artifacts=path/'artifacts';artifacts.mkdir(exist_ok=True)
  applied=v['decision']['decision']=='approve'
  assert v['applied']==applied
  assert v['currentDocument']==(v['proposal']['document'] if applied else cell['seed'])
  assert len(v['review1'])==5
  assert len(v['review2'])==(5 if applied else 0)
  if v['terminal']=='simulated_acceptance':assert applied and v['finalDecision']['decision']=='approve'
  (artifacts/'state.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
  for filename,content in [('draft.md',v['draft']['document']),('proposal.md',v['proposal']['document']),('preimage.md',cell['seed'])]:
   (artifacts/filename).write_text(content)
  target=path/'project/research-spec.md';target.write_text(v['currentDocument'])
  assert target.read_bytes()==v['currentDocument'].encode()
  chosen=[r for r in records if r.get('label','').startswith(cell['id']+' / ')]
  row={'cell':cell['id'],'scenario':cell['scenario'],'arm':cell['arm'],'run':run_id,
       'terminal':v['terminal'],'applied':applied,'confirmation':v['decision']['decision'],
       'final_decision':v['finalDecision']['decision'],'corrections':len(v['correction']),
       'draft_words':len(v['draft']['document'].split()),'final_words':len(v['currentDocument'].split()),
       'proxy_questions':len(v['decision']['questions'])+len(v['finalDecision']['questions']),
       'review1_words':sum(len(r['report'].split()) for r in v['review1']),
       'review2_words':sum(len(r['report'].split()) for r in v['review2']),
       'review1_findings':sum(r['report'].count('### FINDING') for r in v['review1']),
       'review2_findings':sum(r['report'].count('### FINDING') for r in v['review2']),
       'agent_calls':len(chosen),'agent_output_chars':sum(len(json.dumps(r.get('result'),ensure_ascii=False)) for r in chosen),
       'agent_elapsed_ms':sum((r.get('finishedAt') or 0)-(r.get('startedAt') or 0) for r in chosen if r.get('status')=='succeeded'),
       'document_sha256':digest(v['currentDocument']),'evaluation':v['evaluation']}
  (artifacts/'metrics.json').write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n');rows.append(row)
 return {'run':run_id,'status':status['status'],'calls':status['calls']},rows


def main() -> None:
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args();root=a.root.resolve()
 runs=json.loads((root/'runs.json').read_text())['primary'];summaries=[];rows=[]
 for run in runs:
  summary,values=collect(root,run);summaries.append(summary);rows.extend(values)
 (root/'aggregate.json').write_text(json.dumps({'runs':summaries,'cells':rows},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'runs':summaries,'cells':[{'cell':r['cell'],'terminal':r['terminal']} for r in rows]},indent=2))

if __name__=='__main__':main()
