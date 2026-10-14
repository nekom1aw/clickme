import test from 'node:test';
import assert from 'node:assert/strict';
import {readSpreadsheet} from '../lib/data-request-import.ts';
import {validateSettings,renderSheetMessage,mappedDescription} from '../lib/sheet-mapping.ts';
import {mappedIdentity} from '../lib/sheet-source.ts';
const headers=['Ticket','Subject','Body'];
const settings={mapping:{title:'Subject',responseId:'Ticket'},defaultProject:'Inbox',template:'{{Subject}}\n{{Body}}',descriptionColumns:['Subject','Body']};
test('arbitrary form headers, reordered columns and quoted multiline cells',()=>{
 const data=readSpreadsheet('Body,Ticket,Subject\n"Line 1\nLine 2",ID1,Hello');
 assert.deepEqual(validateSettings(settings,data.headers),settings);
 assert.equal(data.rows[0].Body,'Line 1\nLine 2');
});
test('missing referenced columns pause-worthy; extra columns accepted',()=>{
 assert.throws(()=>validateSettings(settings,['Ticket','Subject']),/Kolom hilang/);
 assert.deepEqual(validateSettings(settings,[...headers,'Extra']),settings);
 assert.throws(()=>validateSettings({...settings,template:'{{Unknown}}'},headers),/Unknown/);
});
test('response ID stays stable across answer edits, scoped by source',()=>{
 const a={Ticket:'1',Subject:'First',Body:'Old'};const b={...a,Subject:'Changed',Body:'Edited'};
 assert.equal(mappedIdentity(a,settings,'sheetA'),mappedIdentity(b,settings,'sheetA'));
 assert.notEqual(mappedIdentity(a,settings,'sheetA'),mappedIdentity(a,settings,'sheetB'));
 assert.throws(()=>mappedIdentity({...a,Ticket:''},settings,'sheetA'),/tanpa ID/);
});
test('template uses exact distinct headers and description escapes HTML',()=>{
 const row={'Lembaga/Organisasi':'Media','Lembaga / Organisasi':'Example','Body':'<script>x</script>'};
 assert.equal(renderSheetMessage('{{Lembaga/Organisasi}} / {{Lembaga / Organisasi}}',row),'Media / Example');
 assert.ok(mappedDescription(row,{...settings,descriptionColumns:['Body']}).includes('&lt;script&gt;'));
});
test('duplicate headers and incomplete placeholders rejected',()=>{
 assert.throws(()=>readSpreadsheet('Title,Title\na,b'),/duplikat/);
 assert.throws(()=>validateSettings({...settings,template:'{{Subject}'},headers),/Placeholder/);
});
test('custom mapping persists and renders in description and message',()=>{
 const custom={...settings,customMappings:[{label:'Kebutuhan',column:'Body'}],template:'{{Kebutuhan}}'};
 const saved=validateSettings(custom,headers);
 assert.deepEqual(saved.customMappings,custom.customMappings);
 assert.equal(renderSheetMessage(saved.template,{Body:'Peta hutan'},saved),'Peta hutan');
 assert.ok(mappedDescription({Body:'Peta hutan'},saved).includes('<strong>Kebutuhan:</strong> Peta hutan'));
 assert.throws(()=>validateSettings({...custom,customMappings:[]},headers),/Kebutuhan/);
});
test('optional mappings can be removed; title and identity remain required',()=>{
 assert.doesNotThrow(()=>validateSettings(settings,headers));
 assert.throws(()=>validateSettings({...settings,mapping:{responseId:'Ticket'}},headers),/judul/);
 assert.throws(()=>validateSettings({...settings,mapping:{title:'Subject'}},headers),/ID jawaban/);
 assert.throws(()=>validateSettings({...settings,customMappings:[{label:'Subject',column:'Body'}]},headers),/kolom sumber lain/);
 assert.throws(()=>validateSettings({...settings,customMappings:[{label:'Extra',column:'Body'},{label:'extra',column:'Body'}]},headers),/harus berbeda/);
});
