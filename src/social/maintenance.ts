import type { Emit } from "./markets";
import type { Firm, World } from "./types";

export function scheduleMaintenance(
  firm: Firm,
  task: Firm["maintenanceTasks"][number],
) {
  if (firm.maintenanceTasks.some((t) => t.id === task.id)) return;
  firm.maintenanceTasks.push(task);
  firm.correctionCost += task.remaining;
}
export function consumeMaintenance(
  world: World,
  firm: Firm,
  available: number,
  workerId: string,
  emit: Emit,
) {
  let budget = available,
    used = 0;
  for (const task of firm.maintenanceTasks) {
    const hours = Math.min(budget, task.remaining);
    if (!hours) break;
    task.remaining -= hours;
    budget -= hours;
    used += hours;
    world.counters.reworkHours += hours;
    if (task.remaining === 0) {
      if (task.realDefect) world.counters.fixedDefects++;
      const actors = [workerId, ...(task.reporterId ? [task.reporterId] : [])];
      emit(
        task.realDefect ? "defect-fixed" : "inspection-complete",
        task.realDefect ? "实际缺陷在完成维护后得到修复" : "核实任务实际完成",
        actors,
        {
          firmId: firm.id,
          taskId: task.id,
          totalHours: task.total,
          realDefect: task.realDefect,
        },
        Object.fromEntries(
          actors.map((id) => [id, { completed: true, totalHours: task.total }]),
        ),
        { hours: task.total, causes: [task.causeId] },
      );
    }
    if (!budget) break;
  }
  firm.maintenanceTasks = firm.maintenanceTasks.filter((t) => t.remaining > 0);
  firm.correctionCost -= used;
  return used;
}
