"""Extract tool names and numerical usage only; do not retain private reasoning events."""
from __future__ import annotations
import argparse,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args();root=a.root.resolve()
rows=[]
for f in sorted(root.glob('runs/*/history-*.jsonl')):
 for line in f.read_text().splitlines():
  c=json.loads(line)
  if c.get('type')!='call' or c.get('status')!='succeeded':continue
  thread=c.get('childThreadId')
  if not thread:continue
  events=json.loads(subprocess.check_output(['bb','thread','log',thread,'--json','--all'],text=True))
  tools=[];usage=None
  for event in events:
   data=event.get('data',{})
   if event['type']=='item/completed':
    item=data.get('item',{})
    if item.get('type')=='toolCall':tools.append({'server':item.get('server'),'tool':item.get('tool'),'status':item.get('status')})
    elif item.get('type') in ('commandExecution','fileChange','webSearch'):
     tools.append({'type':item['type']})
   if event['type']=='thread/tokenUsage/updated':
    total=data['tokenUsage']['total'];usage={k:total.get(k) for k in ['totalTokens','inputTokens','cachedInputTokens','outputTokens']}
  rows.append({'run':c['runId'],'call':c['callIndex'],'label':c['label'],'thread':thread,'tools':tools,'usage':usage})
(root/'event-audit.json').write_text(json.dumps(rows,indent=2)+'\n')
nonresult=[r for r in rows if any(t.get('tool')!='bb_workflow_result' for t in r['tools'])]
print(json.dumps({'calls_audited':len(rows),'calls_with_nonresult_tools':len(nonresult),'tool_names':sorted({str(t.get('tool',t.get('type'))) for r in rows for t in r['tools']}),'usage_records':sum(r['usage'] is not None for r in rows)},indent=2))
