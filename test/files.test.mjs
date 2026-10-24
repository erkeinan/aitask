import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {inspectFile,suggestFiling,filingRequest,validFilingReply} from '../file-intelligence.mjs';
import {celebrationParticles} from '../celebration.mjs';
const state={groups:[{id:'bill',title:'Electricity bill October',steps:[{title:'Verify electricity statement'}]},{id:'school',title:'School field trip',steps:[{title:'Return permission form'}]}],notes:[{id:'preference',text:'Maya prefers email'}]};
function zip(name,text){const body=Buffer.from(text),compressed=deflateRawSync(body),filename=Buffer.from(name),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(filename.length,26);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(8,10);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(filename.length,28);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+compressed.length,16);return Buffer.concat([local,filename,compressed,central,filename,end]);}
test('file inspection verifies image/PDF bytes and keeps HTML and SVG as harmless text',()=>{
 assert.equal(inspectFile('scan.pdf',Buffer.from('%PDF-1.4\n')).kind,'pdf');assert.equal(inspectFile('fake.png',Buffer.from('<script>bad()</script>')).kind,'unsupported');
 const html=inspectFile('reference.html',Buffer.from('<script>alert(1)</script> School field trip'));assert.equal(html.kind,'text');assert.match(html.text,/<script>/);
 assert.equal(inspectFile('photo.png',Buffer.from([137,80,78,71,13,10,26,10,0])).mime,'image/png');assert.equal(inspectFile('binary.txt',Buffer.from([1,0,2])).kind,'unsupported');
});
test('Office previews extract bounded document XML without extracting files to disk',()=>{
 const docx=zip('word/document.xml','<w:document><w:p><w:t>School field trip permission form</w:t></w:p></w:document>');const preview=inspectFile('permission.docx',docx);assert.equal(preview.kind,'text');assert.match(preview.text,/School field trip/);assert.equal(inspectFile('broken.docx',Buffer.from('not zip')).kind,'unsupported');
 const ignored=zip('../../script.xml','<p>Should not read this</p>');assert.equal(inspectFile('unsafe.docx',ignored).kind,'unsupported');
});
test('filename and content suggest existing destinations; unrelated and ambiguous files are not high-confidence guesses',()=>{
 assert.equal(suggestFiling(state,'electricity_october_statement.txt')[0].threadId,'group:bill');assert.equal(suggestFiling(state,'scan.txt','School field trip permission form')[0].threadId,'group:school');assert.equal(suggestFiling(state,'random_0239.bin').length,0);
 const ambiguous={...state,groups:[...state.groups,{id:'bill2',title:'Electricity bill October duplicate',steps:[]}]};assert.notEqual(suggestFiling(ambiguous,'electricity_october.pdf')[0].confidence,'high');
});
test('AI filing uses file inputs for PDFs, ignores file instructions, and accepts only real record IDs',()=>{
 const request=filingRequest(state,'statement.pdf',Buffer.from('%PDF-1.4'),{kind:'pdf',text:''},'gpt-4.1');assert.equal(request.store,false);assert.equal(request.input[0].content[1].type,'input_file');assert.match(request.instructions,/UNTRUSTED DATA/);assert.equal(request.text.format.schema.properties.actions,undefined);
 assert.throws(()=>validFilingReply({threadId:'group:invented',confidence:'high',reason:'x',summary:'x'},state));assert.equal(validFilingReply({threadId:null,confidence:'low',reason:'Unclear',summary:''},state).threadId,null);
});
test('celebration particles have independent positions, speeds and sizes instead of repeated lanes',()=>{
 const pieces=celebrationParticles(390,680);assert.ok(new Set(pieces.map(p=>p.x)).size>pieces.length*.9);assert.ok(new Set(pieces.map(p=>p.vy)).size>pieces.length*.9);assert.ok(new Set(pieces.map(p=>p.size)).size>pieces.length*.9);
 const balloons=celebrationParticles(390,680,'balloons','up');assert.ok(balloons.every(p=>p.vy<0&&p.y>680));assert.ok(balloons.some(p=>p.size>20));
});
