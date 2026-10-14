import {
  requireFormImage,
  requireFormOptionImages,
} from "@/lib/form-image-storage";
import { randomBytes } from "crypto";
import type { DbResult, DbRow } from "@/lib/db";
import db from "@/lib/db";
import {
  currentFormUser,
  ensureForms,
  formWorkspaces,
  formProjects,
  validateFormTarget,
  formError,
  formBody,
  FormError,
} from "@/lib/native-forms";
import { validateAutomation } from "@/lib/native-form-automation";
import { validateDefinition } from "@/lib/native-form-fields";
export async function GET() {
  try {
    const user = await currentFormUser();
    const workspaces = await formWorkspaces(user);
    await ensureForms();
    const ids = workspaces.map((w) => w.id);
    const [forms] = await db.query<DbRow[]>(
      `SELECT f.id, f.workspace_id AS "workspaceId", f.project_id AS "projectId", f.title, f.description, f.token, f.is_published AS "isPublished", (SELECT COUNT(*) FROM native_form_responses r WHERE r.form_id = f.id) AS "responseCount" FROM native_forms f WHERE f.owner_id = ? ${ids.length ? `OR f.workspace_id IN (${ids.map(() => "?").join(",")})` : ""} ORDER BY f.updated_at DESC, f.id DESC`,
      [user, ...ids],
    );
    return Response.json({
      forms,
      workspaces,
      projects: await formProjects(user),
    });
  } catch (error) {
    return formError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await currentFormUser();
    const body = await formBody(request);
    const target = await validateFormTarget(body, user);
    let definition;
    try {
      definition = validateDefinition(body);
    } catch (error) {
      throw new FormError((error as Error).message);
    }
    let automation;
    try {
      automation = validateAutomation(
        body.automation,
        definition.fields,
        target.projectId,
      );
    } catch (error) {
      throw new FormError((error as Error).message);
    }
    await requireFormImage(definition.presentation?.imageId, user);
    await requireFormOptionImages(definition.fields, user);
    await ensureForms();
    const token = randomBytes(24).toString("hex");
    const [result] = await db.execute<DbResult>(
      "INSERT INTO native_forms (workspace_id, owner_id, project_id, token, title, description, fields, is_published, automation, presentation, sections) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [
        target.workspaceId,
        user,
        target.projectId,
        token,
        definition.title,
        definition.description,
        JSON.stringify(definition.fields),
        definition.isPublished ? 1 : 0,
        JSON.stringify(automation),
        JSON.stringify(definition.presentation),
        JSON.stringify(definition.sections),
      ],
    );
    return Response.json({ id: result.insertId, token }, { status: 201 });
  } catch (error) {
    return formError(error);
  }
}
