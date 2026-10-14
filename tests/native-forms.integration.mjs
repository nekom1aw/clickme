import assert from "node:assert/strict";
import sharp from "sharp";
import { createHash, randomBytes } from "node:crypto";
const base = process.env.FORMS_TEST_URL || "http://localhost:3002";
const db = (await import("../lib/db.ts")).default;
const tag = "forms-test-" + randomBytes(8).toString("hex");
let owner, outsider, workspace, formId, projectId, standaloneId;
const imageIds = [];
const sessionTokens = new Map();
// The app only trusts DB-backed sessions, so tests sign users in the same way.
async function signIn(userId) {
  const token = randomBytes(32).toString("base64url");
  await db.execute(
    "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL '1 hour')",
    [createHash("sha256").update(token).digest("hex"), userId],
  );
  sessionTokens.set(userId, token);
}
const sessionCookie = (user) => `clickme_session=${sessionTokens.get(user)}`;
async function call(path, user, method = "GET", body) {
  if (body?.answers && !body.submissionKey)
    body = { ...body, submissionKey: randomBytes(16).toString("hex") };
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(user ? { cookie: sessionCookie(user) } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
try {
  [owner] = await db.execute(
    "INSERT INTO users (name,email,password_hash) VALUES (?,?,'unused') RETURNING id",
    [tag, tag + "@example.invalid"],
  );
  owner = owner.insertId;
  [outsider] = await db.execute(
    "INSERT INTO users (name,email,password_hash) VALUES (?,?,'unused') RETURNING id",
    [tag, tag + "-outside@example.invalid"],
  );
  outsider = outsider.insertId;
  await signIn(owner);
  await signIn(outsider);
  [workspace] = await db.execute(
    "INSERT INTO workspaces (owner_id,name,slug) VALUES (?,?,?) RETURNING id",
    [owner, tag, tag],
  );
  workspace = workspace.insertId;
  const projectResult = await call("/api/projects", owner, "POST", {
    workspaceId: workspace,
    name: tag,
    description: "Test",
    permission: "Full akses",
    isPrivate: true,
  });
  assert.equal(projectResult.status, 201);
  projectId = projectResult.body.project.id;
  assert.equal((await call("/api/forms")).status, 401);
  const definition = {
    workspaceId: workspace,
    title: "Temporary test form",
    description: "Synthetic test",
    fields: [
      {
        id: "name",
        label: "Original label",
        type: "text",
        required: true,
        options: [],
      },
    ],
    isPublished: false,
  };
  assert.equal(
    (await call("/api/forms", outsider, "POST", definition)).status,
    403,
  );
  const created = await call("/api/forms", owner, "POST", definition);
  assert.equal(created.status, 201);
  formId = created.body.id;
  const standalone = await call("/api/forms", owner, "POST", {
    ...definition,
    workspaceId: null,
  });
  assert.equal(standalone.status, 201);
  standaloneId = standalone.body.id;
  assert.equal(
    (await call("/api/forms/" + standaloneId, outsider)).status,
    403,
  );
  const path = "/api/forms/" + formId;
  const publicPath = "/api/public/forms/" + created.body.token;
  assert.equal((await call(path, outsider)).status, 403);
  assert.equal((await call(path + "/responses", outsider)).status, 403);
  assert.equal((await call(path, outsider, "PATCH", definition)).status, 403);
  assert.equal((await call(publicPath)).status, 404);
  assert.equal(
    (await call(publicPath, undefined, "POST", { answers: { name: "Test" } }))
      .status,
    404,
  );
  assert.equal(
    (await call(path, owner, "PATCH", { ...definition, isPublished: true }))
      .status,
    200,
  );
  assert.equal((await call(publicPath)).status, 200);
  assert.equal(
    (await call(publicPath, undefined, "POST", { answers: {} })).status,
    400,
  );
  assert.equal(
    (await call(publicPath, undefined, "POST", { answers: { name: "Test" } }))
      .status,
    201,
  );
  assert.equal(
    (
      await call(path, owner, "PATCH", {
        ...definition,
        fields: [{ ...definition.fields[0], label: "Updated label" }],
      })
    ).status,
    200,
  );
  const replies = await call(path + "/responses", owner);
  assert.equal(replies.status, 200);
  assert.equal(replies.body.responses.length, 1);
  assert.equal(replies.body.responses[0].fields[0].label, "Original label");
  assert.equal(replies.body.responses[0].answers.name, "Test");
  assert.equal(
    (await call(publicPath, undefined, "POST", { answers: { name: "Closed" } }))
      .status,
    404,
  );
  const png = await sharp({
    create: { width: 600, height: 900, channels: 3, background: "#8b5cf6" },
  })
    .png()
    .toBuffer();
  async function upload(user, contents = png, type = "image/png") {
    const body = new FormData();
    body.append("image", new Blob([contents], { type }), "header.png");
    const response = await fetch(base + "/api/form-images", {
      method: "POST",
      headers: user ? { cookie: sessionCookie(user) } : {},
      body,
    });
    return { status: response.status, body: await response.json() };
  }
  assert.equal((await upload()).status, 401);
  assert.equal((await upload(owner, Buffer.from("not an image"))).status, 400);
  const image = await upload(owner);
  assert.equal(image.status, 201);
  imageIds.push(image.body.id);
  const imageUrl = base + "/api/form-images/" + image.body.id;
  assert.equal((await fetch(imageUrl)).status, 404);
  const ownImage = await fetch(imageUrl, {
    headers: { cookie: sessionCookie(owner) },
  });
  assert.equal(ownImage.status, 200);
  assert.equal(ownImage.headers.get("content-type"), "image/webp");
  const metadata = await sharp(
    Buffer.from(await ownImage.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.width, 600);
  assert.equal(metadata.height, 900);
  const titleDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Rich form",
            marks: [
              { type: "bold" },
              { type: "italic" },
              { type: "underline" },
            ],
          },
        ],
      },
    ],
  };
  const descriptionDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Read more",
            marks: [{ type: "link", attrs: { href: "https://example.com/" } }],
          },
        ],
      },
    ],
  };
  const presentation = {
    titleDoc,
    descriptionDoc,
    imageId: image.body.id,
    imageX: 30,
    imageY: 75,
  };
  assert.equal(
    (
      await call("/api/forms", outsider, "POST", {
        ...definition,
        workspaceId: null,
        presentation,
      })
    ).status,
    403,
  );
  const badDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Bad link",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      },
    ],
  };
  assert.equal(
    (
      await call(path, owner, "PATCH", {
        ...definition,
        presentation: { ...presentation, descriptionDoc: badDoc },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(path, owner, "PATCH", {
        ...definition,
        isPublished: true,
        presentation,
      })
    ).status,
    200,
  );
  const published = (await call(publicPath)).body.form;
  assert.equal(published.title, "Rich form");
  assert.equal(published.description, "Read more");
  assert.deepEqual(published.presentation, presentation);
  assert.equal((await fetch(imageUrl)).status, 200);
  assert.equal(
    (
      await call(path, owner, "PATCH", {
        ...definition,
        isPublished: false,
        presentation,
      })
    ).status,
    200,
  );
  assert.equal((await fetch(imageUrl)).status, 404);
  const automation = {
    taskTitle: "Request {{field:name}}",
    whatsappEnabled: false,
    whatsappMode: "groups",
    whatsappRecipient: "",
    whatsappTemplate: "{{task}}",
  };
  assert.equal(
    (
      await call(path, owner, "PATCH", {
        ...definition,
        workspaceId: null,
        projectId,
        automation,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(path, owner, "PATCH", {
        ...definition,
        projectId,
        isPublished: true,
        automation,
      })
    ).status,
    200,
  );
  const submission = {
    answers: { name: "Task test" },
    submissionKey: randomBytes(16).toString("hex"),
  };
  const results = await Promise.all([
    call(publicPath, undefined, "POST", submission),
    call(publicPath, undefined, "POST", submission),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
  const [tasks] = await db.query(
    "SELECT id,name FROM tasks WHERE project_id=?",
    [projectId],
  );
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].name, "Request Task test");
  const linked = await call(path + "/responses", owner);
  assert.equal(linked.body.responses[0].taskId, tasks[0].id);
  const branchFields = [
    {
      id: "name",
      label: "Jenis permintaan",
      type: "select",
      required: true,
      options: ["Lanjut", "Lompat", "Selesai"],
    },
    {
      id: "detail",
      label: "Detail tersembunyi",
      type: "text",
      required: true,
      options: [],
    },
    {
      id: "finish",
      label: "Jawaban akhir",
      type: "text",
      required: true,
      options: [],
    },
  ];
  const sections = [
    {
      id: "p1",
      title: "Pilih jalur",
      description: "",
      fieldIds: ["name"],
      next: "next",
      branch: {
        fieldId: "name",
        routes: [
          { answer: "Lompat", target: "p3" },
          { answer: "Selesai", target: "submit" },
        ],
      },
    },
    {
      id: "p2",
      title: "Detail",
      description: "",
      fieldIds: ["detail"],
      next: "submit",
      branch: null,
    },
    {
      id: "p3",
      title: "Akhir",
      description: "",
      fieldIds: ["finish"],
      next: "submit",
      branch: null,
    },
  ];
  branchFields[0].allowOther = true;
  branchFields[0].optionImages = [{ value: "Lompat", imageId: image.body.id }];
  sections[0].branch.routes.push({ answer: "__clickme_other__", target: "p3" });
  const branching = {
    ...definition,
    fields: branchFields,
    sections,
    projectId,
    isPublished: true,
    automation,
  };
  assert.equal(
    (
      await call(path, owner, "PATCH", {
        ...branching,
        sections: sections.map((s, i) => (i === 2 ? { ...s, next: "p1" } : s)),
      })
    ).status,
    400,
  );
  assert.equal((await call(path, owner, "PATCH", branching)).status, 200);
  assert.deepEqual((await call(publicPath)).body.form.sections, sections);
  assert.equal(
    (await call(publicPath, undefined, "POST", { answers: { name: "Lompat" } }))
      .status,
    400,
  );
  assert.equal(
    (
      await call(publicPath, undefined, "POST", {
        answers: {
          name: "Lompat",
          finish: "Done",
          detail: "MUST NOT BE STORED",
        },
      })
    ).status,
    201,
  );
  assert.equal((await fetch(imageUrl)).status, 200);
  const publicOptions = (await call(publicPath)).body.form.fields[0];
  assert.deepEqual(publicOptions.optionImages, [
    { value: "Lompat", imageId: image.body.id },
  ]);
  assert.equal(publicOptions.allowOther, true);
  const branchedResponse = (await call(path + "/responses", owner)).body
    .responses[0];
  assert.deepEqual(branchedResponse.answers, {
    name: "Lompat",
    finish: "Done",
  });
  assert.deepEqual(
    branchedResponse.fields.map((f) => f.id),
    ["name", "finish"],
  );
  const [branchTasks] = await db.query(
    "SELECT description FROM tasks WHERE id=?",
    [branchedResponse.taskId],
  );
  assert.ok(!branchTasks[0].description.includes("MUST NOT BE STORED"));
  assert.ok(!branchTasks[0].description.includes("Detail tersembunyi"));
  assert.equal(
    (
      await call(publicPath, undefined, "POST", {
        answers: { name: "Selesai" },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await call(publicPath, undefined, "POST", {
        answers: { name: "Lanjut", detail: "Detail A" },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await call(publicPath, undefined, "POST", {
        answers: { name: "__clickme_other__", finish: "Final" },
      })
    ).status,
    400,
  );
  const otherResponse = await call(publicPath, undefined, "POST", {
    answers: { name: "__clickme_other__", finish: "Final", detail: "Hidden" },
    otherAnswers: { name: "Kebutuhan lain" },
  });
  assert.equal(otherResponse.status, 201);
  const savedOther = (await call(path + "/responses", owner)).body.responses[0];
  assert.deepEqual(savedOther.answers, {
    name: "Lainnya: Kebutuhan lain",
    finish: "Final",
  });
  const [otherTasks] = await db.query(
    "SELECT name,description FROM tasks WHERE id=?",
    [savedOther.taskId],
  );
  assert.equal(otherTasks[0].name, "Request Lainnya: Kebutuhan lain");
  assert.ok(otherTasks[0].description.includes("Lainnya: Kebutuhan lain"));
  console.log(
    "PASS: option-image access and persistence, Other text saved to response/task, Other branching; section persistence, branching, skipped-required validation, hidden answer filtering, task content, early submit; rich title/description roundtrip, safe links, portrait image upload, private/published image access, ownership checks; standalone forms, project linking, automatic task, concurrent retry deduplication; authentication, workspace isolation, create/edit, draft/publish/close, public validation, stored response, preserved question snapshot.",
  );
} finally {
  for (const id of imageIds)
    await db.execute("DELETE FROM native_form_images WHERE id=?", [id]);
  if (standaloneId)
    await db.execute("DELETE FROM native_forms WHERE id=?", [standaloneId]);
  if (projectId) {
    await db.execute(
      "DELETE FROM task_activities a USING tasks t WHERE t.id=a.task_id AND t.project_id=?",
      [projectId],
    );
    await db.execute("DELETE FROM tasks WHERE project_id=?", [projectId]);
    await db.execute("DELETE FROM project_statuses WHERE project_id=?", [
      projectId,
    ]);
    await db.execute("DELETE FROM project_members WHERE project_id=?", [
      projectId,
    ]);
    await db.execute("DELETE FROM projects WHERE id=?", [projectId]);
  }
  if (formId) {
    await db.execute("DELETE FROM native_form_responses WHERE form_id=?", [
      formId,
    ]);
    await db.execute("DELETE FROM native_forms WHERE id=?", [formId]);
  }
  if (workspace)
    await db.execute("DELETE FROM workspaces WHERE id=?", [workspace]);
  for (const id of [owner, outsider])
    if (id) await db.execute("DELETE FROM users WHERE id=?", [id]);
  await db.end();
}
