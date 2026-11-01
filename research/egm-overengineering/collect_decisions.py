"""Archive supplementary decisions without dropping unresolved or unsafe judgments."""
from __future__ import annotations
import argparse,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args();root=a.root.resolve()
runs=json.loads((root/'runs.json').read_text());summary=[]
for key in ['followup','uncertainty_holdout','uncertainty_repeat']:
 run=runs[key];folder=root/'runs'/run;folder.mkdir(parents=True,exist_ok=True)
 status=json.loads(subprocess.check_output(['bb','workflows','status',run],text=True))
 (folder/'status.json').write_text(json.dumps(status,indent=2)+'\n')
 with (folder/'history-0.jsonl').open('w') as f:subprocess.run(['bb','workflows','history',run,'--cursor','0','--limit','100'],stdout=f,check=True)
 records=[json.loads(l) for l in (folder/'history-0.jsonl').read_text().splitlines()]
 assert not next(d for d in records if d.get('type')=='page')['hasMore']
 assert status['status']=='succeeded'
 result=records[0]['result'];assert isinstance(result,dict)
 assert all(x is not None for x in result['decisions'])
 (root/(key+'-results.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 for item in result['decisions']:
  summary.append({'trial':item['id'],'group':item['group'],'condition':item['condition'],'context':item['contextKey'],'decision':item['result']['decision'],'words':len((item['result']['reason']+' '+item['result']['next_action']).split()),'questions':len(item['result']['questions'])})
(root/'decision-metrics.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
