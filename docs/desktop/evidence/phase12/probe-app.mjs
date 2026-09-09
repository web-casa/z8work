import {execFileSync} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const binary='/work/delivery/candidate/z8-desktop.exe';
const results=[];
function run(args, expected=0){let status=0;try{execFileSync('/usr/lib/wine/wine64',[binary,...args],{timeout:30000,stdio:'pipe',cwd:'/work'});}catch(e){status=e.status;assert.equal(e.signal,null);}assert.equal(status,expected);results.push({args,exitCode:status});}
run(['--runtime-info-file','Z:\\work\\runtime-delivery.json']);
const runtime=readFileSync('/work/runtime-delivery.json');
const info=JSON.parse(runtime);assert.equal(info.webview.status,'unavailable');assert.equal(info.gui,'not-run');
run(['--runtime-info-file','Z:\\work\\runtime-delivery.json'],1);
assert.deepEqual(readFileSync('/work/runtime-delivery.json'),runtime);
run(['--runtime-info-file'],2);
run(['--runtime-info-file','relative-probe.json'],1);
assert.equal(existsSync('/work/relative-probe.json'),false);
run(['--build-info-file','Z:\\work\\build-info-delivery.json']);
console.log(JSON.stringify({execution:'wine',status:'passed',gui:'not-run',cases:results},null,2));
