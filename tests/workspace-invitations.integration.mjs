import assert from 'node:assert/strict';
import {createTestDatabase} from './postgres-test-database.mjs';
let testDatabase;
let pool;
try {
 testDatabase=await createTestDatabase('clickme_invite_test',['users','workspaces','workspace_members','projects','project_members']);
 pool=(await import('../lib/db.ts')).default;
 const {inviteWorkspace,answerInvitation,removeWorkspaceMember}=await import('../lib/workspace-invitations.ts');
 await pool.execute("INSERT INTO users (id,name,email,password_hash) VALUES (1,'Owner','owner@example.test','unused'),(2,'Recipient','recipient@example.test','unused'),(3,'Other','other@example.test','unused')");
 await pool.execute("INSERT INTO workspaces (id,owner_id,name,slug) VALUES (1,1,'Test','test'),(2,1,'Other','other')");
 await pool.execute("INSERT INTO projects (id,workspace_id,owner_id,name,slug,view_slug) VALUES (1,1,1,'Project','project','view'),(2,2,1,'Other','other','other')");
 const count=async(table)=>Number((await pool.query(`SELECT COUNT(*) n FROM ${table}`))[0][0].n);
 const idFor=async(email)=>(await pool.execute('SELECT id FROM workspace_invitations WHERE email=?',[email]))[0][0].id;
 await assert.rejects(inviteWorkspace(1,3,'recipient@example.test','collaborator',[]),e=>e.status===403);
 await assert.rejects(inviteWorkspace(1,1,'recipient@example.test','collaborator',[2]),e=>e.status===400);
 await inviteWorkspace(1,1,'recipient@example.test','manager',[1]);
 assert.equal(await count('workspace_members'),0);assert.equal(await count('project_members'),0);
 await assert.rejects(inviteWorkspace(1,1,'recipient@example.test','manager',[1]),e=>e.status===409);
 const id=await idFor('recipient@example.test');
 await assert.rejects(answerInvitation(3,id,'accept'),e=>e.status===404);
 await answerInvitation(2,id,'decline');assert.equal(await count('workspace_members'),0);
 await assert.rejects(answerInvitation(2,id,'accept'),e=>e.status===409);
 await inviteWorkspace(1,1,'recipient@example.test','manager',[1]);
 await answerInvitation(2,id,'accept');assert.equal(await count('workspace_members'),1);assert.equal(await count('project_members'),1);
 assert.equal((await pool.query('SELECT permission FROM project_members'))[0][0].permission,'Manage');
 await assert.rejects(answerInvitation(2,id,'accept'),e=>e.status===409);
 await assert.rejects(removeWorkspaceMember(1,3,2),e=>e.status===403);
 await assert.rejects(removeWorkspaceMember(1,1,1),e=>e.status===400);
 await removeWorkspaceMember(1,1,2);assert.equal(await count('workspace_members'),0);assert.equal(await count('project_members'),0);
 await inviteWorkspace(1,1,'future@example.test','collaborator',[]);
 await pool.execute("INSERT INTO users (id,name,email,password_hash) VALUES (4,'Future','future@example.test','unused')");
 await answerInvitation(4,await idFor('future@example.test'),'accept');assert.equal(await count('workspace_members'),1);
 console.log('PASS: invite without access, pending duplicate, recipient-only response, decline, reinvite, accept with scoped project role, replay blocked, removal permissions, owner protected, membership revoked, future email registration. Isolated database; no messages sent.');
} finally {
 if(pool)await pool.end();
 if(testDatabase)await testDatabase.drop();
}
