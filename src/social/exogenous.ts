import { REGIONS } from "./config";
import { annualToMonthly, uniform } from "./math";
import { ageOf, sortedPeople } from "./population";
import { transfer } from "./ledger";
import type { Emit } from "./markets";
import type { ExogenousInput, LedgerEntry, World } from "./types";

export function validateScenarioInputs(world: World) {
  const months = new Set<number>();
  for (const point of world.scenarioInputs.macroSeries) {
    if (
      !Number.isInteger(point.month) ||
      point.month < 1 ||
      months.has(point.month)
    )
      throw new Error("宏观输入月份必须为不重复的正整数。");
    months.add(point.month);
    if (point.priceIndex !== undefined && point.priceIndex <= 0)
      throw new Error("物价指数必须大于零。");
    for (const value of [
      point.demandIndex,
      point.priceIndex,
      ...Object.values(point.segmentMultipliers ?? {}),
    ])
      if (value !== undefined && (!Number.isFinite(value) || value < 0))
        throw new Error("需求、物价和分区系数必须为有限非负数。");
    if (
      point.governmentGrant !== undefined &&
      (!Number.isSafeInteger(point.governmentGrant) ||
        point.governmentGrant < 0)
    )
      throw new Error("外部拨款必须为非负整数分。");
  }
  const keys = new Set<string>();
  for (const event of world.scenarioInputs.exogenousEvents) {
    const key = `${event.month}/${event.kind}/${event.targetId}`;
    if (!Number.isInteger(event.month) || event.month < 1 || keys.has(key))
      throw new Error("同一对象的同类外生事件不能在同月重复。");
    keys.add(key);
    if (!["death", "health", "birth", "migration"].includes(event.kind))
      throw new Error("未知的外生过程。");
    if (
      event.severity !== undefined &&
      (!Number.isFinite(event.severity) ||
        event.severity < 0 ||
        event.severity > 1)
    )
      throw new Error("健康冲击必须在 0—1。");
    if (event.regionId !== undefined && !REGIONS.includes(event.regionId))
      throw new Error("外生迁移的地区不存在。");
  }
}
export function applyMacroInputs(
  world: World,
  ledger: LedgerEntry[],
  emit: Emit,
) {
  const point = world.scenarioInputs.macroSeries.find(
    (p) => p.month === world.month,
  );
  if (!point) return;
  if (point.demandIndex !== undefined)
    world.externalSector.demandIndex = point.demandIndex;
  if (point.priceIndex !== undefined)
    world.externalSector.priceIndex = point.priceIndex;
  if (point.segmentMultipliers)
    Object.assign(
      world.externalSector.segmentMultipliers,
      point.segmentMultipliers,
    );
  const event = emit("macro-input", "情景中的外部需求与物价开始生效", [], {
    demandIndex: world.externalSector.demandIndex,
    priceIndex: world.externalSector.priceIndex,
    grant: point.governmentGrant ?? 0,
  });
  if (point.governmentGrant)
    transfer(
      world,
      ledger,
      "external",
      world.government.accountId,
      point.governmentGrant,
      "情景外部拨款",
      event.id,
    );
}
// 统计风险和预登记冲击都从这个接口进入，人物观察中不包含未来的事件表。
export function sampleExogenousEvents(world: World): ExogenousInput[] {
  const result: ExogenousInput[] = [],
    p = world.parameters,
    month = world.month;
  for (const person of sortedPeople(world).filter((p) => p.alive)) {
    const age = ageOf(person, month),
      band =
        age < 15
          ? 0
          : age < 40
            ? 1
            : age < 60
              ? 2
              : age < 75
                ? 3
                : age < 90
                  ? 4
                  : 5;
    if (
      uniform(world.seeds.shocks, month, `mortality/${person.id}`) <
      annualToMonthly(p.mortalityAnnual[band])
    )
      result.push({ month, kind: "death", targetId: person.id });
    if (
      uniform(world.seeds.shocks, month, `health/${person.id}`) <
      annualToMonthly(p.healthAnnualRisk)
    )
      result.push({
        month,
        kind: "health",
        targetId: person.id,
        severity:
          0.1 +
          uniform(world.seeds.shocks, month, `health-severity/${person.id}`) *
            0.2,
      });
    if (
      p.migrationAnnualRate &&
      uniform(world.seeds.shocks, month, `migration/${person.id}`) <
        annualToMonthly(p.migrationAnnualRate)
    )
      result.push({
        month,
        kind: "migration",
        targetId: person.id,
        regionId: REGIONS[(REGIONS.indexOf(person.regionId) + 1) % 3],
      });
  }
  for (const h of Object.values(world.households).sort((a, b) =>
    a.id.localeCompare(b.id),
  ))
    if (
      uniform(world.seeds.shocks, month, `birth/${h.id}`) <
      annualToMonthly(p.birthAnnualRisk)
    )
      result.push({ month, kind: "birth", targetId: h.id });
  const merged = new Map(result.map((e) => [`${e.kind}/${e.targetId}`, e]));
  for (const event of world.scenarioInputs.exogenousEvents.filter(
    (e) => e.month === month,
  ))
    merged.set(`${event.kind}/${event.targetId}`, event);
  return [...merged.values()];
}
