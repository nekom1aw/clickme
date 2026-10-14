import { after } from "next/server";
import type { DbResult, DbRow } from "@/lib/db";
import { ensureTaskActivitiesTable } from "@/lib/task-activities";
import {
  ensureSheetNotificationQueue,
  flushSheetNotifications,
} from "@/lib/sheet-notification-queue";
import { createFormTask } from "@/lib/native-form-submit";
import type { NativeForm } from "@/lib/native-forms";
import {
  ensureForms,
  serializeForm,
  formError,
  formBody,
  FormError,
} from "@/lib/native-forms";
import { validateFormResponse } from "@/lib/native-form-fields";
import db from "@/lib/db";
import { getClientIp, isRateLimited, recordRateLimitEvent } from "@/lib/rate-limit";
type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    await ensureForms();
    const [rows] = await db.query<NativeForm[]>(
      "SELECT * FROM native_forms WHERE token = ? AND is_published = 1",
      [(await context.params).token],
    );
    if (!rows[0])
      throw new FormError("Form tidak tersedia atau sudah ditutup.", 404);
    const form = serializeForm(rows[0]);
    return Response.json({
      form: {
        title: form.title,
        description: form.description,
        fields: form.fields,
        presentation: form.presentation,
        sections: form.sections,
      },
    });
  } catch (error) {
    return formError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const ipBucket = `public-form:ip:${getClientIp(request)}`;
    if (await isRateLimited(ipBucket, 20, 10 * 60))
      throw new FormError("Terlalu banyak pengiriman. Coba lagi beberapa menit lagi.", 429);
    await recordRateLimitEvent(ipBucket);
    const body = await formBody(request);
    if (!body || body.website) throw new FormError("Pengiriman tidak valid.");
    if (
      typeof body.submissionKey !== "string" ||
      !/^[a-zA-Z0-9_-]{16,64}$/.test(body.submissionKey)
    )
      throw new FormError("Identitas pengiriman tidak valid.");
    await ensureForms();
    await ensureTaskActivitiesTable();
    await ensureSheetNotificationQueue();
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<NativeForm[]>(
        "SELECT * FROM native_forms WHERE token = ? AND is_published = 1 FOR UPDATE",
        [(await context.params).token],
      );
      if (!rows[0])
        throw new FormError("Form tidak tersedia atau sudah ditutup.", 404);
      const form = serializeForm(rows[0]);
      const [existing] = await connection.query<DbRow[]>(
        "SELECT id FROM native_form_responses WHERE form_id=? AND submission_key=?",
        [form.id, body.submissionKey],
      );
      if (existing.length) {
        await connection.commit();
        return Response.json({ ok: true }, { status: 200 });
      }
      let validated;
      try {
        validated = validateFormResponse(form, body.answers, body.otherAnswers);
      } catch (error) {
        throw new FormError((error as Error).message);
      }
      const { answers, fields: activeFields } = validated;
      if (
        Buffer.byteLength(
          JSON.stringify({ answers, fields: activeFields }),
          "utf8",
        ) > 50000
      )
        throw new FormError(
          "Total jawaban terlalu panjang. Ringkas jawaban lalu kirim kembali.",
        );
      const [response] = await connection.execute<DbResult>(
        "INSERT INTO native_form_responses (form_id, answers, fields, submission_key) VALUES (?, ?, ?, ?) RETURNING id",
        [
          form.id,
          JSON.stringify(answers),
          JSON.stringify(activeFields),
          body.submissionKey,
        ],
      );
      await createFormTask(
        connection,
        { ...form, fields: activeFields },
        response.insertId,
        answers,
      );
      await connection.commit();
      if (form.automation.whatsappEnabled)
        after(async () => {
          try {
            await flushSheetNotifications();
          } catch {
            console.error("Form notification remains queued for retry.");
          }
        });
      return Response.json({ ok: true }, { status: 201 });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    return formError(error);
  }
}
