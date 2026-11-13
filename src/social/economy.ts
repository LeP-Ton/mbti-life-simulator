import { DOMAINS } from "../simulation/types";
import { PRODUCTIVITY } from "./config";
import {
  accrue,
  cash,
  settleClaims,
  transfer,
  recordedTransfer,
  monthlyTuition,
} from "./ledger";
import { bounded, clamp01, logit, mean, sigmoid, sum, uniform } from "./math";
import { ageOf, sortedPeople } from "./population";
import type { Emit } from "./markets";
import type { Firm, LedgerEntry, World } from "./types";
import { sqrt } from "./numeric";

export function householdNeed(world: World, id: string): number {
  const household = world.households[id];
  const members = household.memberIds
    .map((id) => world.persons[id])
    .filter((p) => p?.alive);
  if (!members.length) return 0;
  return Math.round(
    (members.reduce(
      (s, p) =>
        s +
        (ageOf(p, world.month) < 18
          ? 70000
          : ageOf(p, world.month) >= 65
            ? 110000
            : 100000),
      0,
    ) +
      world.parameters.housingCost *
        (household.regionId === "青屿市"
          ? 1
          : household.regionId === "临溪镇"
            ? 0.8
            : 0.6)) *
      world.externalSector.priceIndex,
  );
}
export function assignCare(world: World) {
  for (const household of Object.values(world.households).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const alive = household.memberIds
      .map((id) => world.persons[id])
      .filter((p) => p?.alive)
      .sort((a, b) => a.id.localeCompare(b.id));
    household.basicNeed = householdNeed(world, household.id);
    household.careDemand = alive.reduce(
      (s, p) =>
        s +
        (ageOf(p, world.month) < 6 ? 16 : 0) +
        Math.round((1 - p.state.health) * 16 * 2) / 2,
      0,
    );
    const carers = alive.filter(
      (p) => ageOf(p, world.month) >= 18 && p.state.health > 0.5,
    );
    const perCarer = carers.length
      ? Math.ceil((household.careDemand / carers.length) * 2) / 2
      : 0;
    for (const person of alive) {
      person.careHours = carers.includes(person) ? perCarer : 0;
      person.commitments = person.commitments.filter((c) => c.kind !== "care");
      if (person.careHours)
        person.commitments.push({
          id: `care:${household.id}`,
          kind: "care",
          hours: person.careHours,
          targetId: household.id,
        });
    }
  }
}
export function settleEconomy(world: World, ledger: LedgerEntry[], emit: Emit) {
  const people = sortedPeople(world);
  for (const person of people) person.employment.lastIncome = 0;
  const wagesBefore = ledger.length;
  for (const firm of Object.values(world.firms).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (firm.status !== "active") continue;
    const workers = firm.positionIds
      .map((id) => world.positions[id])
      .filter((p) => p.holderId)
      .map((position) => ({
        position,
        person: world.persons[position.holderId!],
      }))
      .filter((v) => v.person.alive);
    const capacity = workers.reduce(
      (s, { person, position }) =>
        s +
        (person.employment.productiveHours / 160) *
          PRODUCTIVITY[position.grade] *
          (0.6 +
            0.4 *
              (person.employment.qualityCount
                ? person.employment.qualitySum / person.employment.qualityCount
                : 0.2)),
      0,
    );
    firm.lastOutput = Math.min(firm.orders, Math.max(0, capacity));
    const revenue = Math.round(
      firm.lastOutput *
        world.parameters.unitRevenue *
        world.externalSector.priceIndex,
    );
    const materials = Math.round(revenue * world.parameters.materialsRate),
      operating = Math.round(
        (world.parameters.operatingCost *
          Number(world.scenarioId.split(":").at(-1))) /
          1000,
      );
    firm.wagesDue = 0;
    firm.wagesPaid = 0;
    const event = emit(
      "production",
      "交付、工资承诺与实际支付分别结算",
      workers.map((w) => w.person.id),
      {
        firmId: firm.id,
        output: firm.lastOutput,
        revenue,
        orders: firm.orders,
      },
      {},
      {},
    );
    transfer(
      world,
      ledger,
      "external",
      firm.accountId,
      revenue,
      "外部订单收入",
      event.id,
    );
    for (const { person, position } of workers) {
      const wage = Math.round(
        position.wage * Math.min(1, person.employment.workHours / 160),
      );
      firm.wagesDue += wage;
      if (person.employment.workHours < 160)
        emit(
          "work-absence",
          "照料与健康约束使工作承诺未能完整履行",
          [person.id],
          {
            requiredHours: 160,
            actualHours: person.employment.workHours,
            wageReduction: position.wage - wage,
          },
          {
            [person.id]: {
              actualHours: person.employment.workHours,
              missingHours: 160 - person.employment.workHours,
              wageReduction: position.wage - wage,
            },
          },
        );
      person.employment.lastGrossWage = wage;
      const tax = Math.round(wage * world.parameters.wageTax);
      accrue(world, {
        debtorAccountId: firm.accountId,
        creditorAccountId: person.cashAccountId,
        category: "wage",
        amount: wage - tax,
        originMonth: world.month,
        eventId: event.id,
      });
      accrue(world, {
        debtorAccountId: firm.accountId,
        creditorAccountId: world.government.accountId,
        category: "tax",
        amount: tax,
        originMonth: world.month,
        eventId: event.id,
      });
    }
    const preTax = revenue - materials - firm.wagesDue - operating,
      tax = Math.round(Math.max(0, preTax) * world.parameters.profitTax);
    accrue(world, {
      debtorAccountId: firm.accountId,
      creditorAccountId: "external",
      category: "supplier",
      amount: materials + operating,
      originMonth: world.month,
      eventId: event.id,
    });
    accrue(world, {
      debtorAccountId: firm.accountId,
      creditorAccountId: world.government.accountId,
      category: "tax",
      amount: tax,
      originMonth: world.month,
      eventId: event.id,
    });
    settleClaims(world, ledger, firm.accountId);
    firm.lastProfit = preTax - tax;
    firm.annualProfit += firm.lastProfit;
    firm.lastRevenue = revenue;
    const averageQuality = mean(
      workers.map((w) =>
        w.person.employment.qualityCount
          ? w.person.employment.qualitySum / w.person.employment.qualityCount
          : 0,
      ),
    );
    firm.reputation = clamp01(0.9 * firm.reputation + 0.1 * averageQuality);
    firm.backlog = clamp01(
      Math.max(0, firm.orders - firm.lastOutput) / Math.max(1, firm.orders),
    );
  }
  const accountToPerson = new Map(people.map((p) => [p.cashAccountId, p]));
  for (const entry of ledger.slice(wagesBefore))
    if (entry.category === "偿还wage") {
      const person = accountToPerson.get(entry.to);
      if (person) person.employment.lastIncome += entry.amount;
      const firm = Object.values(world.firms).find(
        (f) => f.accountId === entry.from,
      );
      if (firm) firm.wagesPaid += entry.amount;
    }
  const arrears = new Map<string, number>();
  for (const claim of Object.values(world.claims))
    if (claim.category === "wage")
      arrears.set(
        claim.creditorAccountId,
        (arrears.get(claim.creditorAccountId) ?? 0) + claim.amount,
      );
  for (const person of people) {
    person.employment.wageArrears = arrears.get(person.cashAccountId) ?? 0;
    const household = world.households[person.householdId];
    if (person.alive && ageOf(person, world.month) >= 18)
      recordedTransfer(
        world,
        ledger,
        emit,
        person.cashAccountId,
        household.accountId,
        Math.round(person.employment.lastIncome * household.contributionRate),
        "家庭出资",
        household.memberIds,
      );
    if (!person.alive && cash(world, person.cashAccountId) > 0)
      recordedTransfer(
        world,
        ledger,
        emit,
        person.cashAccountId,
        household.accountId,
        cash(world, person.cashAccountId),
        "遗留资产与应收款归家庭",
        household.memberIds,
      );
  }
  // 补助先形成需求，再按同一财政预算比例支付。
  const requests = Object.values(world.households)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((h) => {
      h.basicNeed = householdNeed(world, h.id);
      const unemployed = h.memberIds
        .map((id) => world.persons[id])
        .filter(
          (p) =>
            p?.alive &&
            !p.employment.positionId &&
            p.employment.searchMonths > 0 &&
            p.employment.searchMonths <= 6,
        );
      const unemployment = unemployed.reduce(
        (s, p) =>
          s + Math.min(200000, Math.round(p.employment.lastGrossWage * 0.3)),
        0,
      );
      return {
        household: h,
        amount: Math.max(
          unemployment,
          Math.max(0, h.basicNeed - cash(world, h.accountId)),
        ),
      };
    });
  const requested = requests.reduce((s, r) => s + r.amount, 0),
    budget = Math.min(requested, cash(world, world.government.accountId));
  world.government.lastRequested = requested;
  world.government.lastPaid = 0;
  for (const r of requests)
    world.government.lastPaid += recordedTransfer(
      world,
      ledger,
      emit,
      world.government.accountId,
      r.household.accountId,
      requested ? Math.floor((budget * r.amount) / requested) : 0,
      "预算约束社会支持",
      r.household.memberIds,
    );
  for (const household of Object.values(world.households).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    household.basicNeed = householdNeed(world, household.id);
    const members = household.memberIds
      .map((id) => world.persons[id])
      .filter((p) => p?.alive)
      .sort((a, b) => a.id.localeCompare(b.id));
    // 共同生活的自有缓冲也可以支持家庭，但只转移账户已有现金。
    const gap = Math.max(
      0,
      household.basicNeed - cash(world, household.accountId),
    );
    const supporters = members.filter((p) => ageOf(p, world.month) >= 18),
      reserves = supporters.map((p) =>
        Math.max(0, cash(world, p.cashAccountId) - 100000),
      );
    const reserveTotal = sum(reserves);
    supporters.forEach((p, i) => {
      if (reserveTotal)
        recordedTransfer(
          world,
          ledger,
          emit,
          p.cashAccountId,
          household.accountId,
          Math.min(reserves[i], Math.ceil((gap * reserves[i]) / reserveTotal)),
          "家庭缓冲支持",
          household.memberIds,
        );
    });
    household.lastConsumption = recordedTransfer(
      world,
      ledger,
      emit,
      household.accountId,
      "external",
      household.basicNeed,
      "基本生活与住房",
      household.memberIds,
    );
    household.shortfall = household.basicNeed - household.lastConsumption;
    const adequacy = household.basicNeed
      ? household.lastConsumption / household.basicNeed
      : 1;
    for (const person of members) {
      person.state.wellbeing.material = adequacy;
      person.state.wellbeing.security = clamp01(
        (cash(world, person.cashAccountId) +
          cash(world, household.accountId) / Math.max(1, members.length)) /
          (Math.max(100000, household.basicNeed) * 3),
      );
    }
    const students = members.filter((p) => p.education.schoolId),
      fees = students.map((p) =>
        monthlyTuition(
          world.schools[p.education.schoolId!].annualFee,
          world.month - p.education.startedMonth,
        ),
      );
    const due = sum(fees),
      tuitionGap = Math.max(0, due - cash(world, household.accountId));
    const ownFunds = students.map((p, i) =>
        Math.min(fees[i], cash(world, p.cashAccountId)),
      ),
      available = sum(ownFunds);
    students.forEach((p, i) => {
      if (available)
        recordedTransfer(
          world,
          ledger,
          emit,
          p.cashAccountId,
          household.accountId,
          Math.min(
            ownFunds[i],
            Math.floor((tuitionGap * ownFunds[i]) / available),
          ),
          "教育自付转入家庭",
          household.memberIds,
        );
      const school = world.schools[p.education.schoolId!];
      const obligation = emit(
        "tuition-obligation",
        "已承诺的课程形成当月教育费用",
        household.memberIds,
        { schoolId: school.id, studentId: p.id, amount: fees[i] },
        Object.fromEntries(
          household.memberIds.map((id) => [
            id,
            { schoolId: school.id, studentId: p.id, amount: fees[i] },
          ]),
        ),
      );
      accrue(world, {
        debtorAccountId: household.accountId,
        creditorAccountId: school.accountId,
        category: "tuition",
        amount: fees[i],
        originMonth: world.month,
        eventId: obligation.id,
      });
    });
    // 同一家庭当期的教育义务同时入账，再按比例结算；不让成员顺序决定谁退学。
    settleClaims(world, ledger, household.accountId);
    for (const person of students) {
      const school = world.schools[person.education.schoolId!];
      const unpaid = Object.values(world.claims).some(
        (c) =>
          c.debtorAccountId === household.accountId &&
          c.creditorAccountId === school.accountId &&
          c.category === "tuition",
      );
      person.education.unpaidMonths = unpaid
        ? person.education.unpaidMonths + 1
        : 0;
    }
  }
  for (const firm of Object.values(world.firms).sort((a, b) =>
    a.id.localeCompare(b.id),
  ))
    if (firm.status === "active") {
      const wageDebt = Object.values(world.claims)
        .filter(
          (c) => c.debtorAccountId === firm.accountId && c.category === "wage",
        )
        .reduce((s, c) => s + c.amount, 0);
      firm.arrearsMonths =
        wageDebt > firm.wagesDue * 0.2 && firm.wagesDue > 0
          ? firm.arrearsMonths + 1
          : 0;
      if (firm.arrearsMonths >= 2) {
        firm.status = "closed";
        const actors: string[] = [];
        for (const id of firm.positionIds) {
          const p = world.positions[id];
          p.enabled = false;
          if (p.holderId) {
            const person = world.persons[p.holderId];
            actors.push(person.id);
            person.employment.positionId = null;
            person.employment.leaveReason = "企业欠薪退出";
            person.employment.searchMonths = 0;
            person.commitments = person.commitments.filter(
              (c) => c.kind !== "work",
            );
            p.holderId = null;
            world.counters.separations++;
          }
        }
        settleClaims(world, ledger, firm.accountId);
        emit(
          "closure",
          "企业退出，未清偿工资保留为债权",
          actors,
          { firmId: firm.id, wageDebt },
          {},
          {},
        );
      }
      if (world.month % 12 === 0 && firm.status === "active") {
        const debt = Object.values(world.claims).some(
          (c) => c.debtorAccountId === firm.accountId,
        );
        const available = Math.max(
          0,
          cash(world, firm.accountId) - firm.wagesDue * 3,
        );
        const dividend = debt
          ? 0
          : Math.min(
              available,
              Math.round(Math.max(0, firm.annualProfit) * 0.3),
            );
        for (const owner of firm.owners)
          recordedTransfer(
            world,
            ledger,
            emit,
            firm.accountId,
            world.households[owner.householdId].accountId,
            Math.floor(dividend * owner.share),
            "股东分配",
            world.households[owner.householdId].memberIds,
          );
        firm.annualProfit = 0;
      }
    }
}
export function evolveInstitutions(world: World, emit: Emit) {
  if (world.month % 3 !== 0) return;
  const active = Object.values(world.firms)
    .filter((f) => f.status === "active")
    .sort((a, b) => a.id.localeCompare(b.id));
  const profits = active.map((f) => f.lastProfit),
    deliveries = active.map((f) => (f.orders ? f.lastOutput / f.orders : 0));
  const pm = mean(profits),
    dm = mean(deliveries),
    ps = sqrt(mean(profits.map((v) => (v - pm) ** 2))),
    ds = sqrt(mean(deliveries.map((v) => (v - dm) ** 2)));
  for (const firm of Object.values(world.firms).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (
      world.parameters.institutionLearning &&
      !firm.policyLocked &&
      firm.status === "active" &&
      firm.reinforcement.length
    ) {
      const reward =
        (1 - firm.policy.metricWeight) *
          (ps ? (firm.lastProfit - pm) / ps : 0) +
        firm.policy.metricWeight *
          (ds
            ? ((firm.orders ? firm.lastOutput / firm.orders : 0) - dm) / ds
            : 0) -
        (0.2 * firm.turnover) / Math.max(1, firm.positionIds.length) -
        (0.1 * firm.administrationHours) / 160;
      const gradient = mean(
        firm.reinforcement.map(
          (r) => (reward - firm.rewardBaseline) * (r.action - r.probability),
        ),
      );
      const before = firm.policy.punitive;
      firm.policy.punitive = sigmoid(
        bounded(
          logit(before) + world.parameters.institutionRate * gradient,
          -4,
          4,
        ),
      );
      firm.rewardBaseline = 0.9 * firm.rewardBaseline + 0.1 * reward;
      firm.revisions.push({
        id: `institution:${world.month}:${firm.id}`,
        month: world.month,
        layer: "institution",
        baseVersion: firm.version,
        status: "accepted",
        reason: "季度相对经营结果的策略强化假设；经 θ 范围检查",
        scope: firm.id,
        evidenceIds: firm.reinforcement.map((r) => r.eventId),
        counterEvidenceIds: firm.reinforcement
          .filter(
            (r) =>
              (reward - firm.rewardBaseline) * (r.action - r.probability) < 0,
          )
          .map((r) => r.eventId),
        before: [before],
        after: [firm.policy.punitive],
      });
      if (firm.revisions.length > 24) firm.revisions.shift();
      firm.version++;
      emit("institution-learning", "组织依据经营反馈调整管理倾向", [], {
        firmId: firm.id,
        before,
        after: firm.policy.punitive,
        gradient,
      });
    }
    firm.reinforcement = [];
    firm.turnover = 0;
    firm.administrationHours = 0;
  }
}
export function considerEntrants(
  world: World,
  ledger: LedgerEntry[],
  emit: Emit,
) {
  if (world.month % 3 !== 0) return;
  const occupied = new Set(
    Object.values(world.firms)
      .filter((f) => f.status === "active")
      .map((f) => `${f.regionId}/${f.domain}`),
  );
  for (const old of Object.values(world.firms)
    .filter((f) => f.status === "closed")
    .sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `${old.regionId}/${old.domain}`;
    if (occupied.has(key)) continue;
    const investors = Object.values(world.households)
      .map((h) => ({
        h,
        surplus: Math.max(0, cash(world, h.accountId) - h.basicNeed * 12),
      }))
      .filter((r) => r.surplus > 0)
      .sort((a, b) => b.surplus - a.surplus || a.h.id.localeCompare(b.h.id))
      .slice(0, 3);
    const required =
      old.positionIds.reduce((s, id) => s + world.positions[id].wage, 0) * 6;
    const total = investors.reduce((s, r) => s + r.surplus, 0);
    if (total < required) continue;
    const id = `entry:${world.month}:${old.regionId}:${old.domain}`,
      accountId = `account:${id}`;
    world.accounts[accountId] = {
      id: accountId,
      ownerId: id,
      kind: "firm",
      balance: 0,
    };
    const event = emit("investment", "新机构由实际出资建立", [], {
      firmId: id,
      capital: required,
    });
    let remaining = required;
    const owners = investors.map((r, i) => {
      const amount =
        i === investors.length - 1
          ? remaining
          : Math.floor((required * r.surplus) / total);
      remaining -= amount;
      const paid = transfer(
        world,
        ledger,
        r.h.accountId,
        accountId,
        amount,
        "新企业股本",
        event.id,
      );
      return { householdId: r.h.id, share: paid / required };
    });
    const positionIds = old.positionIds.map((oldId, i) => {
      const pid = `${id}:job:${String(i).padStart(3, "0")}`;
      world.positions[pid] = {
        ...structuredClone(world.positions[oldId]),
        id: pid,
        firmId: id,
        holderId: null,
        enabled: true,
      };
      return pid;
    });
    world.firms[id] = {
      ...structuredClone(old),
      id,
      name: `新${old.name}`,
      accountId,
      positionIds,
      owners,
      status: "active",
      orders: 0,
      reputation: 0.5,
      backlog: 0,
      arrearsMonths: 0,
      lastProfit: 0,
      annualProfit: 0,
      lastRevenue: 0,
      wagesDue: 0,
      wagesPaid: 0,
      lastOutput: 0,
      turnover: 0,
      administrationHours: 0,
      correctionCost: 0,
      maintenanceTasks: [],
      unpaidWorkHours: 0,
      reinforcement: [],
      revisions: [],
      rewardBaseline: 0,
      version: 0,
    };
    occupied.add(key);
  }
}
