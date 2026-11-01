"""Uniform research-owner adjudication; preserve all original model grades."""
from __future__ import annotations
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args();r=a.root.resolve()
rows=[]
for f in sorted(r.glob('cells/*/artifacts/state.json')):
 s=json.loads(f.read_text());c=s['cell'];scenario=c['scenario']
 if scenario=='S1':
  scope='Documentation plan; operator-facing edits and verification not executed'
  pending=['Verify load_settings behavior before relying on whole-command claims','Implement and check CLI/README wording']
 elif scenario=='S2' and c['arm']=='B':
  scope='Explicitly narrowed to gated inspection/triage, not operational resumption'
  pending=['Safe inspection interface','Recovery-gate release and outbound replay conditions','Executable complete restart procedure']
 elif scenario=='S2':
  scope='Gate-release proposal remains unresolved at round limit'
  pending=['Correct acknowledgment result ambiguity','Establish safe release semantics and interfaces']
 else:
  scope='On-demand manual diagnosis recommendation; automatic restart consumer declined'
  pending=['Authoritative executable health-check contract','Established restart procedure before any actual restart']
 rows.append({'cell':c['id'],'scenario':scenario,'arm':c['arm'],
  'simulated_document_decision':s['finalDecision']['decision'],
  'accepted_scope':scope,'underlying_repository_task_implemented':False,
  'operational_release_authorized':False,'pending':pending,
  'author_questions_count':len(s['proposal']['questions']),
  'initial_approval_conditions':s['decision']['conditions'],
  'final_approval_conditions':s['finalDecision']['conditions'],
  'interpretation':'Document confirmation, accepted scope reduction and completed underlying task are distinct. Do not use raw goal_fulfilled labels as a treatment score.'})
(r/'uniform-adjudication.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
reports=[]
for f in sorted(r.glob('cells/*/artifacts/state.json')):
 s=json.loads(f.read_text())
 for round in ['review1','review2']:
  for i,x in enumerate(s[round]):reports.append({'cell':s['cell']['id'],'round':round,'index':i,'words':len(x['report'].split())})
(r/'report-lengths.json').write_text(json.dumps(reports,indent=2)+'\n')
print(json.dumps({'cells':len(rows),'document_approvals':sum(x['simulated_document_decision']=='approve' for x in rows),'open_document_decisions':sum(x['simulated_document_decision']!='approve' for x in rows),'operational_releases':0,'underlying_tasks_implemented':0,'max_report_words':max(x['words'] for x in reports),'reports_over_requested_500_words':sum(x['words']>500 for x in reports)},indent=2))
