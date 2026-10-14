import assert from 'node:assert/strict';
import {createTestDatabase} from './postgres-test-database.mjs';
let testDatabase;
let pool;
try {
 testDatabase=await createTestDatabase('clickme_delete_test');
 pool=(await import('../lib/db.ts')).default;
 const {deleteWorkspace}=await import('../lib/delete-workspace.ts');
 await pool.execute("INSERT INTO users (id,name,email,password_hash) VALUES (1,'Owner','owner@example.test','unused'),(2,'Other','other@example.test','unused')");
 await pool.execute("INSERT INTO workspaces (id,owner_id,name,slug) VALUES (1,1,'Delete','delete'),(2,1,'Keep','keep')");
 await pool.execute("INSERT INTO projects (id,workspace_id,owner_id,name,slug,view_slug) VALUES (1,1,1,'Delete','delete','delete'),(2,2,1,'Keep','keep','keep')");
 await pool.execute("INSERT INTO workspace_members (workspace_id,user_id,role) VALUES (1,2,'administrator')");
 await pool.execute("INSERT INTO project_members (project_id,user_id,permission) VALUES (1,2,'Manage'),(2,2,'Manage')");
 await assert.rejects(deleteWorkspace(1,0),e=>e.status===401);
 await assert.rejects(deleteWorkspace(1,2),e=>e.status===403);
 assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM workspaces'))[0][0].n),2);
 await deleteWorkspace(1,1);
 for(const table of ['workspaces','projects','project_members'])assert.equal(Number((await pool.query(`SELECT COUNT(*) n FROM ${table}`))[0][0].n),1);
 assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM workspace_members'))[0][0].n),0);
 await assert.rejects(deleteWorkspace(1,1),e=>e.status===404);
 console.log('PASS: unauthenticated and non-owner deletion denied, selected workspace and memberships removed, other workspace preserved, repeated delete returns 404. Isolated test database.');
} finally {
 if(pool)await pool.end();
 if(testDatabase)await testDatabase.drop();
}
