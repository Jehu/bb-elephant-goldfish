"""Demonstrate the restore hazard using a disposable mutant and synthetic mailbox model."""
from __future__ import annotations
import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args();root=a.root.resolve()
source=root/'source';mutant=root/'restore-mutant'
assert not mutant.exists()
shutil.copytree(source,mutant,ignore=shutil.ignore_patterns('.git','.venv','__pycache__','.pytest_cache'))
backup=mutant/'src/mailgw/backup.py';text=backup.read_text()
old='"WHERE sent_state!=\'complete\' AND append_phase=\'ready\'",'
assert text.count(old)==1
backup.write_text(text.replace(old,'"WHERE 0 AND sent_state!=\'complete\' AND append_phase=\'ready\'",'))
test=mutant/'tests/test_mailbox_sync.py';text=test.read_text()
start=text.index('def test_restore_before_append_intent_never_authorizes_another_append(')
end=text.index('\ndef test_restore_does_not_reopen_a_confirmed_sent_copy',start)
block=text[start:end]
for line in ['        assert row["append_phase"] == "append_started"\n','        assert row["sent_error"] == "restore_uncertain"\n']:
 assert line in block;block=block.replace(line,'')
needle='            assert mailbox.append_count == 1\n'
assert needle in block
block=block.replace(needle,'            print("research_append_count=", mailbox.append_count, "copy_state=", copy_state)\n'+needle)
test.write_text(text[:start]+block+text[end:])
env={**os.environ,'PYTHONPATH':str(mutant/'src'),'PYTHONDONTWRITEBYTECODE':'1'}
# Backup subprocesses deliberately discard PYTHONPATH. Each copy therefore
# needs its own installed package, not merely a parent-process path override.
subprocess.run(['uv','sync','--frozen','--directory',str(mutant)],check=True,stdout=subprocess.DEVNULL)
python=mutant/'.venv/bin/python'
location=subprocess.check_output([str(python),'-c','import mailgw;print(mailgw.__file__)'],env=env,text=True).strip()
assert location.startswith(str(mutant))
result=subprocess.run([str(python),'-m','pytest','-p','no:cacheprovider','--basetemp',str(root/'mutation-tmp'),str(test)+'::test_restore_before_append_intent_never_authorizes_another_append','-q'],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
(root/'restore-mutation.txt').write_text(result.stdout)
assert result.returncode==1 and '2 failed, 1 passed' in result.stdout,result.stdout[-2000:]
assert 'research_append_count= 2' in result.stdout
report={'expected_mutation_failure':True,'import_path':location,'returncode':result.returncode,'result':'2 failed, 1 passed','observed_append_count':2,'model':'Synthetic MailboxModel, no provider connection','mutation':'Disable restore classification for incomplete ready Sent rows','test_adjustment':'Remove two phase-label assertions so the unchanged duplicate-count assertion observes actual repeated APPEND'}
(root/'restore-mutation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
