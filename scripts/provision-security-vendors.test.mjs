import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
/* global Response */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { provisionVendor } from './provision-security-vendors.mjs';
const bytes = Buffer.from('synthetic archive fixture');
const entry = {url:'https://example.invalid/vendor.zip',sha256:createHash('sha256').update(bytes).digest('hex'),executable:'vendor.exe'};
test('verified bytes precede extraction and required executable validation', async () => {
  const root = await mkdtemp(join(tmpdir(),'security-provision-test-'));
  try { const result = await provisionVendor(entry,root,{download:async()=>new Response(bytes),extract:async(_archive,destination)=>{await mkdir(destination);await writeFile(join(destination,'vendor.exe'),'publicfixture');}});assert.equal(result,join(root,'extracted')); }
  finally { await rm(root,{recursive:true,force:true}); }
});
test('HTTP failures and hash mismatches never extract', async () => {
  const root = await mkdtemp(join(tmpdir(),'security-provision-test-'));let extractions=0;
  try { for (const response of [new Response('',{status:503}),new Response('wrong')]) await assert.rejects(provisionVendor(entry,root,{download:async()=>response,extract:async()=>{extractions++;}})); assert.equal(extractions,0); }
  finally { await rm(root,{recursive:true,force:true}); }
});
test('missing executable fails closed after verified extraction', async () => {
  const root = await mkdtemp(join(tmpdir(),'security-provision-test-'));
  try { await assert.rejects(provisionVendor(entry,root,{download:async()=>new Response(bytes),extract:async()=>{}}),/missing required executable/); }
  finally { await rm(root,{recursive:true,force:true}); }
});
test('invalid manifest and extraction failure have no fallback', async () => {
  const root = await mkdtemp(join(tmpdir(),'security-provision-test-'));let downloads=0;
  try { await assert.rejects(provisionVendor({...entry,url:'http://example.invalid/vendor'},root,{download:async()=>{downloads++;return new Response(bytes);}}),/HTTPS/);assert.equal(downloads,0);await assert.rejects(provisionVendor(entry,root,{download:async()=>new Response(bytes),extract:async()=>{throw new Error('synthetic extractor failure');}}),/synthetic extractor failure/); }
  finally { await rm(root,{recursive:true,force:true}); }
});
