import {
  requireFormImage,
  requireFormOptionImages,
} from "@/lib/form-image-storage";
import db from "@/lib/db";
import {
  managedForm,
  serializeForm,
  currentFormUser,
  validateFormTarget,
  formError,
  formBody,
  FormError,
} from "@/lib/native-forms";
import { validateAutomation } from "@/lib/native-form-automation";
import { validateDefinition } from "@/lib/native-form-fields";
type Context = { params: Promise<{ formId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    return Response.json({
      form: serializeForm(await managedForm((await context.params).formId)),
    });
  } catch (error) {
    return formError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const form = await managedForm((await context.params).formId);
    const body = await formBody(request);
    const target = await validateFormTarget(body, await currentFormUser());
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
    await requireFormImage(
      definition.presentation?.imageId,
      await currentFormUser(),
      serializeForm(form).presentation.imageId,
    );
    await requireFormOptionImages(
      definition.fields,
      await currentFormUser(),
      serializeForm(form).fields,
    );
    await db.execute(
      "UPDATE native_forms SET workspace_id = ?, project_id = ?, title = ?, description = ?, fields = ?, is_published = ?, automation = ?, presentation = ?, sections = ? WHERE id = ?",
      [
        target.workspaceId,
        target.projectId,
        definition.title,
        definition.description,
        JSON.stringify(definition.fields),
        definition.isPublished ? 1 : 0,
        JSON.stringify(automation),
        JSON.stringify(definition.presentation),
        JSON.stringify(definition.sections),
        form.id,
      ],
    );
    return Response.json({ ok: true });
  } catch (error) {
    return formError(error);
  }
}
