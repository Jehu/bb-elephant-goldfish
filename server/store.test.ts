import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { MIGRATIONS, Store } from "./store.ts";

test("additive comprehension migration preserves old reports and decisions across reopen", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "egm-report-migration-"));
  const file = path.join(dir, "index.sqlite");
  let db = new Database(file);
  try {
    const split = MIGRATIONS.findIndex(sql => sql.includes("ADD COLUMN report_format"));
    assert.ok(split > 0, "an additive report-format migration must exist");
    for (const sql of MIGRATIONS.slice(0, split)) db.exec(sql);
    db.pragma("foreign_keys = ON");
    db.exec(`
      INSERT INTO specs (id, project_id, path, title, created_at) VALUES ('s','p','s.md','Spec',1);
      INSERT INTO runs (id,spec_id,project_id,preset,round,max_rounds,state,target_hash,context_json,report_dir,created_at)
        VALUES ('r','s','p','full',1,3,'completed','hash','[]','.egm/r',1);
      INSERT INTO stages (id,run_id,round,position,lens,standard,state,raw_report,report_path)
        VALUES ('old','r',1,1,'comprehension','re-implementation-standard','completed','Old report','.egm/old.md');
      INSERT INTO findings (id,run_id,stage_id,spec_id,round,lens,severity,raw_severity,title,body,state,decision_kind,decision_rationale,created_at)
        VALUES ('f','r','old','s',1,'comprehension','nit','nit','Gap','Reason','dismissed','dismiss','Already clear',1);
    `);
    for (const sql of MIGRATIONS.slice(split)) db.exec(sql);
    const store = new Store(db);
    const old = store.listStages('r')[0]!;
    assert.equal(old.standard, "re-implementation-standard");
    assert.equal(old.reportFormat, "findings_v1");
    assert.equal(old.paraphrase, null);
    assert.equal(old.rawReport, null, "do not expand legacy payloads");
    assert.equal(store.getFinding('f')!.decision!.rationale, "Already clear");
    assert.equal(db.prepare("SELECT raw_report FROM stages WHERE id='old'").pluck().get(), "Old report");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    store.insertStage({ ...old, id: "new", standard: "none", reportFormat: "comprehension_v1", state: "pending" });
    const paraphrase = { proposal: "Use a queue.", existingSystem: "Calls run inline." };
    store.updateStage("new", { state: "completed", paraphrase, rawReport: "original JSON" });
    db.close();
    db = new Database(file);
    const reopened = new Store(db).listStages('r').find(s => s.id === "new")!;
    assert.equal(reopened.standard, "none");
    assert.deepEqual(reopened.paraphrase, paraphrase);
    assert.equal(reopened.rawReport, null);
    new Store(db).updateStage("new", { state: "failed", error: "output limit" });
    assert.equal(new Store(db).listStages('r').find(s => s.id === "new")!.rawReport, "original JSON");
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
