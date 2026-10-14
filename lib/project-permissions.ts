import db from "@/lib/db";

export type ProjectPermission = "Full akses" | "Manage" | "Collaborator";

let permissionSchemaPromise: Promise<void> | null = null;

export function ensureProjectPermissionSchema() {
  if (!permissionSchemaPromise) {
    permissionSchemaPromise = (async () => {
      await db.execute(
        `UPDATE project_members
         SET permission = 'Collaborator'
         FROM projects
         INNER JOIN workspace_members ON workspace_members.workspace_id = projects.workspace_id
         WHERE projects.id = project_members.project_id
           AND workspace_members.user_id = project_members.user_id
           AND workspace_members.role = 'collaborator'
           AND projects.owner_id <> project_members.user_id
           AND project_members.permission = 'Manage'`,
      );
    })().catch((error) => {
      permissionSchemaPromise = null;
      throw error;
    });
  }

  return permissionSchemaPromise;
}
