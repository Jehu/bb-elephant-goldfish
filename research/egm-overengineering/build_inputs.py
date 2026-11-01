"""Freeze paired conditions and preregistered case allocation."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

def main() -> None:
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args()
 root=a.root.resolve();repo=Path(__file__).resolve().parents[2]
 scenarios=json.loads((root/'scenarios.json').read_text())
 templates=json.loads((root/'prompt-templates.json').read_text())
 shared='''Evaluate the supported user purpose, stated boundaries and concrete effects. Safety needs may follow from offered operations and plausible harm paths even when not expressly written. Missing context justifies neither new guarantees nor dismissing plausible harm; mark decisive uncertainty. Explain only new or changed consequences; lists are aids, not required negative proofs. Before recommending material new persistent state or operating duties, briefly check omission, a narrower supported scope or manual handling; elaborate only useful alternatives and recommend one with user-visible consequences. Distinguish safety needs, additional service guarantees and chosen mechanisms. Existing decisions hold for their identifiable subject and assumptions; documentation approval is not risk acceptance or operational release. Reopen them for concrete new evidence, usage or assumptions. A further check needs a specific unanswered material question, not an automatic full inventory.'''
 implementation=(repo/'upstream/document_standards/implementation-readiness-standard.md').read_text()
 start=implementation.index('## Core Principle');end=implementation.index('## Phasing & Checkpoints')
 new_impl=implementation[:start]+'''## Core Principle

A plan is ready when a competent implementer can fulfill the agreed scope and safety boundaries. Resolve choices whose different answers materially change externally observable behavior, data integrity, trust boundaries or operating duties; name the concrete difference. Within those limits, internal implementation choices remain with the implementer. Preserve already agreed guarantees until explicitly changed. Do not fail a plan merely because it leaves irrelevant internals unspecified.

'''+implementation[end:]
 feature=(repo/'upstream/document_standards/feature-spec-standard.md').read_text()
 start=feature.index('## The Alternatives Rule');end=feature.index('## Risks & Limits')
 new_feature=feature[:start]+'''## The Alternatives Rule

For a change with material consequences, briefly consider omitting the change, narrowing its supported scope or using a manual step. Explain a useful simpler alternative if one exists and recommend the smallest sufficient solution. Do not demand a formal alternatives inventory for every minor change or invent inferior architectures to fill a template.

'''+feature[end:]
 systems=[]
 for template in templates:
  s=template['system']
  if template['plan']['standard']=='implementation-readiness-standard':
   assert implementation in s;s=s.replace(implementation,new_impl)
  if template['plan']['standard']=='feature-spec-standard':
   assert feature in s;s=s.replace(feature,new_feature)
  systems.append(s+'\n## Proportionality and decision contract\n'+shared)
 cells=[]
 for n,scenario in enumerate(scenarios):
  for arm in ['A','B']:
   cell={**scenario,'scenario':scenario['id'],'id':f'cell-{n*2+(1 if arm=="A" else 2):02d}','arm':arm}
   cell['publicConstraints']='Single local mailbox and local clients. Keep current supported scope. New always-on services, independent availability or fully automatic recovery are not pre-approved. Unknown preferences must be flagged rather than invented.'
   if scenario['id']=='S1':cell['publicConstraints']='Documentation/help clarification only. Keep existing command behavior; no new configuration, runtime state or architecture project.'
   cells.append(cell)
 batches=[['cell-01','cell-04','cell-05'],['cell-02','cell-03','cell-06']]
 for i,ids in enumerate(batches,1):
  args={'templates':templates,'treatmentSystems':systems,'treatmentShared':shared,'cells':[c for ident in ids for c in cells if c['id']==ident]}
  assert len(args['cells']) == 3
  assert [c['id'] for c in args['cells']] == ids
  (root/f'batch-{i}-args.json').write_text(json.dumps(args,ensure_ascii=False,indent=2)+'\n')
 (root/'intervention.md').write_text('# Shared intervention\n\n'+shared+'\n\n# Readiness replacement\n\n'+new_impl+'\n\n# Feature standard replacement\n\n'+new_feature)
 m=json.loads((root/'manifest.json').read_text());m['allocation']=batches;m['workflow_sha256']=hashlib.sha256((repo/'research/egm-overengineering/workflow.js').read_bytes()).hexdigest()
 for name in ['batch-1-args.json','batch-2-args.json','intervention.md']:
  m[name+'_sha256']=hashlib.sha256((root/name).read_bytes()).hexdigest()
 m['protocol_sha256']=hashlib.sha256((repo/'research/egm-overengineering/PROTOCOL.md').read_bytes()).hexdigest()
 (root/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
 assert len(cells) == 6 and len({c['id'] for c in cells}) == 6
 print(json.dumps({'batches':batches,'max_calls_per_batch':51,'root':str(root)},indent=2))

if __name__=='__main__':main()
