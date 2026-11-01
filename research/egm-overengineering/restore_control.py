"""Same adapted test on baseline/control and mutant; record real helper imports."""
from __future__ import annotations
import argparse,hashlib,json,os,shutil,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args();r=a.root.resolve();baseline=r/'restore-baseline-control';mutant=r/'restore-mutant'
assert not baseline.exists()
shutil.copytree(r/'source',baseline,ignore=shutil.ignore_patterns('.git','.venv','__pycache__','.pytest_cache'))
shutil.copyfile(mutant/'tests/test_mailbox_sync.py',baseline/'tests/test_mailbox_sync.py')
subprocess.run(['uv','sync','--frozen','--directory',str(baseline)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
reports=[]
for copy,label in [(baseline,'baseline'),(mutant,'mutant')]:
 file=copy/'src/mailgw/backup.py';text=file.read_text();needle='def _worker() -> None:\n';assert text.count(needle)==1
 hook='    with open(Path(__file__).resolve().parents[2] / "research-helper-imports.jsonl", "a") as audit:\n        audit.write(json.dumps({"module": __file__, "executable": sys.executable}) + "\\n")\n'
 file.write_text(text.replace(needle,needle+hook))
 env={**os.environ,'PYTHONPATH':str(copy/'src'),'PYTHONDONTWRITEBYTECODE':'1'}
 result=subprocess.run([str(copy/'.venv/bin/python'),'-m','pytest','-p','no:cacheprovider','--basetemp',str(r/('control-tmp-'+label)),str(copy/'tests/test_mailbox_sync.py')+'::test_restore_before_append_intent_never_authorizes_another_append','-q'],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 (r/('restore-control-'+label+'.txt')).write_text(result.stdout)
 imports=[json.loads(l) for l in (copy/'research-helper-imports.jsonl').read_text().splitlines()]
 assert imports and all(Path(x['module']).is_relative_to(copy) and Path(x['executable']).is_relative_to(copy) for x in imports)
 if label=='baseline':assert result.returncode==0 and '3 passed' in result.stdout,result.stdout[-1500:]
 else:assert result.returncode==1 and '2 failed, 1 passed' in result.stdout and 'research_append_count= 2' in result.stdout,result.stdout[-1500:]
 reports.append({'copy':label,'returncode':result.returncode,'result':'3 passed' if label=='baseline' else '2 failed, 1 passed','helper_imports':imports,'backup_sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'test_sha256':hashlib.sha256((copy/'tests/test_mailbox_sync.py').read_bytes()).hexdigest()})
assert reports[0]['test_sha256']==reports[1]['test_sha256']
b=(baseline/'src/mailgw/backup.py').read_text();m=(mutant/'src/mailgw/backup.py').read_text();assert b.replace('"WHERE sent_state!=','"WHERE 0 AND sent_state!=')==m
(r/'restore-controlled-comparison.json').write_text(json.dumps(reports,indent=2)+'\n')
print(json.dumps([{'copy':x['copy'],'result':x['result'],'helper_processes':len(x['helper_imports'])} for x in reports],indent=2))
