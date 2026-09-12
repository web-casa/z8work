import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base='/work/wine-prefix/drive_c/users/wine/icc-probe-c-coded'; await mkdir(base);
const run=args=>execFileSync('/usr/lib/wine/wine64',['/work/engines-reviewed/bin/magick.exe',...args],{cwd:base,encoding:'utf8',timeout:30000,maxBuffer:100000,env:{HOME:'/tmp',WINEPREFIX:'/work/wine-prefix',WINEDEBUG:'-all',LANG:'C.UTF-8'}});
const bs=String.fromCharCode(92), win=s=>s.replaceAll('/',bs), target='C:/users/wine/icc-probe-c-coded/';
run(['-size','96x64','gradient:red-blue','-profile',win('Z:/repo/tests/fixtures/display-p3.icc'),'PNG:'+win(target+'input.png')]);
const expected=await readFile('/repo/tests/fixtures/display-p3.icc'); const results=[];
for(const [name,arg] of [['plain',win(target+'plain.icc')],['explicit','ICC:'+win(target+'explicit.icc')],['relative','relative.icc']]){
 try {run([bs+bs+'?'+bs+win(target+'input.png'),arg]); const data=await readFile(base+'/'+name+'.icc'); results.push({name,passed:data.equals(expected),bytes:data.length});} catch(error){results.push({name,passed:false,error:error.message});}
}
await writeFile('/work/icc-probe-c-coded.json',JSON.stringify(results,null,2)+'\n'); console.log(JSON.stringify(results));
