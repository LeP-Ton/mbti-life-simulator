import type { FinancialClaim, Id, LedgerEntry, MoneyFen, World } from "./types";
import type { Emit } from "./markets";

export function cash(world: World, accountId: Id): MoneyFen {
  const account = world.accounts[accountId];
  if (!account) throw new Error(`账户不存在：${accountId}`);
  return account.balance;
}
// 所有资金变动均经过此入口；外部部门是显式系统边界，不是无限家庭支持。
export function transfer(
  world: World,
  journal: LedgerEntry[],
  from: Id | "external",
  to: Id | "external",
  requested: MoneyFen,
  category: string,
  causeId: Id,
): MoneyFen {
  if (!Number.isSafeInteger(requested) || requested < 0)
    throw new Error("转账必须使用非负整数分。");
  if (from === to || requested === 0) return 0;
  if (from !== "external") cash(world, from);
  if (to !== "external") cash(world, to);
  const amount =
    from === "external" ? requested : Math.min(requested, cash(world, from));
  if (!amount) return 0;
  if (from === "external") world.externalSector.inflow += amount;
  else world.accounts[from].balance -= amount;
  if (to === "external") world.externalSector.outflow += amount;
  else world.accounts[to].balance += amount;
  journal.push({
    id: `ledger-${++world.ledgerSequence}`,
    month: world.month,
    from,
    to,
    amount,
    category,
    causeId,
  });
  return amount;
}
export function accrue(world: World, claim: Omit<FinancialClaim, "id">) {
  if (!Number.isSafeInteger(claim.amount) || claim.amount < 0)
    throw new Error("应付款必须使用非负整数分。");
  if (!claim.amount) return;
  cash(world, claim.debtorAccountId);
  if (claim.creditorAccountId !== "external")
    cash(world, claim.creditorAccountId);
  const id = `claim-${claim.category}-${claim.debtorAccountId}-${claim.creditorAccountId}-${claim.originMonth}`;
  if (world.claims[id]) world.claims[id].amount += claim.amount;
  else world.claims[id] = { ...claim, id };
}
export function settleClaims(
  world: World,
  journal: LedgerEntry[],
  debtorId?: Id,
) {
  const priority = { wage: 0, tuition: 1, supplier: 2, tax: 3 };
  const claims = Object.values(world.claims)
    .filter((c) => !debtorId || c.debtorAccountId === debtorId)
    .sort(
      (a, b) =>
        priority[a.category] - priority[b.category] ||
        a.originMonth - b.originMonth ||
        a.id.localeCompare(b.id),
    );
  // 同级、同一期欠薪按比例结算，防止人物编号成为隐含优先权。
  const groups = new Map<string, typeof claims>();
  for (const claim of claims) {
    const key = `${claim.debtorAccountId}|${claim.category}|${claim.originMonth}`;
    const group = groups.get(key) ?? [];
    group.push(claim);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const total = group.reduce((a, c) => a + c.amount, 0),
      available = Math.min(total, cash(world, group[0].debtorAccountId));
    let assigned = 0;
    const amounts = group.map((c) => {
      const n = Math.floor((available * c.amount) / total);
      assigned += n;
      return n;
    });
    // 零头只分配到分级余数最高的债权，金额误差严格为零。
    const order = group
      .map((c, i) => ({
        i,
        fraction: (available * c.amount) / total - amounts[i],
      }))
      .sort(
        (a, b) =>
          b.fraction - a.fraction || group[a.i].id.localeCompare(group[b.i].id),
      );
    for (let k = 0; k < available - assigned; k++) amounts[order[k].i]++;
    group.forEach((claim, i) => {
      const paid = transfer(
        world,
        journal,
        claim.debtorAccountId,
        claim.creditorAccountId,
        amounts[i],
        `偿还${claim.category}`,
        claim.eventId,
      );
      claim.amount -= paid;
      if (claim.amount === 0) delete world.claims[claim.id];
    });
  }
}
export const totalCash = (world: World) =>
  Object.values(world.accounts).reduce((n, a) => n + a.balance, 0);
export const accountingError = (world: World) =>
  totalCash(world) -
  world.externalSector.openingCash -
  world.externalSector.inflow +
  world.externalSector.outflow;

export function recordedTransfer(
  world: World,
  journal: LedgerEntry[],
  emit: Emit,
  from: Id,
  to: Id,
  requested: MoneyFen,
  category: string,
  actors: Id[],
) {
  if (!requested) return 0;
  const amount =
    from === "external" ? requested : Math.min(requested, cash(world, from));
  const event = emit(
    "financial-transfer",
    category,
    actors,
    { from, to, requested, amount, category },
    Object.fromEntries(
      actors.map((id) => [id, { from, to, amount, requested, category }]),
    ),
    { money: amount },
  );
  return transfer(world, journal, from, to, requested, category, event.id);
}
export const monthlyTuition = (annualFee: MoneyFen, offset: number) =>
  Math.floor(annualFee / 12) +
  (Math.max(0, offset) % 12 < annualFee % 12 ? 1 : 0);
