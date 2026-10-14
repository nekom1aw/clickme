import assert from 'node:assert/strict';
import { createTestDatabase } from './postgres-test-database.mjs';
let testDatabase;
let pool;
const originalFetch=globalThis.fetch;
try {
 testDatabase=await createTestDatabase('clickme_sheet_test');
 pool=(await import('../lib/db.ts')).default;
 await pool.execute("INSERT INTO users (id,name,email,password_hash) VALUES (1,'Test','test@example.com','unused')");
 await pool.execute("INSERT INTO workspaces (id,owner_id,name,slug) VALUES (1,1,'Test','test')");
 const {ensureImportSchema,importDataRequests}=await import('../lib/data-request-sync.ts');
 await ensureImportSchema();
 await pool.execute("INSERT INTO whatsapp_group_connections (scope_type,scope_id,group_chat_id) VALUES ('workspace',1,'test@g.us')");
 const url='https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuv/export?format=csv&gid=0';
 const settings={mapping:{title:'Subject',responseId:'ID'},defaultProject:'Inbox',template:'New: {{Subject}}\n{{Body}}',descriptionColumns:['Subject','Body']};
 await pool.execute('INSERT INTO data_request_import_sources (workspace_id,google_sheet_url) VALUES (1,?)',[url]);
 await pool.execute('INSERT INTO sheet_source_settings (workspace_id,source_url,settings_json,version,initial_pending) VALUES (1,?,?,?,1)',[url,JSON.stringify(settings),'v1']);
 let csv='ID,Subject,Body\n1,Existing,Original';const messages=[];let beforeFetch;
 process.env.WAHA_API_URL='http://mock-waha.invalid';process.env.WAHA_API_KEY='test';
 globalThis.fetch=async (input,options)=>{
  const target=String(input);
  if(target.startsWith('https://docs.google.com/')) {if(beforeFetch){const fn=beforeFetch;beforeFetch=null;await fn();}return new Response(csv,{headers:{'content-type':'text/csv'}});}
  if(target==='http://mock-waha.invalid/api/sendText'){messages.push(JSON.parse(options.body));return Response.json({id:'test-message'});}
  throw new Error('Unexpected network call');
 };
 const sync=async()=>{const r=await importDataRequests(1,{workspaceId:1,workspaceName:'Test'});return {status:r.status,...await r.json()};};
 let result=await sync();assert.equal(result.status,200);assert.equal(result.summary.created,1);assert.equal(messages.length,0);
 csv='ID,Subject,Body\n1,Edited,New detail\n2,New task,Second';result=await sync();assert.equal(result.status,200);assert.equal(result.summary.created,1);assert.equal(messages.length,1);assert.ok(messages[0].text.startsWith('New: New task\nSecond'));
 result=await sync();assert.equal(result.summary.created,0);assert.equal(messages.length,1);assert.equal((await pool.query('SELECT COUNT(*) n FROM tasks'))[0][0].n,2);
 csv='ID,Subject\n1,Edited\n2,New task';result=await sync();assert.equal(result.status,400);assert.equal((await pool.query('SELECT paused FROM sheet_source_settings'))[0][0].paused,1);assert.equal(messages.length,1);
 csv='ID,Subject,Body\n1,Edited,New detail\n2,New task,Second';await pool.execute("UPDATE sheet_source_settings SET paused=0,version='v2'");
 beforeFetch=()=>pool.execute("UPDATE sheet_source_settings SET version='v3'");result=await sync();assert.equal(result.status,409);assert.equal(messages.length,1);
 const nextUrl=url.replace('gid=0','gid=5');await pool.execute('UPDATE data_request_import_sources SET google_sheet_url=?,last_synced_at=NULL',[nextUrl]);await pool.execute('UPDATE sheet_source_settings SET source_url=?,initial_pending=1,version=?',[nextUrl,'v4']);
 csv='ID,Subject,Body\n3,Other form,Historical';result=await sync();assert.equal(result.status,200);assert.equal(result.summary.created,1);assert.equal(messages.length,1);
 csv='ID,Subject,Body\n3,Other form,Historical\n3,Duplicate,Oops';result=await sync();assert.equal(result.status,400);assert.equal((await pool.query('SELECT paused FROM sheet_source_settings'))[0][0].paused,1);
 await pool.execute("INSERT INTO workspaces (id,owner_id,name,slug) VALUES (2,1,'Legacy','legacy')");
 csv='Timestamp,Nama Lengkap,Lembaga/Organisasi,Lembaga / Organisasi,Detail Kebutuhan Data,Response ID\n09/09/2026 12:00:00,Legacy person,Media,Example,Original answer,stable-1';
 let legacy=await importDataRequests(1,{workspaceId:2,workspaceName:'Legacy',googleSheetUrl:url},{notify:false});assert.equal(legacy.status,200);
 const before=(await pool.query('SELECT COUNT(*) n FROM tasks'))[0][0].n;
 const migrated={mapping:{title:'Nama Lengkap',responseId:'Response ID',timestamp:'Timestamp',name:'Nama Lengkap',detail:'Detail Kebutuhan Data',category:'Lembaga/Organisasi',organization:'Lembaga / Organisasi'},defaultProject:'Inbox',template:'{{Nama Lengkap}}',descriptionColumns:['Nama Lengkap','Detail Kebutuhan Data']};
 await pool.execute('INSERT INTO sheet_source_settings (workspace_id,source_url,settings_json,version,initial_pending) VALUES (2,?,?,?,0)',[url,JSON.stringify(migrated),'migration']);
 legacy=await importDataRequests(1,{workspaceId:2,workspaceName:'Legacy'},{notify:false});assert.equal(legacy.status,200);assert.equal((await legacy.json()).summary.created,0);
 assert.equal((await pool.query('SELECT COUNT(*) n FROM tasks'))[0][0].n,before);
 console.log('PASS: silent baseline, new-row template delivery, edited answer deduplication, repeat sync, missing-column pause, concurrent config guard, switched-source baseline, duplicate-ID pause, legacy ID migration without duplicate tasks. No real WhatsApp calls.');
} finally {
 globalThis.fetch=originalFetch;
 if(pool)await pool.end();
 if(testDatabase)await testDatabase.drop();
}
