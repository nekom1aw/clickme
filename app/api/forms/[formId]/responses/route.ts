import { ensureSheetNotificationQueue } from "@/lib/sheet-notification-queue";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { managedForm, formError, decode, serializeForm } from "@/lib/native-forms";
import type { FormField, FieldSummary } from "@/lib/native-form-fields";

function computeSummary(fields: FormField[], allRows: DbRow[]): FieldSummary[] {
  const parsedAnswersList = allRows.map((r) => {
    try {
      return decode<Record<string, unknown>>(r.answers) || {};
    } catch {
      return {};
    }
  });

  return fields.map((field) => {
    const fieldId = field.id;
    const type = field.type;
    const label = field.label;

    if (type === "radio" || type === "select" || type === "checkbox") {
      const optionCounts: Record<string, number> = {};
      field.options.forEach((opt) => {
        optionCounts[opt] = 0;
      });
      let otherCount = 0;
      const otherAnswersSet = new Set<string>();
      let totalAnswered = 0;

      for (const ansObj of parsedAnswersList) {
        const val = ansObj[fieldId];
        if (
          val === undefined ||
          val === null ||
          val === "" ||
          (Array.isArray(val) && val.length === 0)
        ) {
          continue;
        }
        totalAnswered++;
        if (Array.isArray(val)) {
          for (const item of val) {
            const strItem = String(item).trim();
            if (!strItem) continue;
            if (Object.prototype.hasOwnProperty.call(optionCounts, strItem)) {
              optionCounts[strItem]++;
            } else {
              otherCount++;
              if (otherAnswersSet.size < 50) otherAnswersSet.add(strItem);
            }
          }
        } else {
          const strVal = String(val).trim();
          if (Object.prototype.hasOwnProperty.call(optionCounts, strVal)) {
            optionCounts[strVal]++;
          } else {
            otherCount++;
            if (otherAnswersSet.size < 50) otherAnswersSet.add(strVal);
          }
        }
      }

      const options = field.options.map((opt) => {
        const count = optionCounts[opt] || 0;
        const percentage =
          totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0;
        return { label: opt, count, percentage };
      });

      return {
        fieldId,
        label,
        type,
        totalAnswered,
        options,
        otherCount,
        otherAnswers: Array.from(otherAnswersSet),
      };
    }

    if (type === "number") {
      const numbers: number[] = [];
      for (const ansObj of parsedAnswersList) {
        const val = ansObj[fieldId];
        if (val !== undefined && val !== null && val !== "") {
          const num = Number(val);
          if (!isNaN(num)) {
            numbers.push(num);
          }
        }
      }
      const totalAnswered = numbers.length;
      let numberStats: FieldSummary["numberStats"] = undefined;
      if (numbers.length > 0) {
        const sum = numbers.reduce((a, b) => a + b, 0);
        const avg = Math.round((sum / numbers.length) * 100) / 100;
        const min = Math.min(...numbers);
        const max = Math.max(...numbers);
        numberStats = {
          count: numbers.length,
          avg,
          min,
          max,
          sum,
          recentValues: numbers.slice(-20).reverse(),
        };
      }
      return {
        fieldId,
        label,
        type,
        totalAnswered,
        numberStats,
      };
    }

    const freqMap = new Map<string, number>();
    let totalAnswered = 0;
    for (const ansObj of parsedAnswersList) {
      const val = ansObj[fieldId];
      if (val !== undefined && val !== null) {
        const strVal = String(val).trim();
        if (strVal) {
          totalAnswered++;
          freqMap.set(strVal, (freqMap.get(strVal) || 0) + 1);
        }
      }
    }
    const textAnswers = Array.from(freqMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 100);

    return {
      fieldId,
      label,
      type,
      totalAnswered,
      textAnswers,
    };
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ formId: string }> },
) {
  try {
    const rawForm = await managedForm((await context.params).formId);
    const form = serializeForm(rawForm);
    await ensureSheetNotificationQueue();
    const page = Math.max(
      1,
      Number(new URL(request.url).searchParams.get("page")) || 1,
    );
    const offset = (Math.floor(page) - 1) * 50;
    const [rows] = await db.query<DbRow[]>(
      "SELECT r.id, r.answers, r.fields, r.created_at AS \"createdAt\", r.task_id AS \"taskId\", p.slug AS \"projectSlug\", q.sent_at AS \"notificationSentAt\", q.attempts AS \"notificationAttempts\" FROM native_form_responses r LEFT JOIN tasks t ON t.id=r.task_id LEFT JOIN projects p ON p.id=t.project_id LEFT JOIN sheet_notification_queue q ON q.task_id=r.task_id WHERE r.form_id = ? ORDER BY r.id DESC LIMIT 51 OFFSET ?",
      [form.id, offset],
    );

    const [allAnswersRows] = await db.query<DbRow[]>(
      "SELECT answers FROM native_form_responses WHERE form_id = ?",
      [form.id],
    );
    const totalResponses = allAnswersRows.length;
    const summary = computeSummary(form.fields, allAnswersRows);

    return Response.json({
      responses: rows.slice(0, 50).map((r) => ({
        ...r,
        answers: decode(r.answers),
        fields: decode(r.fields),
      })),
      hasMore: rows.length > 50,
      totalResponses,
      summary,
    });
  } catch (error) {
    return formError(error);
  }
}
