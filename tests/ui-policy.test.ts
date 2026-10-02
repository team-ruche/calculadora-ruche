import assert from "node:assert/strict";
import { test } from "node:test";
import { filterPipelineRows } from "../src/lib/pipeline.ts";
import { navigationItems, isRucheOnlyRoute } from "../src/lib/navigation.ts";

const range = {
  from: new Date("2026-10-01T00:00:00Z"),
  to: new Date("2026-10-01T23:59:59.999Z"),
};
const rows = [
  { id: "start", visita_at: "2026-10-01T00:00:00Z", leads: { nome_cliente: "Alice" } },
  { id: "end", visita_at: "2026-10-01T23:59:59.999Z", leads: { nome_cliente: "Alice" } },
  { id: "outside", visita_at: "2026-10-02T00:00:00Z", leads: { nome_cliente: "Alice" } },
  { id: "unscheduled", visita_at: null, leads: { nome_cliente: "Alice" } },
  { id: "other", visita_at: "2026-10-01T12:00:00Z", leads: { nome_cliente: "Bob" } },
];

test("search and visit dates share a scope, including both date boundaries", () => {
  assert.deepEqual(
    filterPipelineRows(rows, { range, query: "  ALICE  ", visitScope: "scheduled" }).map(
      (r) => r.id,
    ),
    ["start", "end"],
  );
  assert.equal(filterPipelineRows(rows, { range, query: "missing", visitScope: "all" }).length, 0);
});

test("unscheduled opportunities remain accessible regardless of the visit date filter", () => {
  assert.deepEqual(
    filterPipelineRows(rows, { range, query: "Alice", visitScope: "all" }).map((r) => r.id),
    ["start", "end", "unscheduled"],
  );
  assert.deepEqual(
    filterPipelineRows(rows, { range, query: "", visitScope: "unscheduled" }).map((r) => r.id),
    ["unscheduled"],
  );
});

test("partners have only Overview and Quotes; internal routes include nested paths", () => {
  assert.deepEqual(
    navigationItems.filter((item) => !item.rucheOnly).map((item) => item.url),
    ["/overview", "/orcamentos"],
  );
  for (const path of [
    "/pagamentos",
    "/pagamentos/nested",
    "/visao-interna",
    "/motor",
    "/usuarios",
  ]) {
    assert.equal(isRucheOnlyRoute(path), true, path);
  }
  for (const path of ["/overview", "/orcamentos", "/orcamentos/test", "/pagamentos-other"]) {
    assert.equal(isRucheOnlyRoute(path), false, path);
  }
});
