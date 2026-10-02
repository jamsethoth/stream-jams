/* global queueMicrotask, process, setTimeout */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { parseArgs, parseSample, orderEvidence, playbackEvidence, run } from './desktop-overlay-game-check.mjs';
const row = (hwnd, rank) => ({ hwnd, pid: 1, rank, visible: true, live: true, exStyle: 0x08000020, bounds: [0,0,100,100] });
const sample = { kind: 'sample', elapsedMs: 1, foreground: 2, games: [row(2,2)], overlays: [row(1,1)] };
test('strict finite arguments and explicit trigger', () => {
 assert.equal(parseArgs([]).trigger, false);
 for (const args of [['--base-url','http://example.com'], ['--base-url','http://localhost'], ['--base-url','http://127.0.0.1/a'], ['--timeout-ms','Infinity'], ['--timeout-ms','0'], ['--trigger'], ['--effect-id','x'], ['--observer','evil'], ['--trigger','--effect-id','x/y','--variant-id','v']]) assert.throws(() => parseArgs(args));
 assert.equal(parseArgs(['--trigger','--effect-id','e','--variant-id','v']).trigger,true);
});
test('order requires live focused overlapping visible windows and input styles', () => {
 assert.equal(orderEvidence([parseSample(JSON.stringify(sample))]).status,'pass');
 assert.equal(orderEvidence([]).status,'incomplete');
 assert.equal(orderEvidence([{...sample,foreground:99}]).status,'incomplete');
 for (const patch of [{rank:3},{visible:false},{exStyle:8},{bounds:[101,0,200,100]}]) assert.equal(orderEvidence([{...sample,overlays:[{...sample.overlays[0],...patch}]}]).status,'fail');
 assert.throws(() => parseSample(JSON.stringify({...sample,games:[{...row(2,2),live:false}]})));
});
function fixture() {
 const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); let stopped = false;
 child.kill = () => { if (!stopped) { stopped = true; child.stdout.end(); queueMicrotask(() => child.emit('close',0)); } };
 return child;
}
test('observe-only does not create session or mutate and reaps observer', async () => {
 const calls = []; const child = fixture(); let elapsed = 0;
 const result = await run(parseArgs([]), { now:()=>elapsed, fetch: async (url, options) => { calls.push([url,options.method]); return {ok:true,json:async()=>({})}; }, spawn: () => { queueMicrotask(() => {child.stdout.write(JSON.stringify(sample)+'\n'); setTimeout(()=>{elapsed=30000; child.kill();},5);}); return child; } });
 assert.deepEqual(calls,[['http://127.0.0.1:39187/health','GET']]); assert.equal(result.ordering.status,'pass');
});
test('errors never expose response, request or credential contents', async () => {
 const child = fixture();
 const result = await run(parseArgs(['--trigger','--effect-id','e','--variant-id','v']), { fetch: async url => { if(url.endsWith('/health')) return {ok:true,json:async()=>({})}; throw new Error('SECRET_BEARER SECRET_CSRF'); }, spawn: () => { queueMicrotask(() => child.stdout.write(JSON.stringify(sample)+'\n')); return child; } });
 assert.doesNotMatch(JSON.stringify(result),/SECRET/); assert.equal(result.triggered,false);
});

test('ambiguous overlays never pass', () => {
 assert.equal(orderEvidence([{...sample,overlays:[row(1,0),row(3,1)]}]).status,'fail');
});
test('trigger once, observe only own status, and clean up only owned queued row', async () => {
 const child = fixture(); const calls = []; let poll = 0;
 const result = await run(parseArgs(['--trigger','--effect-id','effect','--variant-id','variant']), {
  fetch: async (url, options) => {
   calls.push([url,options.method]);
   let data = {};
   if(url.endsWith('/sessions')) data = {id:'SECRET_SESSION',csrfToken:'SECRET_CSRF'};
   if(url.endsWith('/test')) data = {status:'queued',occurrenceId:'owned'};
   if(url.endsWith('/operations')) { poll++; data = {current:[],queued:[{moduleId:'screen-effects',occurrenceId:'owned',status:'queued'},{moduleId:'alerts',occurrenceId:'other',status:'queued'}],recent:[]}; }
   return {ok:true,json:async()=>data};
  },
  spawn: () => { queueMicrotask(() => {child.stdout.write(JSON.stringify(sample)+'\n'); child.stdout.write(JSON.stringify({...sample,elapsedMs:100})+'\n'); child.kill();}); return child; }
 });
 assert.equal(calls.filter(([url])=>url.endsWith('/test')).length,1);
 assert.equal(result.cleanup,'remove'); assert.ok(poll >= 2);
 assert.ok(calls.some(([url])=>url.endsWith('/screen-effects/owned/remove')));
 assert.doesNotMatch(JSON.stringify(result),/SECRET|other/);
});
test('trigger run with no focused game is incomplete and creates no session', async () => {
 const child = fixture(); const calls = [];
 const result = await run(parseArgs(['--trigger','--effect-id','e','--variant-id','v']), { fetch: async url => {calls.push(url);return {ok:true,json:async()=>({})};}, spawn: () => {queueMicrotask(()=>{child.stdout.write(JSON.stringify({...sample,foreground:99})+'\n');child.kill();});return child;} });
 assert.equal(calls.length,1); assert.equal(result.playbackOutcome.status,'incomplete');
});
test('deadline stops owned observer without authentication', async () => {
 const child = fixture(); let killed = false; const original = child.kill; child.kill = () => {killed = true; original();};
 const result = await run(parseArgs(['--timeout-ms','1000']), {fetch:async()=>({ok:true,json:async()=>({})}),spawn:()=>child});
 assert.equal(killed,true); assert.equal(result.ordering.status,'incomplete');
});


test('playing cleanup skips only own current occurrence', async () => {
 const child = fixture(); const calls = [];
 const result = await run(parseArgs(['--trigger','--effect-id','e','--variant-id','v']), {fetch:async(url)=>{calls.push(url);const data=url.endsWith('/sessions')?{id:'hidden',csrfToken:'hidden'}:url.endsWith('/test')?{status:'queued',occurrenceId:'mine'}:url.endsWith('/operations')?{current:[{moduleId:'screen-effects',occurrenceId:'mine',status:'playing'}],queued:[],recent:[]}:{};return {ok:true,json:async()=>data};},spawn:()=>{queueMicrotask(()=>{child.stdout.write(JSON.stringify(sample)+'\n'+JSON.stringify({...sample,elapsedMs:100})+'\n');child.kill();});return child;}});
 assert.equal(result.cleanup,'skip'); assert.ok(calls.some(url=>url.endsWith('/screen-effects/mine/skip'))); assert.doesNotMatch(JSON.stringify(result),/hidden/);
});
test('invalid native sample stops and reaps owned child', async () => {
 const child=fixture();let closed=false;child.once('close',()=>{closed=true;});
 const result=await run(parseArgs([]),{fetch:async()=>({ok:true,json:async()=>({})}),spawn:()=>{queueMicrotask(()=>child.stdout.write('{"secret":"DO_NOT_PRINT"}\n'));return child;}});
 assert.equal(closed,true);assert.ok(result.failure);assert.doesNotMatch(JSON.stringify(result),/DO_NOT_PRINT/);
});


test('overlay foreground at any observed time fails focus preservation', () => {
 assert.equal(orderEvidence([sample,{...sample,foreground:1}]).status,'fail');
});
test('playback bookkeeping success requires playing or completed and failure dominates', () => {
 assert.equal(playbackEvidence(true,true,[{status:'queued'}]).status,'incomplete');
 assert.equal(playbackEvidence(true,false,[]).status,'incomplete');
 for(const status of ['playing','completed']) assert.equal(playbackEvidence(true,true,[{status}]).status,'pass');
 for(const status of ['failed','cancelled']) assert.equal(playbackEvidence(true,true,[{status:'playing'},{status}]).status,'failed');
});
test('buffered pre-auth sample cannot trigger playback', async () => {
 const child=fixture();const calls=[];let clock=0;
 const result=await run(parseArgs(['--trigger','--effect-id','e','--variant-id','v']),{
  now:()=>clock,
  fetch:async url=>{calls.push(url);if(url.endsWith('/sessions')){clock=50;return {ok:true,json:async()=>({id:'hidden',csrfToken:'hidden'})};}return {ok:true,json:async()=>({})};},
  spawn:()=>{queueMicrotask(()=>{child.stdout.write(JSON.stringify(sample)+'\n'+JSON.stringify({...sample,elapsedMs:20})+'\n');child.kill();});return child;}
 });
 assert.equal(calls.some(url=>url.endsWith('/test')),false);assert.equal(result.playbackOutcome.status,'incomplete');
});

test('nonzero observer termination fails despite passing native samples', async () => {
 const child=fixture();
 const result=await run(parseArgs([]),{fetch:async()=>({ok:true,json:async()=>({})}),spawn:()=>{queueMicrotask(()=>{child.stdout.write(JSON.stringify(sample)+'\n');child.stdout.end();child.emit('close',1);});return child;}});
 assert.equal(result.ordering.status,'pass');assert.match(result.failure,/Observer failed/);assert.equal(result.observerTerminal.code,1);
});
test('premature clean observer exit fails despite passing native samples', async () => {
 const child=fixture();
 const result=await run(parseArgs([]),{fetch:async()=>({ok:true,json:async()=>({})}),spawn:()=>{queueMicrotask(()=>{child.stdout.write(JSON.stringify(sample)+'\n');child.kill();});return child;}});
 assert.equal(result.ordering.status,'pass');assert.match(result.failure,/before/);assert.equal(result.observerTerminal.code,0);
});
test('explicit cancellation after passing sample fails', async () => {
 const child=fixture();
 const result=await run(parseArgs([]),{fetch:async()=>({ok:true,json:async()=>({})}),spawn:()=>{queueMicrotask(()=>{child.stdout.write(JSON.stringify(sample)+'\n');setTimeout(()=>process.emit('SIGINT'),5);});return child;}});
 assert.equal(result.ordering.status,'pass');assert.match(result.failure,/cancelled/);assert.equal(result.observerTerminal.reason,'cancelled');
});
test('expected complete deadline can pass with valid evidence', async () => {
 const child=fixture();let elapsed=0;
 const result=await run(parseArgs(['--timeout-ms','1000']),{now:()=>elapsed,fetch:async()=>({ok:true,json:async()=>({})}),spawn:()=>{queueMicrotask(()=>{child.stdout.write(JSON.stringify(sample)+'\n');setTimeout(()=>{elapsed=1000;child.stdout.write(JSON.stringify({...sample,elapsedMs:1000})+'\n');},5);});return child;}});
 assert.equal(result.ordering.status,'pass');assert.equal(result.failure,undefined);assert.equal(result.observerTerminal.reason,'deadline');
});
