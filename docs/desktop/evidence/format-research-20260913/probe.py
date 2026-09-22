from pathlib import Path
import subprocess,json,os,hashlib
root=Path('.desktop-local/complete-extracted/linux-arm64/usr/lib/Z8.Work Desktop Dev/engines').resolve()
out=Path('.desktop-local/format-research').resolve()
env={'PATH':'/nonexistent','HOME':str(out),'LANG':'C.UTF-8','MAGICK_CODER_MODULE_PATH':str(root/'modules'),'MAGICK_CONFIGURE_PATH':str(root/'magick-config'),'LIBHEIF_PLUGIN_PATH':str(root/'heif-plugins')}
loader=[str(root/'lib/ld-linux-aarch64.so.1'),'--library-path',str(root/'lib')]
def run(engine,args):
 r=subprocess.run(loader+[str(root/'bin'/engine)]+args,env=env,cwd=out,capture_output=True,text=True,timeout=45)
 return {'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
for name,engine,args in [('magick-version','magick',['-version']),('magick-formats','magick',['-list','format']),('ffmpeg-encoders','ffmpeg',['-hide_banner','-encoders']),('pandoc-inputs','pandoc',['--list-input-formats']),('pandoc-outputs','pandoc',['--list-output-formats'])]:
 r=run(engine,args);(out/(name+'.json')).write_text(json.dumps(r,indent=2)+'\n')
# Small synthetic input, no user files. Listing is only discovery; round trips are a separate check.
(out/'sample.ppm').write_bytes(b'P6\n2 2\n255\n'+bytes([255,0,0,0,255,0,0,0,255,255,255,255]))
results=[]
for fmt in ['bmp','gif','ico','tga','qoi','ppm','tiff','jxl','exr','jp2','heic','avif']:
 enc=run('magick',['sample.ppm',f'{fmt.upper()}:strict-output.{fmt}'])
 dec=run('magick',[f'strict-output.{fmt}','-format','%m %w %h','info:']) if enc['exit']==0 else None
 results.append({'format':fmt,'encode':enc,'decodeDimensions':dec})
(out/'roundtrip.json').write_text(json.dumps({'scope':'engine-only synthetic 2x2 smoke, not GUI support or full quality acceptance','platform':'linux-arm64','manifestSha256':hashlib.sha256((root/'engines.json').read_bytes()).hexdigest(),'results':results},indent=2)+'\n')
for r in results:print(r['format'],r['encode']['exit'],r['decodeDimensions']['stdout'] if r['decodeDimensions'] else r['encode']['stderr'][:130])
