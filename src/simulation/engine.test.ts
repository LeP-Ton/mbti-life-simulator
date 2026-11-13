import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultConfig,
  ENVIRONMENTS,
  RULE_VERSION,
  TOTAL_MONTHS,
} from "./config";
import { evaluateTask, screeningReason } from "./decisions";
import { branchLife, environmentAt, generateLife } from "./engine";
import { CHAINS, EVENT_TEMPLATES } from "./events";
import { generateScores, inferMbtiFromFunctions, TYPES } from "./personality";
import { random } from "./random";
import { FUNCTIONS, type Scores } from "./types";
import { buildLifeHtml } from "../lib/export";

const config = defaultConfig();
const run = generateLife(config);

test("完整八维推导可生成十六类型，个体分数存在差异", () => {
  for (const type of TYPES) {
    const first = generateScores(`sample-${type}`, type),
      second = generateScores(`another-${type}`, type);
    assert.equal(inferMbtiFromFunctions(first).type, type);
    assert.equal(inferMbtiFromFunctions(second).type, type);
    assert.notDeepEqual(first, second);
    assert(FUNCTIONS.every((key) => first[key] >= 0 && first[key] <= 100));
  }
});
test("完全相同、缺失、非法向量不随意指定类型，重复判定稳定", () => {
  const equal = Object.fromEntries(FUNCTIONS.map((key) => [key, 50])) as Scores;
  assert.equal(inferMbtiFromFunctions(equal).type, null);
  assert.equal(inferMbtiFromFunctions({ ...equal, Ni: NaN }).type, null);
  assert.equal(inferMbtiFromFunctions({ Ni: 50 } as Scores).type, null);
  assert.deepEqual(
    inferMbtiFromFunctions(config.scores),
    inferMbtiFromFunctions(config.scores),
  );
});
test("同输入同规则同种子得到完全一致的人生，模拟包含 541 个快照", () => {
  const another = generateLife(config);
  assert.equal(run.version, RULE_VERSION);
  assert.equal(run.snapshots.length, TOTAL_MONTHS + 1);
  assert.deepEqual(run.events, another.events);
  assert.deepEqual(run.snapshots, another.snapshots);
  assert.deepEqual(run.summary, another.summary);
});
test("八维与经验分离，跨阶段实际积累不会修改基础画像", () => {
  assert.deepEqual(run.character.scores, config.scores);
  assert.deepEqual(
    run.character.inference,
    inferMbtiFromFunctions(config.scores),
  );
  assert(run.snapshots[540].development.studyHours > 0);
  assert(run.snapshots[540].development.works.length > 0);
  assert(!("scores" in run.snapshots[540].development));
});
test("所有重要选择有自动结果，人物不等待玩家，时间持续至六十岁", () => {
  assert(run.events.some((event) => event.templateId === "pathway"));
  assert(
    run.events.some(
      (event) =>
        event.templateId === "offer" || event.templateId === "independent",
    ),
  );
  assert.equal(run.events.at(-1)?.templateId, "conclusion");
  for (const event of run.events)
    if (event.choices.length)
      assert(
        event.choices.some((choice) => choice.id === event.selected),
        event.title,
      );
});
test("回放步长只读取记录，不改变最终状态或人格", () => {
  for (const step of [1, 3, 12, 36]) {
    let cursor = 0;
    while (cursor < 540) cursor = Math.min(540, cursor + step);
    assert.deepEqual(run.snapshots[cursor], run.snapshots[540]);
  }
  assert.deepEqual(run.character.scores, config.scores);
});
test("身份不能直接改变原始质量，偏见可以独立阻挡机会", () => {
  const evidence = {
    knowledge: 50,
    practice: 40,
    energy: 80,
    stress: 25,
    support: 0.6,
    hours: 70,
    disturbance: 0.5,
  };
  assert.equal(evaluateTask(evidence), evaluateTask({ ...evidence }));
  const state = structuredClone(run.snapshots[36]);
  state.education.prestige = 100;
  const biased = { ...ENVIRONMENTS[2], credentialBias: 0, genderBias: 1 };
  assert.match(
    screeningReason({ ...run.character, gender: "女" }, state, biased, 0.7)!,
    /性别/,
  );
  assert.equal(
    screeningReason({ ...run.character, gender: "男" }, state, biased, 0.7),
    null,
  );
  assert.equal(
    screeningReason(
      { ...run.character, gender: "女" },
      state,
      { ...biased, genderBias: 0 },
      0.7,
    ),
    null,
  );
});
test("每月时间分配受约束，多领域积累不能凭空增加时间", () => {
  for (const state of run.snapshots.slice(1)) {
    assert.equal(
      Object.values(state.allocation).reduce((sum, value) => sum + value, 0),
      160,
      `第 ${state.month} 月`,
    );
    assert(Object.values(state.allocation).every((value) => value >= 0));
    assert.equal(
      state.development.studyHours + state.development.practiceHours,
      run.snapshots[state.month - 1].development.studyHours +
        run.snapshots[state.month - 1].development.practiceHours +
        state.allocation.study +
        state.allocation.practice,
    );
  }
});
test("事件前因存在且不晚于后果，学习与任职年限一致", () => {
  for (const event of run.events)
    for (const link of event.links) {
      const parent = run.events.find((item) => item.id === link);
      assert(parent, `缺失前因：${link}`);
      assert(parent.month <= event.month);
    }
  for (const state of run.snapshots) {
    assert.equal(state.month, run.snapshots.indexOf(state));
    assert(state.development.workMonths <= Math.max(0, state.month - 36));
    if (state.job) assert(state.job.startedMonth <= state.month);
    for (const work of state.development.works)
      assert(work.month <= state.month);
    for (const credential of state.development.credentials)
      assert(credential.month <= state.month);
  }
});
test("内容至少三十模板与十二条有反馈的事件链", () => {
  assert(EVENT_TEMPLATES.length >= 30);
  assert.equal(CHAINS.length, 12);
  for (const chain of CHAINS)
    assert(
      EVENT_TEMPLATES.filter((template) => template.chainId === chain.id)
        .length >= 2,
      chain.id,
    );
});

test("十六类型跨四种环境均能自动完成，反馈链有真实前后记录且路径多样", () => {
  const paths = new Set<string>();
  const careers = new Set<string>();
  for (let index = 0; index < TYPES.length; index++) {
    const seed = `QA-${index}`;
    const sample = generateLife({
      ...defaultConfig(seed),
      familyResources: index * 6,
      expectation:
        index % 3 === 0
          ? "尽早稳定"
          : index % 3 === 1
            ? "重视学历"
            : "支持探索",
      scores: generateScores(seed, TYPES[index]),
      environment: ENVIRONMENTS[index % 4],
    });
    paths.add(sample.snapshots[540].education.path);
    careers.add(sample.snapshots[540].job?.role ?? "寻找机会");
    assert.equal(sample.snapshots.length, 541);
    for (const chain of CHAINS) {
      const records = sample.events.filter(
        (event) => event.chainId === chain.id,
      );
      assert(records.length >= 2, `${TYPES[index]} / ${chain.id} 缺少反馈`);
      assert(
        records.some((event) => event.links.length > 0),
        `${chain.id} 缺少前因`,
      );
    }
    for (const event of sample.events)
      if (event.choices.length)
        assert(event.choices.some((choice) => choice.id === event.selected));
  }
  assert(paths.size >= 3);
  assert(careers.size >= 5);
});
test("同环境快照续跑与原人生完全一致，原记录不会被分支修改", () => {
  const parentBefore = JSON.stringify(run);
  const branch = branchLife(run, 24, run.environment);
  assert.deepEqual(branch.snapshots, run.snapshots);
  assert.deepEqual(branch.events, run.events);
  assert.equal(JSON.stringify(run), parentBefore);
  assert.notEqual(branch.snapshots[24], run.snapshots[24]);
});
test("换环境只改变快照之后，随机键保持稳定，嵌套分支保留环境历史", () => {
  const branch = branchLife(run, 24, ENVIRONMENTS[2]);
  assert.deepEqual(branch.snapshots.slice(0, 25), run.snapshots.slice(0, 25));
  assert.deepEqual(branch.character, run.character);
  assert.notDeepEqual(branch.snapshots[540], run.snapshots[540]);
  const value = random(config.seed, 200, "macro-restructure");
  random(config.seed, 200, "新增的独立事件");
  assert.equal(random(config.seed, 200, "macro-restructure"), value);
  const nested = branchLife(branch, 96, ENVIRONMENTS[3]);
  assert.equal(environmentAt(nested, 12).id, ENVIRONMENTS[0].id);
  assert.equal(environmentAt(nested, 50).id, ENVIRONMENTS[2].id);
  assert.equal(environmentAt(nested, 100).id, ENVIRONMENTS[3].id);
  assert.throws(() => branchLife(run, 540, ENVIRONMENTS[1]));
});
test("所有指标有限且在范围内，档案来自已发生月份", () => {
  for (const state of run.snapshots) {
    assert(Number.isFinite(state.dynamic.money));
    for (const [key, value] of Object.entries(state.dynamic))
      if (typeof value === "number" && key !== "money")
        assert(value >= 0 && value <= 100, key);
    for (const value of Object.values(state.development.knowledge))
      assert(value >= 0 && value <= 100);
  }
});
test("导出年表不包含未来经历，用户文本经过 HTML 转义", () => {
  const html = buildLifeHtml(
    { ...run, name: "<img src=x onerror=alert(1)>" },
    12,
  );
  assert(html.includes("&lt;img"));
  assert(!html.includes("<img src=x"));
  assert(!html.includes("六十岁，先把这一页折起来"));
  assert(html.includes("十五岁，故事从这里开始"));
});
