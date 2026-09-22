import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { processTests, validateTestResult } from '/repo/scripts/lib/desktop-windows-acceptance.mjs';
import { artifactMatrix, validateBuild } from '/repo/scripts/lib/desktop-artifacts.mjs';
const out='/work/runtime-isolated';
await mkdir(out);
const run=(exe,args,timeout=65000)=>execFileSync('/usr/lib/wine/wine64',[exe,...args],{encoding:'utf8',timeout,maxBuffer:2*1024**2,env:{HOME:'/tmp',WINEPREFIX:'/work/wine-prefix',WINEDEBUG:'-all',LANG:'C.UTF-8'}});
run('/work/candidate-final/z8-desktop.exe',['--build-info-file','Z:\\work\\runtime-isolated\\build-info.json']);
const info=JSON.parse(await readFile(out+'/build-info.json'));
const matrix=await artifactMatrix();
validateBuild(info,matrix.artifacts.find(a=>a.id==='windows-x64-msix'),matrix.version);
assert.equal(info.fileDialog,'native');
const list=run('/work/validation-run-final.exe',['Z:\\work\\native-tests-final.exe','--list']);
await writeFile(out+'/tests-list.txt',list);
const selected=[...processTests,'failure::tests::output_io_categories_follow_error_kinds_not_message_text','failure::tests::public_categories_match_shared_frontend_fixture'];
const results=[];
for(const name of selected){
 try {
 assert.ok(list.split(/\r?\n/).includes(name+': test'));
 const result=processTests.includes(name) ? run('/work/validation-run-final.exe',['Z:\\work\\native-tests-final.exe','--exact',name]) : run('/work/native-tests-final.exe',['--exact',name,'--test-threads=1']);
 await writeFile(out+'/'+name.split('::').at(-1)+'.txt',result);
 if(processTests.includes(name)) validateTestResult(result,name);
 else { assert.ok(result.includes(`test ${name} ... ok`)); assert.match(result,/^test result: ok\. 1 passed; 0 failed; 0 ignored; 0 measured; \d+ filtered out;/m); }
 results.push({name,status:'passed'});
 } catch(error) {
 await writeFile(out+'/'+name.split('::').at(-1)+'.error.txt',String(error.stack)+'\n'+String(error.stdout??'')+String(error.stderr??''));
 results.push({name,status:'failed',error:error.message});
 }
}
const status=results.every(r=>r.status==='passed')?'passed':'failed';
if(status==='failed') process.exitCode=1;
await writeFile(out+'/report.json',JSON.stringify({schema:1,status,results,execution:'Wine AMD64 emulation on ARM64 Linux',nativeWindows:false,gui:'not-run',installation:'not-run',buildInfo:info,lifecycleTests:processTests,failureClassificationTests:selected.slice(processTests.length)},null,2)+'\n');
