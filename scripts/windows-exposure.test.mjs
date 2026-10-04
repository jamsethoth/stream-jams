import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAddress, parsePids, portMatches, reportExposure } from './windows-exposure.mjs';
test('classifies loopback, wildcard and interface bindings', () => {
  for (const value of ['127.0.0.1','127.4.5.6','::1','::ffff:127.0.0.1']) assert.equal(classifyAddress(value), 'loopback');
  for (const value of ['0.0.0.0','::','*']) assert.equal(classifyAddress(value), 'wildcard');
  assert.equal(classifyAddress('192.168.1.2'), 'specific-interface');
  assert.equal(classifyAddress('0:0:0:0:0:0:0:1'), 'loopback');
  assert.equal(classifyAddress('127.foo'), 'unknown');
  assert.equal(classifyAddress('fe80::1%12'), 'specific-interface');
  assert.equal(classifyAddress('fe80::1%bad/zone'), 'unknown');
});
test('firewall application and port must match the same endpoint owner', () => {
  const report = reportExposure({processes:[{processId:1,executablePath:'C:\\streamer.exe'},{processId:2,executablePath:'C:\\speaker.exe'}],endpoints:[{processId:1,address:'127.0.0.1',port:8080,protocol:'TCP'},{processId:2,address:'127.0.0.1',port:7580,protocol:'TCP'}],activeProfiles:['Private'],firewallProfiles:[{name:'Private',enabled:'False',defaultInboundAction:'Block',defaultOutboundAction:'Allow'}],rules:[{enabled:'True',profiles:['Private'],application:'C:\\streamer.exe',protocol:'TCP',localPort:['7580']}]});
  assert.equal(report.potentiallyApplicableRules.length,0);assert.equal(report.firewallProfiles[0].enabled,'False');assert.equal(report.remoteReachability,'unproven');
});
test('explicit service PIDs are repeatable and validated', () => {
  assert.deepEqual(parsePids(['--pid','123','--pid','456','--pid','123']), [123,456]);
  assert.deepEqual(parsePids(['--','--pid','123']), [123]);
  assert.throws(() => parsePids(['--','--','--pid','123']));
  for (const args of [['--pid','0'],['--pid'],['--password','secret']]) assert.throws(() => parsePids(args));
});
test('scoped IPv6 preserves a complete endpoint snapshot', () => {
  const report = reportExposure({processes:[{processId:1}],endpoints:[{processId:1,protocol:'UDP',address:'fe80::1%12',port:5353},{processId:1,protocol:'TCP',address:'::1',port:8080}]});
  assert.equal(report.endpoints.length,2);assert.equal(report.endpoints[0].address,'fe80::1%12');assert.equal(report.endpoints[0].binding,'specific-interface');assert.equal(report.endpoints[1].binding,'loopback');
});
test('port ranges and Any rules match without overstating reachability', () => {
  assert.equal(portMatches(['8000-9000'],8080), true); assert.equal(portMatches(['Any'],80), true); assert.equal(portMatches(['90'],80), false);
  const snapshot = { processes: [{processId:123,name:'node.exe',executablePath:'C:\\node.exe'}], endpoints: [{processId:123,address:'::',port:8080,protocol:'TCP'},{processId:123,address:'127.0.0.1',port:8080,protocol:'UDP'},{processId:999,address:'::',port:99,protocol:'TCP'}], activeProfiles:['Private'], rules:[{enabled:'True',application:'Any',protocol:'Any',localPort:['8000-9000'],profiles:['Any']},{enabled:'False',application:'Any',protocol:'Any',localPort:['Any'],profiles:['Any']},{enabled:'True',application:'Any',protocol:'Any',localPort:['Any'],profiles:['Public']}] };
  const report = reportExposure(snapshot); assert.equal(report.endpoints.length,2); assert.equal(report.potentiallyApplicableRules.length,1); assert.equal(report.remoteReachability,'unproven');
});
test('absent targets, exit races and partial access remain unknown', () => {
  assert.equal(reportExposure({}).assessment,'unknown');
  assert.equal(reportExposure({processes:[{processId:1}],errors:['denied']}).assessment,'unknown');
  assert.equal(reportExposure({processes:[{processId:1}],rules:[]}).remoteReachability,'unproven');
});
test('UDP protocol and specific application filters exclude unrelated rules', () => {
  const snapshot = {processes:[{processId:7,executablePath:'C:\\vendor.exe'}],endpoints:[{processId:7,protocol:'UDP',address:'192.168.1.2',port:5353}],activeProfiles:['Private'],rules:[{enabled:'True',profiles:['Private'],application:'C:\\vendor.exe',protocol:'17',localPort:['5353'],remoteAddress:['LocalSubnet'],service:'Any',interfaceType:'Wireless'},{enabled:'True',profiles:['Private'],application:'C:\\other.exe',protocol:'UDP',localPort:['Any']},{enabled:'True',profiles:['Private'],application:'Any',protocol:'TCP',localPort:['Any']}]};
  const report = reportExposure(snapshot);assert.equal(report.potentiallyApplicableRules.length,1);assert.equal(report.endpoints[0].binding,'specific-interface');assert.deepEqual(report.potentiallyApplicableRules[0].remoteAddress,['LocalSubnet']);
});
test('partial relevant rule metadata is retained without claiming complete observation', () => {
  const report=reportExposure({processes:[{processId:1,executablePath:'C:\\vendor.exe'}],endpoints:[{processId:1,address:'127.0.0.1',port:8080,protocol:'TCP'}],activeProfiles:['Private'],rules:[{name:'public-fixture-rule',enabled:'True',application:'Any',profiles:['Private'],protocol:'Any',localPort:['Any'],filterCompleteness:'partial'}]});
  assert.equal(report.assessment,'unknown');assert.equal(report.potentiallyApplicableRules.length,1);assert.equal(report.remoteReachability,'unproven');
});
