import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateDefinition,
  validateAnswers,
  validateFormResponse,
} from "../lib/native-form-fields.ts";
const fields = [
  { id: "name", label: "Nama", type: "text", required: true, options: [] },
  { id: "email", label: "Email", type: "email", required: true, options: [] },
  {
    id: "choice",
    label: "Kategori",
    type: "select",
    required: true,
    options: ["A", "B"],
  },
  {
    id: "multi",
    label: "Data",
    type: "checkbox",
    required: true,
    options: ["X", "Y"],
  },
  { id: "date", label: "Tanggal", type: "date", required: false, options: [] },
];
const definition = {
  title: "Test",
  description: "",
  fields,
  isPublished: false,
};
const answers = {
  name: " Test ",
  email: "test@example.com",
  choice: "A",
  multi: ["X"],
  date: "2026-09-11",
};
test("normalizes form and accepts valid responses", () => {
  assert.equal(validateDefinition(definition).fields.length, 5);
  assert.equal(validateAnswers(fields, answers).name, "Test");
});
test("rejects malformed definitions and duplicate field identifiers", () => {
  for (const body of [
    null,
    { ...definition, title: "" },
    { ...definition, fields: [] },
    { ...definition, fields: [fields[0], fields[0]] },
    { ...definition, fields: [{ ...fields[2], options: [] }] },
    { ...definition, fields: [{ ...fields[0], type: "constructor" }] },
  ])
    assert.throws(() => validateDefinition(body));
});
test("rejects missing required values, invalid options, invalid email and impossible date", () => {
  for (const patch of [
    { name: "" },
    { email: "bad" },
    { choice: "C" },
    { multi: [] },
    { multi: ["Z"] },
    { date: "2026-02-30" },
    { name: 42 },
  ])
    assert.throws(() => validateAnswers(fields, { ...answers, ...patch }));
});

import {
  defaultAutomation,
  validateAutomation,
  renderFormTemplate,
} from "../lib/native-form-automation.ts";
test("automation validates destination and field references", () => {
  assert.throws(() =>
    validateAutomation(
      { ...defaultAutomation, whatsappEnabled: true },
      fields,
      null,
    ),
  );
  assert.throws(() =>
    validateAutomation(
      {
        ...defaultAutomation,
        whatsappEnabled: true,
        whatsappMode: "direct",
        whatsappRecipient: "wrong",
      },
      fields,
      1,
    ),
  );
  assert.throws(() =>
    validateAutomation(
      { ...defaultAutomation, taskTitle: "{{field:deleted}}" },
      fields,
      1,
    ),
  );
  assert.equal(
    validateAutomation(
      { ...defaultAutomation, taskTitle: "Request {{field:name}}" },
      fields,
      1,
    ).taskTitle,
    "Request {{field:name}}",
  );
  assert.equal(
    renderFormTemplate("Hi {{field:name}} / {{project}}", {
      "field:name": "{{project}}",
      project: "Inbox",
    }),
    "Hi {{project}} / Inbox",
  );
});

import { validateSections, formPath } from "../lib/form-sections.ts";
const branchFields = [
  {
    id: "route",
    label: "Jenis",
    type: "radio",
    required: true,
    options: ["A", "B", "Selesai"],
  },
  {
    id: "detail",
    label: "Detail A",
    type: "text",
    required: true,
    options: [],
  },
  { id: "other", label: "Detail B", type: "text", required: true, options: [] },
];
const pages = [
  {
    id: "one",
    title: "Pilihan",
    description: "",
    fieldIds: ["route"],
    next: "next",
    branch: {
      fieldId: "route",
      routes: [
        { answer: "B", target: "three" },
        { answer: "Selesai", target: "submit" },
      ],
    },
  },
  {
    id: "two",
    title: "Halaman A",
    description: "",
    fieldIds: ["detail"],
    next: "submit",
    branch: null,
  },
  {
    id: "three",
    title: "Halaman B",
    description: "",
    fieldIds: ["other"],
    next: "submit",
    branch: null,
  },
];
test("branches skip required hidden questions and discard injected hidden answers", () => {
  const form = { fields: branchFields, sections: pages };
  const result = validateFormResponse(form, {
    route: "B",
    other: "B answer",
    detail: { malicious: true },
  });
  assert.deepEqual(result.answers, { route: "B", other: "B answer" });
  assert.deepEqual(
    result.fields.map((f) => f.id),
    ["route", "other"],
  );
  assert.deepEqual(result.path, ["one", "three"]);
  assert.throws(() =>
    validateFormResponse(form, { route: "B", detail: "Wrong branch" }),
  );
  assert.deepEqual(
    validateFormResponse(form, { route: "A", detail: "A answer" }).path,
    ["one", "two"],
  );
  assert.deepEqual(validateFormResponse(form, { route: "Selesai" }).answers, {
    route: "Selesai",
  });
  assert.deepEqual(
    formPath(pages, { route: "A" }).map((s) => s.id),
    ["one", "two"],
  );
});
test("rejects backwards routes, missing targets and duplicate question placement", () => {
  assert.throws(() =>
    validateSections(
      pages.map((s, i) => (i === 1 ? { ...s, next: "one" } : s)),
      branchFields,
    ),
  );
  assert.throws(() =>
    validateSections(
      pages.map((s, i) => (i === 1 ? { ...s, next: "missing" } : s)),
      branchFields,
    ),
  );
  assert.throws(() =>
    validateSections(
      pages.map((s, i) =>
        i === 1 ? { ...s, fieldIds: ["route", "detail"] } : s,
      ),
      branchFields,
    ),
  );
  assert.throws(() =>
    validateSections(pages, [
      { ...branchFields[0], type: "checkbox" },
      ...branchFields.slice(1),
    ]),
  );
  assert.equal(validateSections(undefined, branchFields).length, 1);
});

import { OTHER_OPTION } from "../lib/form-choice-values.ts";
test("Other accepts typed answers for radio, dropdown and multiple choice", () => {
  for (const type of ["radio", "select"]) {
    const field = {
      id: "choice",
      label: "Pilihan",
      type,
      required: true,
      options: ["A"],
      allowOther: true,
    };
    assert.deepEqual(
      validateAnswers(
        [field],
        { choice: OTHER_OPTION },
        { choice: " Jawaban bebas " },
      ),
      { choice: "Lainnya: Jawaban bebas" },
    );
    assert.throws(() =>
      validateAnswers([field], { choice: OTHER_OPTION }, { choice: "" }),
    );
    assert.throws(() =>
      validateAnswers(
        [{ ...field, allowOther: false }],
        { choice: OTHER_OPTION },
        { choice: "Test" },
      ),
    );
  }
  const field = {
    id: "choice",
    label: "Pilihan",
    type: "checkbox",
    required: true,
    options: ["A", "B"],
    allowOther: true,
  };
  assert.deepEqual(
    validateAnswers(
      [field],
      { choice: ["A", OTHER_OPTION] },
      { choice: "Custom" },
    ),
    { choice: ["A", "Lainnya: Custom"] },
  );
  assert.throws(() =>
    validateAnswers([field], { choice: ["A", OTHER_OPTION] }),
  );
});
test("Other follows its configured branch and excludes hidden answers", () => {
  const form = {
    fields: branchFields.map((f, i) =>
      i === 0 ? { ...f, allowOther: true } : f,
    ),
    sections: pages.map((s, i) =>
      i === 0
        ? {
            ...s,
            branch: {
              ...s.branch,
              routes: [
                ...s.branch.routes,
                { answer: OTHER_OPTION, target: "three" },
              ],
            },
          }
        : s,
    ),
  };
  const result = validateFormResponse(
    form,
    { route: OTHER_OPTION, other: "Final", detail: "Hidden" },
    { route: "Custom route" },
  );
  assert.deepEqual(result.path, ["one", "three"]);
  assert.deepEqual(result.answers, {
    route: "Lainnya: Custom route",
    other: "Final",
  });
});
test("option image metadata is bound to valid options", () => {
  const imageId = "9b43b30b-2daf-49d5-b47a-50d87fed48ad";
  const field = {
    id: "image",
    label: "Pilih gambar",
    type: "radio",
    required: true,
    options: ["A"],
    optionImages: [{ value: "A", imageId }],
    allowOther: true,
  };
  const form = validateDefinition({ ...definition, fields: [field] });
  assert.deepEqual(form.fields[0].optionImages, field.optionImages);
  assert.throws(() =>
    validateDefinition({
      ...definition,
      fields: [{ ...field, optionImages: [{ value: "Missing", imageId }] }],
    }),
  );
  assert.throws(() =>
    validateDefinition({
      ...definition,
      fields: [{ ...field, options: ["A", "A"] }],
    }),
  );
});
