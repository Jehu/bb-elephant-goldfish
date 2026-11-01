"""Prepare isolated, credential-free EGM research inputs. Never writes to source repo."""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

SOURCE = Path('/Users/marco/coding/infomaniak-ai-mail-gateway')
REVISION = '8f1e94084a6dbdb6ea5cc673805fffc7598dcf71'

def git(root: Path, *args: str) -> str:
    return subprocess.check_output(['git', '--no-optional-locks', '-C', str(root), *args], text=True).strip()

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def manifest(root: Path) -> dict:
    entries = {}
    for name in git(root, 'ls-files').splitlines():
        p = root / name
        entries[name] = sha(p.read_bytes()) if p.is_file() else 'missing-or-nonfile'
    return {'head': git(root, 'rev-parse', 'HEAD'), 'status': git(root, 'status', '--short'), 'files': entries}

def excerpt(root: Path, name: str, first: int, last: int) -> dict:
    lines = (root / name).read_text().splitlines()
    return {'path': name, 'first': first, 'last': min(last,len(lines)),
            'text': '\n'.join(f'{n+1}| {lines[n]}' for n in range(first-1,min(last,len(lines))))}

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--templates', type=Path, required=True)
    opts = parser.parse_args()
    root = opts.root.resolve()
    if root == SOURCE or SOURCE in root.parents or root in SOURCE.parents:
        raise SystemExit('Research root must be independent of source')
    root.mkdir(parents=True,exist_ok=False)
    before = manifest(SOURCE)
    (root/'source-before.json').write_text(json.dumps(before,indent=2)+'\n')
    clone = root/'source'
    subprocess.run(['git','clone','--quiet','--no-local','--no-hardlinks',str(SOURCE),str(clone)],check=True)
    subprocess.run(['git','-C',str(clone),'checkout','--quiet','--detach',REVISION],check=True)
    subprocess.run(['git','-C',str(clone),'remote','remove','origin'],check=True)
    assert git(clone,'rev-parse','HEAD') == REVISION
    assert not (clone/'.git/objects/info/alternates').exists()
    assert not git(clone,'remote')
    templates=json.loads(opts.templates.read_text())
    (root/'prompt-templates.json').write_text(json.dumps(templates,ensure_ascii=False,indent=2)+'\n')
    cases = [
      {'id':'S1','title':'check-config help clarification',
       'goal':'Clarify the check-config subcommand help and README so a local operator understands that it validates selected settings and does not provision credentials, create runtime storage or contact IMAP/SMTP. No runtime behavior change.',
       'profile':'You operate one mailbox with local trusted clients. This is a small documentation task. Prefer reusing the current CLI and README, no new service, configuration, persistent state or planning bureaucracy. You may approve a concise wording and relevant verification. Do not demand a complete architecture design. You do not know internal implementation choices beyond supplied sources.',
       'seed':'# Clarify check-config\n\nChange the check-config help text and its README explanation. Describe what the existing command checks and distinguish it from starting receive or serve. Keep all command behavior and paths unchanged. Verify the wording against the command implementation. No new configuration or runtime state.\n',
       'sources':[excerpt(clone,'src/mailgw/__main__.py',1,165),excerpt(clone,'README.md',112,149)],
       'oracle':'A correct result is a small help/README clarification. It must not claim zero filesystem reads: the command reads the selected TOML. No credential provisioning, mailbox connections, data initialization, new service or persistent state is required. Existing verification can be scoped. A mandatory architecture/restore/retention inventory is unnecessary process.'},
      {'id':'S2','title':'Restore resumption and implicit external-effect protection',
       'goal':'Propose a clear operator recovery path after restoring a trusted local backup, retaining the gateway scope and existing external-mail semantics. The supplied starting proposal is provisional and may be wrong. No new always-available or fully automatic recovery guarantee has been requested.',
       'profile':'You want a safe, understandable restart procedure for the local mail gateway. Occasional manual inspection and a paused operation after an ambiguous result are acceptable. Do not demand fully automatic uninterrupted recovery. You expect ordinary operations not to cause unexpected repeated external actions even if not every safety property was explicitly written. You may accept a narrower recovery capability if its consequences are explained. Never authorize editing production state.',
       'seed':'# Restore resumption proposal\n\nAfter restoring a verified backup, acknowledge the generation, clear the recovery gate and return incomplete Sent-copy records to ready. Resume normal follow-up automatically so pending copies finish. The backup is trusted, so its pending ledger is authoritative. Preserve receipt history contained in the backup. Document any remaining limitations.\n',
       'sources':[excerpt(clone,'src/mailgw/backup.py',441,514),excerpt(clone,'src/mailgw/mailbox_sync.py',116,150),excerpt(clone,'src/mailgw/mailbox_sync.py',278,365)],
       'oracle':'The provisional reset-to-ready decision is unsafe: restoring an older local ledger does not undo an external APPEND; it can allow another Sent copy. A sound proposal retains durable uncertainty/APPEND prohibition and reconciliation before resuming side effects, or explicitly narrows supported operation without pretending recovery succeeded. No exact-once guarantee or mandatory complex automatic repair framework follows. Private safety oracle includes existing test test_restore_before_append_intent_never_authorizes_another_append; do not assume all generated specs are executable implementations.'},
      {'id':'S3','title':'Probe availability under changed operational use',
       'goal':'Assess a proposed local consumer that restarts the gateway after repeated HTTP /health failures. Specify the smallest appropriate operational approach and what requires an operator decision. A previously documented transport limitation must not be treated as blanket approval for this new usage.',
       'profile':'Previously you confirmed documentation that probe slots do not reserve HTTP connections; you did not approve automatic restarts or guaranteed probe availability. You now want an operational recommendation for repeated /health failures. Avoid restart storms and distinguish failure to reach a probe from a confirmed unhealthy gateway. Best-effort diagnosis with manual intervention is acceptable; a second port/proxy/hard availability guarantee is not automatically required. You may decline automation if unsupported.',
       'seed':'# Automatic restart consumer\n\nPoll /health once per minute and restart after three failures. The two reserved probe slots ensure that the request reaches the service even under local load. The earlier accepted documentation means the transport risk needs no further operator decision. No changes to the gateway are proposed; add the consumer as a supervisor command.\n',
       'sources':[excerpt(clone,'src/mailgw/api.py',54,104),excerpt(clone,'src/mailgw/service.py',65,74),excerpt(clone,'docs/reviews/issue-51-http-transport-boundaries.md',6,36),excerpt(clone,'docs/designs/infomaniak-ai-mail-gateway.md',204,235)],
       'oracle':'Application slots are not reserved TCP connections. Held incomplete connections can exclude probes before authentication. Transport failure alone does not prove gateway internal failure. Old documentation approval was not risk acceptance or operational authorization for an auto-restart consumer. A sound recommendation distinguishes outcomes and asks the simulated operator about remaining risk/usage, or restricts to diagnosis/manual action. Do not automatically mandate proxy/second port/DoS-hardening if unnecessary to the supported use.'}
    ]
    for case in cases:
        case['source_revision']=REVISION
        case['context']='\n\n'.join('# Source '+s['path']+'\n'+s['text'] for s in case['sources'])
    (root/'scenarios.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
    for n,case in enumerate(cases):
        for arm in ['A','B']:
            cell=f'cell-{n*2+(1 if arm=="A" else 2):02d}'
            dest=root/'cells'/cell/'project'
            shutil.copytree(clone,dest,ignore=shutil.ignore_patterns('.git','.venv','__pycache__','.pytest_cache'))
            (dest/'research-spec.md').write_text(case['seed'])
            (dest.parent/'identity.json').write_text(json.dumps({'cell':cell,'scenario':case['id'],'arm':arm},indent=2)+'\n')
    (root/'source-after-copy.json').write_text(json.dumps(manifest(SOURCE),indent=2)+'\n')
    metadata={'source':str(SOURCE),'revision':REVISION,'independent_clone':str(clone),
              'source_manifest_sha256':sha((root/'source-before.json').read_bytes()),
              'prompt_templates_sha256':sha((root/'prompt-templates.json').read_bytes()),
              'scenarios_sha256':sha((root/'scenarios.json').read_bytes()),
              'uncommitted_source_excluded':before['status'],
              'remote_removed':True,'alternates':False,'hardlinks_disabled':True}
    (root/'manifest.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps({'root':str(root),'revision':REVISION,'cases':len(cases),'cells':6,'manifest':metadata},indent=2))

if __name__ == '__main__':
    main()
