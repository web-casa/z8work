import hashlib,json,sys,zipfile
from pathlib import Path
platform=sys.argv[1]
root=Path('.desktop-local/complete-downloads')/platform
reports=Path('.desktop-local/complete-reports')/platform
for line in (root/'SHA256SUMS').read_text().splitlines():
 expected,name=line.split(None,1)
 p=root/name.strip()
 assert hashlib.file_digest(p.open('rb'),'sha256').hexdigest()==expected,p
prepared=json.loads((reports/'windows-arm-preview/msix/prepared.json').read_text())
expected={n:i for n,i in prepared['files'].items() if not n.startswith('Assets/') and n!='AppxManifest.xml'}
with zipfile.ZipFile(root/'Z8.Work-windows-arm64-preview.zip') as z:
 names=[i.filename for i in z.infolist() if not i.is_dir()]
 assert len(names)==len(set(names)) and set(names)==set(expected)
 for name in names:
  data=z.read(name);info=expected[name]
  assert len(data)==info['bytes'] and hashlib.sha256(data).hexdigest()==info['sha256'],name
result={'status':'passed','zipFiles':len(expected),'source':'Independent MSIX prepared payload, excluding package-only assets/manifest','checksums':'passed'}
(reports/'download-check.json').write_text(json.dumps(result,indent=2)+'\n')
print(result)
