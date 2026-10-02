export type VisitScope = "all" | "scheduled" | "unscheduled";
type PipelineRow = { visita_at: string | null; leads: { nome_cliente: string | null } | null };

export function filterPipelineRows<T extends PipelineRow>(
  rows: T[],
  {
    range,
    query,
    visitScope,
  }: {
    range: { from: Date; to: Date };
    query: string;
    visitScope: VisitScope;
  },
): T[] {
  const search = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (search && !(row.leads?.nome_cliente ?? "").toLowerCase().includes(search)) return false;
    if (!row.visita_at) return visitScope !== "scheduled";
    if (visitScope === "unscheduled") return false;
    const time = new Date(row.visita_at).getTime();
    return time >= range.from.getTime() && time <= range.to.getTime();
  });
}
