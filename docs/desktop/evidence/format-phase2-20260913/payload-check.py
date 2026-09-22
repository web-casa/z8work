from pathlib import Path
import json,hashlib
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pins=json.loads(Path('packaging/desktop/capability-sources.json').read_text())
for arch in ['amd64','arm64']:
 ident='linux-'+arch;reports=Path('.desktop-local/format-phase2-linux-reports')/ident
 receipt=json.loads((reports/'deb/package.json').read_text());candidate=json.loads((reports/'candidate/candidate.json').read_text())
 archive=Path('.desktop-local/format-phase2-linux-packages')/ident/receipt['file'];assert sha(archive)==receipt['sha256']
 base=Path('.desktop-local/format-phase2-extracted')/ident
 engine=base/'usr/lib/Z8.Work Desktop Dev/engines';manifest=engine/'engines.json';m=json.loads(manifest.read_text())
 assert sha(manifest)==receipt['engineManifestSha256']==candidate['engineManifestSha256'];assert receipt['sourceCandidateSha256']==candidate['sha256']
 app=base/'usr/bin/z8-desktop';assert sha(app)==receipt['applicationSha256']==candidate['applicationSha256']
 actual=[]
 for p in engine.rglob('*'):
  assert not p.is_symlink(),p
  if p.is_file():actual.append(p.relative_to(engine).as_posix())
 assert sorted(actual)==sorted(list(m['files'])+['engines.json'])
 for filename,record in m['files'].items():
  path=engine/filename;assert sha(path)==record['sha256'];assert path.stat().st_size==record['bytes']
 for module in ['bmp','tga','qoi']:assert f'modules/{module}.so' in m['files']
 proof={'platform':ident,'sourceCommit':'e98f8bf1df1843f7e7f51bf5815531c0be51dbd2','run':34762003724,'packageSha256':sha(archive),'applicationSha256':sha(app),'engineManifestSha256':sha(manifest),'engineFilesVerified':len(m['files']),'matchesCandidate':True,'symlinks':False,'installedGuiTest':'not-run'}
 dst=Path('docs/desktop/evidence/format-phase2-20260913');(dst/f'{ident}-payload.json').write_text(json.dumps(proof,indent=2)+'\n')
 for src,name in [('candidate/quality.json','quality'),('deb/package.json','package'),('candidate/candidate.json','candidate')]: (dst/f'{ident}-{name}.json').write_bytes((reports/src).read_bytes())
 for pin in pins:
  if pin['id']==ident:pin['run']='34762003724';pin['sha256']=sha(archive)
 print(ident,'payload verified:',len(m['files']),'engine files')
Path('packaging/desktop/capability-sources.json').write_text(json.dumps(pins,indent='\t')+'\n')
