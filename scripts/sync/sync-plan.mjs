// Sync-job плана (NEXADM-13): реестр ~/.wgp/projects.json → каноны 00_<slug>_plan.json →
// Postgres (схема nexus_admin) + ставки ~/.wgp/pricing.json → pricing.
// Запускается на Windows-сервере (рядом с канонами) Task Scheduler'ом 3×/день.
// Идемпотентен: upsert по (project_id, ext_id); исчезнувшее — tombstone archived.
// Описания проектов НЕ трогает (manual/org-memory переживают синк).
// Терпим к дрейфу канонов: необязательные поля (description, done_at, …) могут отсутствовать.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import pg from "pg";

import { pgConfig } from "../db/conn.mjs";

const WGP = join(homedir(), ".wgp");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findCanon(planDir, slug) {
  const p = join(planDir, `00_${slug}_plan.json`);
  return existsSync(p) ? p : null;
}

const normStatus = (s) =>
  s === "done" ? "done" : s === "in_progress" || s === "wip" ? "in_progress" : "todo";

const client = new pg.Client(pgConfig());
await client.connect();

const summary = { projects: 0, epochs: 0, sprints: 0, tasks: 0, archived: 0, errors: [] };

try {
  await client.query("SELECT pg_advisory_lock(hashtext('nexus_admin.sync_plan'))");

  // --- pricing: [input, output, cache_write, cache_read] $/Mtok ---
  const pricingPath = join(WGP, "pricing.json");
  if (existsSync(pricingPath)) {
    const pricing = readJson(pricingPath);
    for (const [model, rates] of Object.entries(pricing)) {
      if (!Array.isArray(rates) || rates.length < 2) continue;
      await client.query(
        `INSERT INTO nexus_admin.pricing (model, input_usd, output_usd, cache_write_usd, cache_read_usd, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (model) DO UPDATE SET input_usd = $2, output_usd = $3,
           cache_write_usd = $4, cache_read_usd = $5, updated_at = now()`,
        [model, rates[0], rates[1], rates[2] ?? 0, rates[3] ?? 0]
      );
    }
  }

  // --- план по каждому enabled-проекту реестра ---
  const registry = readJson(join(WGP, "projects.json"));
  const seenSlugs = [];

  for (const [slug, cfg] of Object.entries(registry)) {
    if (!cfg.enabled) continue;
    const canonPath = findCanon(cfg.plan_dir, slug);
    if (!canonPath) {
      summary.errors.push(`${slug}: канон не найден в ${cfg.plan_dir}`);
      continue;
    }
    let canon;
    try {
      canon = readJson(canonPath);
    } catch (e) {
      summary.errors.push(`${slug}: битый канон — ${e.message}`);
      continue;
    }
    seenSlugs.push(slug);

    await client.query("BEGIN");
    try {
      const proj = canon.project ?? {};
      const allTasks = (canon.epochs ?? []).flatMap((e) =>
        (e.sprints ?? []).flatMap((s) => s.tasks ?? [])
      );
      const doneH = allTasks
        .filter((t) => normStatus(t.status) === "done")
        .reduce((a, t) => a + (Number(t.estimate_h) || 0), 0);
      const allDone = allTasks.length > 0 && allTasks.every((t) => normStatus(t.status) === "done");

      const pr = await client.query(
        `INSERT INTO nexus_admin.projects (slug, name, start_date, end_date, global_h, global_ai_h,
           done_h, status, archived, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, now())
         ON CONFLICT (slug) DO UPDATE SET name = $2, start_date = $3, end_date = $4,
           global_h = $5, global_ai_h = $6, done_h = $7, status = $8, archived = false, synced_at = now()
         RETURNING id`,
        [
          slug,
          proj.name ?? slug,
          proj.start_date ?? null,
          proj.global_end_date ?? null,
          proj.global_h ?? null,
          proj.global_ai_h ?? null,
          doneH,
          allDone ? "completed" : "active",
        ]
      );
      const projectId = pr.rows[0].id;
      summary.projects++;

      const seenEpochs = [];
      const seenSprints = [];
      const seenTasks = [];

      for (const [ei, epoch] of (canon.epochs ?? []).entries()) {
        const epochTasks = (epoch.sprints ?? []).flatMap((s) => s.tasks ?? []);
        const epochDoneH = epochTasks
          .filter((t) => normStatus(t.status) === "done")
          .reduce((a, t) => a + (Number(t.estimate_h) || 0), 0);
        const er = await client.query(
          `INSERT INTO nexus_admin.epochs (project_id, ext_id, name, description, ord,
             start_date, end_date, epoch_h, epoch_ai_h, done_h, archived)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
           ON CONFLICT (project_id, ext_id) DO UPDATE SET name = $3, description = $4, ord = $5,
             start_date = $6, end_date = $7, epoch_h = $8, epoch_ai_h = $9, done_h = $10, archived = false
           RETURNING id`,
          [
            projectId,
            epoch.id,
            epoch.name ?? epoch.id,
            epoch.description ?? null,
            epoch.order ?? ei + 1,
            epoch.start_date || null,
            epoch.end_date || null,
            epoch.epoch_h ?? null,
            epoch.epoch_ai_h ?? null,
            epochDoneH,
          ]
        );
        const epochId = er.rows[0].id;
        seenEpochs.push(epoch.id);
        summary.epochs++;

        for (const [si, sprint] of (epoch.sprints ?? []).entries()) {
          const sprintDoneH = (sprint.tasks ?? [])
            .filter((t) => normStatus(t.status) === "done")
            .reduce((a, t) => a + (Number(t.estimate_h) || 0), 0);
          const sr = await client.query(
            `INSERT INTO nexus_admin.sprints (epoch_id, project_id, ext_id, name, ord,
               start_date, end_date, sprint_h, sprint_ai_h, days, done_h, archived)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false)
             ON CONFLICT (project_id, ext_id) DO UPDATE SET epoch_id = $1, name = $4, ord = $5,
               start_date = $6, end_date = $7, sprint_h = $8, sprint_ai_h = $9, days = $10,
               done_h = $11, archived = false
             RETURNING id`,
            [
              epochId,
              projectId,
              sprint.id,
              sprint.name ?? sprint.id,
              sprint.order ?? si + 1,
              sprint.start_date || null,
              sprint.end_date || null,
              sprint.sprint_h ?? null,
              sprint.sprint_ai_h ?? null,
              sprint.sprint_days ?? null,
              sprintDoneH,
            ]
          );
          const sprintId = sr.rows[0].id;
          seenSprints.push(sprint.id);
          summary.sprints++;

          for (const task of sprint.tasks ?? []) {
            await client.query(
              `INSERT INTO nexus_admin.tasks (sprint_id, project_id, ext_id, readable_id, name,
                 description, done_criteria, task_type, status, done_at, estimate_h, ai_estimate_h,
                 realistic_h, pessimistic_h, assignee, archived)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, false)
               ON CONFLICT (project_id, ext_id) DO UPDATE SET sprint_id = $1, readable_id = $4,
                 name = $5, description = $6, done_criteria = $7, task_type = $8, status = $9,
                 done_at = $10, estimate_h = $11, ai_estimate_h = $12, realistic_h = $13,
                 pessimistic_h = $14, assignee = $15, archived = false`,
              [
                sprintId,
                projectId,
                task.id,
                task.plane_identifier ?? null,
                task.name ?? task.id,
                task.description ?? null,
                task.done_criteria ?? null,
                task.task_type ?? "code",
                normStatus(task.status),
                task.done_at || null,
                task.estimate_h ?? null,
                task.ai_estimate_h ?? null,
                task.realistic_h ?? null,
                task.pessimistic_h ?? null,
                task.assignee ?? null,
              ]
            );
            seenTasks.push(task.id);
            summary.tasks++;
          }
        }
      }

      // tombstones: исчезнувшее из канона помечаем archived (не удаляем)
      const arch = async (table, seen) => {
        const r = await client.query(
          `UPDATE nexus_admin.${table} SET archived = true
           WHERE project_id = $1 AND NOT archived AND NOT (ext_id = ANY($2::text[]))`,
          [projectId, seen]
        );
        summary.archived += r.rowCount;
      };
      await arch("epochs", seenEpochs);
      await arch("sprints", seenSprints);
      await arch("tasks", seenTasks);

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      summary.errors.push(`${slug}: ${e.message}`);
    }
  }

  // проекты, пропавшие из реестра/выключенные — tombstone
  const pa = await client.query(
    `UPDATE nexus_admin.projects SET archived = true
     WHERE NOT archived AND NOT (slug = ANY($1::text[]))`,
    [seenSlugs]
  );
  summary.archived += pa.rowCount;

  await client.query(
    `INSERT INTO nexus_admin.sync_meta (key, value, updated_at) VALUES ('last_sync_at', now()::text, now())
     ON CONFLICT (key) DO UPDATE SET value = now()::text, updated_at = now()`
  );
  await client.query(
    `INSERT INTO nexus_admin.sync_meta (key, value, updated_at) VALUES ('last_sync_status', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
    [summary.errors.length ? `errors: ${summary.errors.join("; ")}` : "ok"]
  );

  console.log("sync-plan:", JSON.stringify(summary));
  if (summary.errors.length) process.exitCode = 1;
} finally {
  await client.end();
}
