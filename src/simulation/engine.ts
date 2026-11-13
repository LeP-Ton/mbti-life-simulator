import {
  DOMAIN_NAMES,
  DOMAIN_ROLES,
  makeDomainValues,
  moneyLabel,
  RULE_VERSION,
  TOTAL_MONTHS,
} from "./config";
import {
  choose,
  evaluateExam,
  evaluateTask,
  leadingDomain,
  monthlyDecision,
  screeningReason,
} from "./decisions";
import { TEMPLATE_MAP } from "./events";
import { GENERATION_VERSION, inferMbtiFromFunctions } from "./personality";
import { clamp, clone, hash, pick, random, round } from "./random";
import {
  DOMAINS,
  type Character,
  type Choice,
  type Domain,
  type Environment,
  type LifeEvent,
  type LifeRun,
  type LifeState,
  type LifeSummary,
  type PersonConfig,
  type Stage,
} from "./types";

type EventDetail = Pick<LifeEvent, "summary" | "raw" | "evaluation"> &
  Partial<
    Omit<
      LifeEvent,
      "id" | "month" | "templateId" | "summary" | "raw" | "evaluation"
    >
  >;
const ORGANIZATIONS = [
  "澄序工作室",
  "原野协作社",
  "知岸工坊",
  "木禾应用社",
  "青屿共创中心",
  "远帆实业",
];
const SCHOOL_NAMES = ["青屿第七中学", "临溪实验中学", "远岚明德中学"];
const PATH_NAMES = {
  pending: "中学在读",
  university: "大学",
  vocational: "职业教育",
  apprentice: "学徒",
  work: "直接就业",
  graduate: "进一步学习",
};
const avg = (values: Record<string, number>) =>
  Object.values(values).reduce((sum, value) => sum + value, 0) /
  Object.values(values).length;
export const environmentAt = (run: LifeRun, month: number) =>
  [...run.environmentHistory].reverse().find((item) => item.fromMonth <= month)
    ?.environment ?? run.initialEnvironment;

function createCharacter(config: PersonConfig): Character {
  const { environment: _environment, ...identity } = config;
  return {
    ...clone(identity),
    id: `person-${hash(JSON.stringify(identity)).toString(36)}`,
    generationVersion: GENERATION_VERSION,
    inference: inferMbtiFromFunctions(config.scores),
  };
}
function initialState(person: Character): LifeState {
  const knowledge = makeDomainValues(0),
    interests = makeDomainValues(0);
  for (const domain of DOMAINS) {
    knowledge[domain] =
      14 + random(person.seed, 0, `prior-contact:${domain}`) * 12;
    interests[domain] = 33 + random(person.seed, 0, `interest:${domain}`) * 42;
  }
  return {
    month: 0,
    stage: "school",
    education: {
      path: "pending",
      institution: pick(SCHOOL_NAMES, person.seed, "school-name"),
      startedMonth: 0,
      graduationMonth: 36,
      prestige: 35,
      graduated: false,
    },
    job: null,
    development: {
      knowledge,
      practice: makeDomainValues(5),
      examPractice: 12,
      studyHours: 0,
      practiceHours: 0,
      workMonths: 0,
      searchMonths: 0,
      contributions: 0,
      works: [],
      exams: [],
      credentials: [],
      relations: [
        {
          name: "余老师",
          role: "班主任",
          since: 0,
          trust: 55,
          contribution: "最初的学习支持与反馈",
        },
      ],
    },
    dynamic: {
      energy: 80,
      stress: 24,
      autonomy: 52,
      satisfaction: 62,
      trust: 56,
      voice: 65,
      connection: 55,
      money: Math.round(800 + person.familyResources * 60),
      interests,
    },
    allocation: { study: 0, practice: 0, work: 0, connection: 0, rest: 0 },
    focus: "research",
    lastAction: "刚刚翻开人生的第一页",
    opportunityCount: 0,
    blockedCount: 0,
    queue: [],
    chains: {},
    employmentStart: null,
  };
}
function stageOf(state: LifeState): Stage {
  if (state.month < 36) return "school";
  if (!state.education.graduated && state.education.path !== "work")
    return "preparation";
  if (state.month >= 420) return "later";
  if (state.development.workMonths < 42) return "entry";
  return "career";
}

function simulate(
  person: Character,
  env: Environment,
  start: LifeState,
  prefixEvents: LifeEvent[],
  prefixSnapshots: LifeState[],
): { events: LifeEvent[]; snapshots: LifeState[] } {
  let state = clone(start);
  const events = clone(prefixEvents),
    snapshots = clone(prefixSnapshots);
  const rand = (key: string) => random(person.seed, state.month, key);
  const taskQuality = (domain = state.focus, key = "task-quality") =>
    evaluateTask({
      knowledge: state.development.knowledge[domain],
      practice: state.development.practice[domain],
      energy: state.dynamic.energy,
      stress: state.dynamic.stress,
      support: env.support,
      hours: state.allocation.practice + state.allocation.work,
      disturbance: rand(key),
    });
  const emit = (templateId: string, detail: EventDetail): LifeEvent => {
    const template = TEMPLATE_MAP[templateId];
    if (!template) throw new Error(`未定义事件模板：${templateId}`);
    const event: LifeEvent = {
      ...template,
      id: `${state.month}:${templateId}:${events.filter((item) => item.month === state.month && item.templateId === templateId).length}`,
      templateId,
      month: state.month,
      important: template.important ?? false,
      conditions: [],
      choices: [],
      selected: "",
      impacts: [],
      links: [],
      ...detail,
    };
    events.push(event);
    if (event.chainId && !state.chains[event.chainId])
      state.chains[event.chainId] = event.id;
    return event;
  };
  const defer = (
    kind: string,
    after: number,
    parentId: string,
    payload: Record<string, number | string | boolean> = {},
  ) => {
    state.queue.push({ due: state.month + after, kind, parentId, payload });
  };
  const options = (
    items: [string, string, number, string, string][],
  ): Choice[] =>
    items.map(([id, label, utility, reason, cost]) => ({
      id,
      label,
      utility,
      reason,
      cost,
    }));
  const addWork = (title: string, quality: number, domain = state.focus) => {
    state.development.works.push({
      id: `work-${state.month}-${state.development.works.length}`,
      month: state.month,
      title,
      domain,
      quality: round(quality),
      contribution:
        quality >= 60
          ? "完成可复用的交付，并保留实践记录"
          : "完成初版，记录尚未解决的问题",
    });
    state.development.contributions += quality / 30;
  };
  const exam = () => {
    const score = evaluateExam(
      avg(state.development.knowledge),
      state.development.examPractice,
      state.dynamic.energy,
      state.dynamic.stress,
      rand("exam"),
    );
    state.development.exams.push({
      month: state.month,
      name: state.month === 36 ? "升学综合考察" : "学期综合测评",
      score: round(score),
      rank: Math.round(
        clamp(101 - score + (rand("peer-cohort") - 0.5) * 20, 1, 100),
      ),
      contact: round(avg(state.development.knowledge)),
      training: round(state.development.examPractice),
    });
    if (state.month < 36)
      emit("semester", {
        summary: `这一学期，综合测评 ${round(score)} 分。分数记录了课程和题型训练的成果，也留下没有被卷面考到的部分。`,
        raw: `课程接触 ${round(avg(state.development.knowledge))}；题型实践 ${round(state.development.examPractice)}；精力 ${round(state.dynamic.energy)}。`,
        evaluation: `本届样本内约前 ${state.development.exams.at(-1)!.rank}%；排名不参与基础八维计算。`,
        conditions: ["学期结束，按已有课程接触与规范练习生成成绩"],
        impacts: ["成绩与作品分别进入发展档案"],
      });
    return score;
  };
  const acceptJob = (domain: Domain, quality: number, sourceId?: string) => {
    const organization = pick(
      ORGANIZATIONS,
      person.seed,
      `organization-${state.month}`,
    );
    const role = pick(DOMAIN_ROLES[domain], person.seed, `role-${state.month}`);
    const mismatch = clamp(
      1 - env.taskAlignment + (rand("task-fit") - 0.5) * 0.22,
      0,
      1,
    );
    const salary = Math.round(2800 + quality * 65 + env.opportunity * 1600);
    state.job = {
      organization,
      role,
      domain,
      startedMonth: state.month,
      level: 1,
      salary,
      mismatch,
      kind: "employed",
    };
    if (state.employmentStart === null) state.employmentStart = state.month;
    state.dynamic.autonomy += 3;
    state.dynamic.stress -= 6;
    const event = emit("offer", {
      chainId:
        events.find((event) => event.id === sourceId)?.chainId === "labels"
          ? "labels"
          : undefined,
      summary: `${organization}发来${role}的邀请。人物自动综合收入、已有实践与当前选择，接受这份机会。`,
      raw: `相关任务表现 ${round(quality)}；相关知识 ${round(state.development.knowledge[domain])}；实践 ${round(state.development.practice[domain])}。`,
      evaluation: `起始月收入 ${moneyLabel(salary)}，任务与选拔一致程度 ${Math.round((1 - mismatch) * 100)}%。`,
      conditions: ["已离开全日制学习阶段", "通过本渠道筛选与实际任务考察"],
      selected: "接受机会",
      impacts: ["开始积累实际工作月份与职责记录"],
      links: sourceId ? [sourceId] : [],
    });
    if (!state.chains.mismatch)
      defer("mismatch", 3, event.id, { mismatch, organization, role });
    if (!state.chains.collaboration)
      defer("collaborate", 6, event.id, { organization });
    if (!state.chains.promotion)
      defer("promotion", 24, event.id, { organization });
  };

  if (!prefixEvents.length) {
    emit("begin", {
      summary: `${person.name}在${person.region}开始了新的学期。兴趣还没有变成职业，未来也没有被写好。`,
      raw: "人物带着已有的课程接触和独立八维画像进入模拟。",
      evaluation: `${env.name}：${env.description}`,
      conditions: ["十五岁，初始人物与环境生成完成"],
      impacts: ["此后的重要选择均由人物自动处理"],
    });
    snapshots.push(clone(state));
  }

  for (let month = start.month + 1; month <= TOTAL_MONTHS; month++) {
    state.month = month;
    state.stage = stageOf(state);
    const decision = monthlyDecision(person, state, env);
    state.allocation = decision.allocation;
    const activeExploration = state.queue.some(
      (item) =>
        item.kind === "explore-feedback" &&
        item.payload.explored &&
        item.due >= month,
    );
    if (activeExploration) {
      state.allocation.study -= 12;
      state.allocation.practice += 12;
    }
    const activeReskill = state.queue.find(
      (item) =>
        item.kind === "reskill-feedback" &&
        item.payload.learned &&
        item.due >= month,
    );
    state.focus =
      state.job && decision.choice.id !== "explore"
        ? state.job.domain
        : decision.domain;
    state.lastAction = decision.choice.label;
    const { study, practice, work, connection, rest } = state.allocation;
    const access =
      0.35 + env.learningAccess * 0.42 + person.familyResources / 400;
    const effectiveEnergy = 0.45 + state.dynamic.energy / 180;
    const knowledgeGain = (study / 100) * access * effectiveEnergy;
    for (const domain of DOMAINS) {
      state.development.knowledge[domain] = clamp(
        state.development.knowledge[domain] +
          knowledgeGain *
            (state.stage === "school"
              ? 0.54
              : domain === state.focus
                ? 1.15
                : 0.13) *
            (1 - state.development.knowledge[domain] / 145),
      );
      const shiftedPractice = activeReskill ? Math.min(10, practice) : 0;
      const assignedPractice =
        domain === state.focus ? practice - shiftedPractice : practice * 0.045;
      const newDomainPractice =
        activeReskill?.payload.domain === domain ? shiftedPractice : 0;
      state.development.practice[domain] = clamp(
        state.development.practice[domain] +
          ((assignedPractice +
            newDomainPractice +
            (state.job?.domain === domain ? work * 0.5 : 0)) /
            85) *
            effectiveEnergy *
            (1 - state.development.practice[domain] / 140),
      );
      // 兴趣是经历后的动态反馈，不由某个类型预先对应一个职业。
      state.dynamic.interests[domain] = clamp(
        state.dynamic.interests[domain] +
          (domain === state.focus
            ? 0.06 + env.exploration * 0.025 - (state.job?.mismatch ?? 0) * 0.16
            : (rand(`interest-feedback:${domain}`) - 0.5) * 0.35),
        12,
        95,
      );
    }
    state.development.examPractice = clamp(
      state.development.examPractice +
        (study / 120) *
          (state.stage === "school" || state.stage === "preparation"
            ? 1
            : -0.08),
    );
    state.development.studyHours += study;
    state.development.practiceHours += practice;
    if (state.job) state.development.workMonths++;
    const targetStress =
      20 +
      env.metricPressure * 30 +
      (work > 80 ? 15 : 0) +
      (state.dynamic.money < 0 ? 14 : 0) -
      rest * 0.22;
    state.dynamic.stress = clamp(
      state.dynamic.stress * 0.84 + targetStress * 0.16,
    );
    const targetEnergy =
      88 - state.dynamic.stress * 0.42 + rest * 0.15 - (practice + study) * 0.1;
    state.dynamic.energy = clamp(
      state.dynamic.energy * 0.78 + targetEnergy * 0.22,
    );
    state.dynamic.connection = clamp(
      state.dynamic.connection * 0.98 +
        (30 + connection * 1.8 + env.support * 20) * 0.02,
    );
    state.dynamic.autonomy = clamp(
      state.dynamic.autonomy * 0.985 +
        (35 +
          env.exploration * 35 +
          state.dynamic.voice * 0.2 -
          env.metricPressure * 12) *
          0.015,
    );
    state.dynamic.satisfaction = clamp(
      state.dynamic.satisfaction * 0.97 +
        (30 +
          state.dynamic.autonomy * 0.28 +
          state.dynamic.connection * 0.25 +
          state.dynamic.energy * 0.18 -
          state.dynamic.stress * 0.16 -
          (state.job?.mismatch ?? 0) * 14) *
          0.03,
    );
    const schooling = state.stage === "school" || state.stage === "preparation";
    const livingCost =
      (schooling ? 650 : 2250) + env.opportunity * (schooling ? 300 : 900);
    const familySupport = schooling ? 450 + person.familyResources * 14 : 0;
    const income = state.job
      ? state.job.salary *
        (state.job.kind === "independent" ? 0.5 + rand("freelance-income") : 1)
      : work * 19;
    const tuition =
      state.stage === "preparation" &&
      ["university", "graduate"].includes(state.education.path)
        ? 450
        : 0;
    state.dynamic.money = round(
      state.dynamic.money + income + familySupport - livingCost - tuition,
      0,
    );

    if (state.stage === "school" && month % 6 === 0 && month < 36) exam();
    if (month === 4) {
      const choices = options([
        [
          "explore",
          "做一个小型跨学科作品",
          0.3 +
            (person.scores.Ne + person.scores.Ti) / 400 +
            env.exploration * 0.32,
          "兴趣与允许试错的空间共同提高了尝试意愿。",
          "接下来五个月，每月减少 12 小时规范复习。",
        ],
        [
          "review",
          "先巩固课程，再保留兴趣笔记",
          0.58 + env.standardWeight * 0.35 + person.scores.Si / 400,
          "当前考试要求明确，先积累基础同样合理。",
          "作品暂时停留在设想，错过本轮展示。",
        ],
      ]);
      const chosen = choose(choices, person.seed, month, "exploration-choice");
      const quality = taskQuality();
      const event = emit("explore", {
        summary: `${person.name}选择${chosen.label}。这一选择来自当前兴趣、练习与环境，而不是四字母标签的指定剧情。`,
        raw: `当前相关实践表现 ${round(quality)}；课程接触 ${round(avg(state.development.knowledge))}。`,
        evaluation:
          env.exploration > 0.6
            ? "余老师愿意提供工具和反馈，但考试仍按卷面计分。"
            : "校刊鼓励独立思考；课堂安排仍以标准答案与排名为主。",
        conditions: ["学校开放一次自主展示机会"],
        choices,
        selected: chosen.id,
        impacts: [chosen.cost],
        opportunity: {
          source: "学校自主展示",
          requirement: "自行投入时间制作，不按类型限制",
          deadline: month + 5,
          outcome: chosen.id === "explore" ? "接受" : "暂缓",
        },
      });
      defer("explore-feedback", 5, event.id, {
        explored: chosen.id === "explore",
        quality,
      });
    }
    if (month === 7) {
      const choices = options([
        [
          "question",
          "给出证据，公开追问矛盾",
          0.18 +
            (person.scores.Ti + person.scores.Ne) / 380 +
            state.dynamic.voice / 170,
          "希望先弄清楚概念，已有表达意愿支持公开提出。",
          "需要承担被解读为不配合的风险。",
        ],
        [
          "private",
          "课后说明，并保留推导过程",
          0.44 + person.scores.Fe / 250 + (100 - state.dynamic.voice) / 300,
          "保留问题，也考虑关系和沟通场合。",
          "公开讨论中矛盾暂时没有被澄清。",
        ],
        [
          "follow",
          "暂按要求，留待之后核实",
          0.38 + person.scores.Te / 230 + env.metricPressure * 0.2,
          "当前任务与风险让暂时配合更有吸引力。",
          "可能延后发现错误。",
        ],
      ]);
      const chosen = choose(choices, person.seed, month, "dissent");
      const supported =
        env.dissentSupport + rand("teacher-response") * 0.3 > 0.7;
      const accurate =
        state.development.knowledge[state.focus] +
          rand("evidence-validity") * 50 >
        45;
      state.dynamic.voice += chosen.id === "follow" ? -2 : supported ? 8 : -13;
      const event = emit("dissent", {
        summary: `${person.name}${chosen.label}。指出矛盾是否正确，由已有知识与证据决定。`,
        raw: accurate
          ? "推导中确实识别出一处条件遗漏。"
          : "发现了疑点，但目前的知识不足以证明原结论有误。",
        evaluation:
          chosen.id === "follow"
            ? "被评价为按时配合；问题保留在个人笔记里。"
            : supported
              ? "余老师要求一起核对证据，并认可澄清过程。"
              : "评语：“思路活跃，但还需要端正课堂态度。”",
        conditions: ["课堂材料存在可供核实的矛盾"],
        choices,
        selected: chosen.id,
        impacts: [
          `表达意愿${chosen.id === "follow" ? "小幅降低" : supported ? "提高" : "降低"}；八维保持不变`,
        ],
      });
      defer("dissent-feedback", 4, event.id, { supported, accurate });
    }
    if (month === 13) {
      const granted =
        env.learningAccess +
          person.familyResources / 200 +
          rand("shared-tools") * 0.4 >
        0.85;
      if (granted) state.development.practice[state.focus] += 3;
      const event = emit("resource", {
        summary: granted
          ? "图书角、共享设备和一位同伴的笔记，让原先抽象的兴趣变成能动手试的东西。"
          : "共享设备名额有限，人物改用免费材料与借来的工具，练习进度更慢。",
        raw: `资源可及性 ${Math.round(env.learningAccess * 100)}；家庭可提供的时间与材料缓冲 ${person.familyResources}。`,
        evaluation: "机会改变可获得的训练，并不改变任何人口群体的天赋或八维。",
        impacts: [
          granted
            ? "获得一次真实工具练习"
            : "保留替代学习入口，承担额外时间成本",
        ],
      });
      defer("resource-feedback", 5, event.id, { granted });
    }
    if (month === 24) {
      const event = emit("family", {
        summary: `饭桌上聊到未来。家人的倾向是“${person.expectation}”，而${person.name}更关心能否继续接触${DOMAIN_NAMES[leadingDomain(state)]}。`,
        raw: `家庭资源 ${person.familyResources}，现有储备 ${moneyLabel(state.dynamic.money)}。`,
        evaluation:
          person.expectation === "支持探索"
            ? "家人愿意协商一段试错时间，也提醒注意生活成本。"
            : person.expectation === "重视学历"
              ? "家人希望学历成为缓冲，但没有代替人物作选择。"
              : "家人希望早些获得稳定收入，也愿意讨论能负担的培训。",
        conditions: ["距离中学阶段结束约一年"],
        impacts: ["家庭期待进入升学选项效用计算，不直接改变八维"],
      });
      defer("family-feedback", 14, event.id);
    }
    if (month === 28 || (state.job && month === 168)) {
      const quality = taskQuality();
      const metric = env.metricPressure > 0.65;
      const event = emit("metric", {
        summary: state.job
          ? "组织把短期完成数量放在看板最上方，维护与复用记录排在了后面。"
          : "学校将更多时间用于可量化的题型训练，展示墙上的“综合发展”标语仍在。",
        raw: `实际任务表现 ${round(quality)}，指标压力 ${Math.round(env.metricPressure * 100)}。`,
        evaluation: metric
          ? "短期计分明显上升，尚未覆盖的理解与维护成本留待以后。"
          : "管理者同时保留长期作品与基础学习记录，指标只作部分参考。",
        conditions: ["进入一次集中评价周期"],
        impacts: [metric ? "练习偏向可计分部分" : "持续保留长期学习空间"],
      });
      defer("metric-feedback", 8, event.id, { metric, quality });
    }
    if (month === 36) {
      const score = exam();
      const capacity =
        person.familyResources / 100 + state.dynamic.money / 30000;
      const choices = options([
        [
          "university",
          "进入大学继续学习",
          score / 100 +
            capacity * 0.22 +
            (person.expectation === "重视学历" ? 0.25 : 0) +
            0.08,
          "课程接触、考察表现与家庭缓冲支持较长的学习。",
          "四年学费与放弃即时收入的成本。",
        ],
        [
          "vocational",
          "进入职业教育，结合课程与实作",
          0.52 +
            state.development.practice[state.focus] / 100 +
            (1 - capacity) * 0.1,
          "希望更快把学习用到具体任务里。",
          "部分按学校标签筛选的渠道可能不开放。",
        ],
        [
          "apprentice",
          "带着兴趣，跟随工坊学徒实践",
          0.4 +
            state.dynamic.interests.craft / 160 +
            (person.expectation === "尽早稳定" ? 0.08 : 0),
          "可获得的工坊入口提供边做边学的路径。",
          "训练范围依赖工坊，需主动补足理论。",
        ],
        [
          "work",
          "先工作，在生活里继续学习",
          0.38 +
            (person.familyResources < 30 ? 0.32 : 0) +
            (person.expectation === "尽早稳定" ? 0.32 : 0),
          "收入需求与当前可承受的选择影响了决定。",
          "失去一段集中学习时间，之后仍可再学。",
        ],
      ]).filter((item) => item.id !== "university" || score >= 35);
      const selected = choose(choices, person.seed, month, "education-path");
      const path = selected.id as
        "university" | "vocational" | "apprentice" | "work";
      const institution =
        path === "university"
          ? score > 57
            ? "晴川理工学院"
            : "青屿应用学院"
          : path === "vocational"
            ? "临溪职业学院"
            : path === "apprentice"
              ? "木禾技能工坊"
              : "自主就业与开放学习";
      state.education = {
        path,
        institution,
        startedMonth: month,
        graduationMonth:
          path === "university"
            ? month + 48
            : path === "vocational"
              ? month + 36
              : path === "apprentice"
                ? month + 24
                : null,
        prestige:
          path === "university"
            ? score > 57
              ? 78
              : 62
            : path === "vocational"
              ? 48
              : 28,
        graduated: path === "work",
      };
      state.development.credentials.push({
        title: "中学阶段完成记录",
        month,
        institution: snapshots[0].education.institution,
      });
      emit("pathway", {
        summary: `${person.name}自动选择${selected.label}，进入${institution}。这个路口既考虑兴趣，也承认资源与机会成本。`,
        raw: `综合考察 ${round(score)}；练习与项目记录已保存。`,
        evaluation: `当前路径：${PATH_NAMES[path]}。其他领域仍然开放，类型不构成职业门槛。`,
        conditions: ["完成三十六个月中学学习", "根据当前证据生成可行选项"],
        choices,
        selected: selected.id,
        impacts: [selected.cost, `下一阶段从第 ${month + 1} 月开始`],
      });
    }
    if (
      state.stage === "preparation" &&
      month === state.education.startedMonth + 5
    )
      emit("course", {
        summary: `${state.education.institution}的课程开始连接到具体任务。人物尝试用${DOMAIN_NAMES[state.focus]}的方法完成一个小练习。`,
        raw: `知识 ${round(state.development.knowledge[state.focus])}；实践 ${round(state.development.practice[state.focus])}。`,
        evaluation: "概念理解与动手熟练度分别记录，不能互相替代。",
        impacts: ["继续积累课程接触和任务熟悉度"],
      });
    if (
      (state.stage === "preparation" && month % 12 === 6) ||
      (state.job && month % 24 === 6)
    ) {
      const quality = taskQuality();
      const title = `${DOMAIN_NAMES[state.focus]} · ${["社区观察手册", "小型工具改进", "协作流程原型", "开放学习笔记"][Math.floor(rand("project-name") * 4)]}`;
      addWork(title, quality);
      emit("project", {
        summary: `完成《${title}》。它不是由某一维高分凭空产生，而是此前学习和动手时间的结果。`,
        raw: `作品质量 ${round(quality)}；累计自主实践 ${state.development.practiceHours} 小时。`,
        evaluation:
          quality >= 60
            ? "使用者反馈有帮助，部分成果可以复用。"
            : "第一版尚不成熟，保存了缺陷与下一步改进记录。",
        impacts: ["作品进入档案，后续机会可读取此项证据"],
      });
    }
    if (
      state.stage === "preparation" &&
      month === (state.education.graduationMonth ?? 0) - 10
    ) {
      const quality = taskQuality();
      const event = emit("internship", {
        summary:
          "一次与当前学习方向相关的实践机会出现。人物自动提交已有作品，并接受现场任务。",
        raw: `任务表现 ${round(quality)}，读取现有知识、实践、状态和支持。`,
        evaluation:
          env.support > 0.5
            ? "指导者给出具体反馈，并允许修改后再交。"
            : "培训较少，任务要求需要反复澄清。",
        opportunity: {
          source: `${state.education.institution}实践合作渠道`,
          requirement: "已有相关学习与一份练习记录",
          deadline: month + 1,
          outcome: "参与",
        },
        impacts: ["新增现场任务接触"],
      });
      state.development.practice[state.focus] = clamp(
        state.development.practice[state.focus] + 3,
      );
      defer("internship-feedback", 3, event.id, { quality });
    }
    if (
      state.education.graduationMonth === month &&
      month > 36 &&
      !state.education.graduated
    ) {
      const priorInstitution = state.education.institution;
      state.development.credentials.push({
        title: `${PATH_NAMES[state.education.path]}阶段完成记录`,
        month,
        institution: priorInstitution,
      });
      const canContinue =
        state.education.path === "university" &&
        avg(state.development.knowledge) > 36 &&
        state.dynamic.money > 2000;
      const choices = options([
        [
          "work",
          "带着已有积累寻找工作",
          0.7 + (person.expectation === "尽早稳定" ? 0.2 : 0),
          "现有作品与实践可作为下一阶段的起点。",
          "集中学习时间减少，仍可继续学习。",
        ],
        [
          "graduate",
          "继续三年的应用研究与学习",
          0.3 + state.dynamic.interests.research / 110 + person.scores.Ni / 500,
          "仍有想弄清楚的问题，也有一定经济缓冲。",
          "推迟全职收入，承担额外学费与时间。",
        ],
      ]).filter((item) => item.id !== "graduate" || canContinue);
      const selected = choose(choices, person.seed, month, "further-study");
      if (selected.id === "graduate") {
        state.education = {
          ...state.education,
          path: "graduate",
          institution: "知岸应用研究学院",
          startedMonth: month,
          graduationMonth: month + 36,
          graduated: false,
          prestige: state.education.prestige + 5,
        };
        emit("further-study", {
          summary: `${person.name}完成${priorInstitution}阶段后，选择进入知岸应用研究学院。`,
          raw: `已有知识均值 ${round(avg(state.development.knowledge))}；储备 ${moneyLabel(state.dynamic.money)}。`,
          evaluation: "继续学习是一项有成本的选择，不是更有价值的人生标签。",
          conditions: ["完成大学阶段", "已有知识与可用资源满足继续学习条件"],
          choices,
          selected: selected.id,
          impacts: [selected.cost],
        });
      } else {
        state.education.graduated = true;
        emit("graduate", {
          summary: `${person.name}完成${priorInstitution}阶段。课程、作品与实践一起进入履历，接下来开始寻找自己的入口。`,
          raw: `${state.development.works.length} 份作品；累计学习 ${state.development.studyHours} 小时；自主实践 ${state.development.practiceHours} 小时。`,
          evaluation: "学校标签提供部分信息，后续仍需检验与实际任务的关系。",
          choices,
          selected: selected.id,
          impacts: ["下一月进入自动求职，不需玩家回答面试题"],
        });
      }
    }

    const canWork = month > 36 && state.education.graduated;
    if (canWork && !state.job) {
      state.development.searchMonths++;
      if (!state.chains.obedience && state.development.searchMonths >= 1) {
        const choices = options([
          [
            "accept",
            "接受改期，限定投入一晚",
            0.52 +
              (state.dynamic.money < 2000 ? 0.32 : 0) +
              person.scores.Te / 450,
            "当前收入压力使入口更重要，仍保留时间上限。",
            "付出一个晚上的无偿时间。",
          ],
          [
            "clarify",
            "要求澄清范围与报酬",
            0.44 + person.scores.Ti / 400 + state.dynamic.autonomy / 250,
            "希望知道交付目标，避免含糊承诺。",
            "在强调服从的渠道中可能失去机会。",
          ],
          [
            "decline",
            "拒绝无偿方案，寻找其他机会",
            0.3 +
              person.scores.Fi / 320 +
              (state.dynamic.money > 8000 ? 0.2 : 0),
            "边界与经济缓冲共同支持退出。",
            "短期少一个收入入口。",
          ],
        ]);
        const selected = choose(
          choices,
          person.seed,
          month,
          "obedience-choice",
        );
        const quality = taskQuality();
        const event = emit("obedience", {
          summary: `招聘方临时把任务提前到今晚，并称之为“诚意”。${person.name}选择${selected.label}。`,
          raw: `此前作品的任务表现 ${round(quality)}；资源余量 ${moneyLabel(state.dynamic.money)}。`,
          evaluation:
            env.dissentSupport < 0.4 && selected.id !== "accept"
              ? "对方将澄清或退出解释为不够配合；没有因此改变原始作品质量。"
              : "对方允许限定范围或退出；接受也仍需检验实际交付。",
          choices,
          selected: selected.id,
          impacts: [selected.cost],
        });
        defer("obedience-feedback", 2, event.id, {
          choice: selected.id,
          quality,
        });
      }
      if (
        month % 3 === 1 &&
        rand("opportunity-arrival") < 0.3 + env.opportunity * 0.66
      ) {
        state.opportunityCount++;
        const domain = leadingDomain(state),
          quality = taskQuality(domain, "selection-task");
        const blocked = screeningReason(
          person,
          state,
          env,
          rand("screening-gate"),
        );
        const gate = emit(blocked ? "label-gate" : "label-open", {
          summary: blocked
            ? `${person.name}投递了一份${DOMAIN_NAMES[domain]}相关机会。${blocked}。`
            : "这个入口愿意先查看相关学习和作品，再安排与任务有关的考察。",
          raw: `同一份作品与相关任务的原始表现 ${round(quality)}，身份不参与此项公式。`,
          evaluation: blocked ?? "学校标签作为背景，作品与任务证据进入评价。",
          conditions: [
            "机会由公共渠道到达",
            `已累计 ${state.development.searchMonths} 个月求职`,
          ],
          impacts: [
            blocked ? "本渠道机会关闭，保留其他入口" : "获得实际任务考察机会",
          ],
          opportunity: {
            source: "公共招聘与合作渠道",
            requirement: blocked ?? "相关作品与任务考察",
            deadline: month + 1,
            outcome: blocked ? "预筛选未通过" : "进入考察",
          },
        });
        if (blocked) {
          state.blockedCount++;
          defer("alternative", 2, gate.id, { quality, domain });
        } else if (
          quality >
          26 + env.opportunity * 13 + rand("candidate-competition") * 16
        )
          acceptJob(domain, quality, gate.id);
      }
      if (state.development.searchMonths > 10 && !state.job) {
        if (
          state.development.practice[state.focus] >= 20 &&
          state.dynamic.autonomy > 40 &&
          state.dynamic.money > -20000
        ) {
          const quality = taskQuality();
          state.job = {
            organization: "个人作品与社区合作",
            role: `独立${DOMAIN_ROLES[state.focus][1]}`,
            domain: state.focus,
            startedMonth: month,
            level: 1,
            salary: Math.round(2400 + quality * 42),
            mismatch: 0.1,
            kind: "independent",
          };
          if (state.employmentStart === null) state.employmentStart = month;
          emit("independent", {
            summary:
              "几个小额合作形成了可持续尝试的入口。人物开始为自己的作品负责，同时保留收入波动。",
            raw: `相关任务表现 ${round(quality)}，并已有真实实践积累。`,
            evaluation:
              "自主提高，但订单不稳定；独立合作不自动带来财富或知名度。",
            impacts: ["收入开始波动，继续接受项目反馈"],
          });
        } else if (state.development.searchMonths % 6 === 0)
          emit("search", {
            summary:
              "仍在投递、完善练习，并承担等待的成本。一次筛选结果没有关闭全部人生。",
            raw: `已求职 ${state.development.searchMonths} 个月；可用储备 ${moneyLabel(state.dynamic.money)}。`,
            evaluation: "降低部分收入预期，保留继续学习与社区合作渠道。",
            impacts: ["继续积累，下一轮机会按月份独立生成"],
          });
      }
    }

    if (state.job && month % 12 === 0) {
      const quality = taskQuality(state.job.domain, "annual-delivery");
      state.development.contributions += quality / 14;
      state.job.salary = Math.round(
        state.job.salary *
          (1 + env.opportunity * 0.014 + Math.max(0, quality - 50) / 4500),
      );
    }
    if (canWork && month >= 156 && !state.chains.reskill) {
      const alternatives = DOMAINS.filter(
        (domain) => domain !== state.job?.domain,
      );
      const nextDomain = [...alternatives].sort(
        (a, b) => state.dynamic.interests[b] - state.dynamic.interests[a],
      )[0];
      const choices = options([
        [
          "learn",
          `用业余时间接触${DOMAIN_NAMES[nextDomain]}`,
          0.38 +
            env.exploration * 0.35 +
            (person.scores.Ne + person.scores.Ni) / 500,
          "新兴趣与现有经验之间出现了连接。",
          "未来半年减少部分休闲或旧方向的项目时间。",
        ],
        [
          "deepen",
          "继续深化现有领域",
          0.6 + state.development.practice[state.focus] / 250,
          "已有积累仍能支持更深入的贡献。",
          "暂缓尝试新领域。",
        ],
      ]);
      const selected = choose(choices, person.seed, month, "reskill");
      const event = emit("reskill", {
        summary: `${person.name}选择${selected.label}。转向需要具体投入，保持原方向也可能是一条有意义的路。`,
        raw: `新方向已有知识 ${round(state.development.knowledge[nextDomain])}，实践 ${round(state.development.practice[nextDomain])}。`,
        evaluation: "不以某一类型是否“适合”新方向作为条件。",
        choices,
        selected: selected.id,
        impacts: [selected.cost],
      });
      defer("reskill-feedback", 6, event.id, {
        domain: nextDomain,
        learned: selected.id === "learn",
      });
    }
    if (
      state.job &&
      month >= 192 &&
      month % 48 === 0 &&
      rand("macro-restructure") < 0.2 + (1 - env.support) * 0.26
    ) {
      const previous = state.job;
      state.job = null;
      state.development.searchMonths = 0;
      emit("layoff", {
        summary: `${previous.organization}缩减了一部分岗位。已有作品和实际工作记录保留，人物重新寻找入口。`,
        raw: `本轮外部调整键：macro-restructure / ${month}；原岗位累计 ${month - previous.startedMonth} 个月。`,
        evaluation: "组织调整并非对整个人能力或价值的裁决。",
        conditions: ["组织处于外部需求收缩周期"],
        impacts: ["停止固定收入，进入自动再就业", "已有知识、作品、贡献不清零"],
        links: state.chains.reskill ? [state.chains.reskill] : [],
      });
      state.dynamic.stress += 10;
    }
    if (month === 360) {
      emit("boundary", {
        summary:
          "人物开始重新安排生活的优先次序。继续工作、保留朋友、减少无效消耗，并不需要一个统一的成功终点。",
        raw: `精力 ${round(state.dynamic.energy)}，关系 ${round(state.dynamic.connection)}，满意度 ${round(state.dynamic.satisfaction)}。`,
        evaluation: "这些维度分别呈现，不折算成一张人生总分。",
        impacts: ["往后保留更多状态恢复空间"],
      });
      state.dynamic.autonomy += 4;
    }
    if (month === 426) {
      const supported = env.support > 0.5;
      state.development.relations.push({
        name: "小程",
        role: "后来的合作者",
        since: month,
        trust: supported ? 78 : 56,
        contribution: "共同整理实践笔记与使用反馈",
      });
      const event = emit("mentor", {
        summary: `${person.name}把做过的事整理成可复用的笔记，和一位年轻合作者交换看法。`,
        raw: `已有 ${state.development.workMonths} 个月工作实践，${state.development.works.length} 份作品记录。`,
        evaluation: supported
          ? "组织为分享留出时间，合作内容真正进入后续实践。"
          : "分享主要在业余进行，成果未被纳入当前考核。",
        impacts: ["新增一段有来源的合作关系"],
      });
      defer("mentor-feedback", 12, event.id, { supported });
    }
    if (month % 12 === 0 && month !== 36 && month < TOTAL_MONTHS) {
      const atSchool =
        state.stage === "school" || state.stage === "preparation";
      emit(
        atSchool ? "daily-school" : month >= 420 ? "community" : "daily-work",
        {
          summary: atSchool
            ? `这一年主要在${state.education.institution}学习，持续接触${DOMAIN_NAMES[state.focus]}。有进度，也有休息和普通日常。`
            : `${state.job ? `在${state.job.organization}继续做${state.job.role}` : "一边寻找机会，一边保留学习"}。并非每一年都需要一个戏剧性的转折。`,
          raw: `累计课程与学习 ${state.development.studyHours} 小时，自主实践 ${state.development.practiceHours} 小时；本月自主时间总计 160 小时。`,
          evaluation: `当下最常采用的策略：${state.lastAction}。`,
          impacts: [
            `相关知识 ${round(state.development.knowledge[state.focus])}，实践 ${round(state.development.practice[state.focus])}`,
            `可用储备 ${moneyLabel(state.dynamic.money)}`,
          ],
        },
      );
    }

    const pending = state.queue.filter((item) => item.due <= month);
    state.queue = state.queue.filter((item) => item.due > month);
    for (const item of pending) {
      const p = item.payload;
      const links = [item.parentId];
      if (item.kind === "explore-feedback") {
        const explored = Boolean(p.explored);
        const quality = taskQuality(state.focus, "exploration-followup");
        if (explored) {
          addWork("标准答案之外的观察手册", quality);
          state.development.examPractice = clamp(
            state.development.examPractice - 4 + env.exploration * 3,
          );
          state.development.knowledge[state.focus] = clamp(
            state.development.knowledge[state.focus] + 3,
          );
        }
        emit("explore-feedback", {
          summary: explored
            ? "自主探索形成了一份小作品，也占用了一些题型复习时间。理解可能得到帮助，卷面熟练度却需要另外练习。"
            : "规范练习继续积累，兴趣笔记保留下来。当前没有完成展示作品，未来仍可重新开始。",
          raw: `作品任务表现 ${round(quality)}；规范练习 ${round(state.development.examPractice)}。`,
          evaluation:
            explored && env.standardWeight > 0.8
              ? "作品得到同伴认可；班级评价仍主要读取卷面成绩。"
              : "老师把卷面与作品分开反馈，鼓励针对不足继续练习。",
          impacts: explored
            ? ["新增作品与相关理解", "承担少量规范复习机会成本"]
            : ["规范练习继续积累"],
          links,
        });
      } else if (item.kind === "dissent-feedback") {
        emit("dissent-feedback", {
          summary: p.supported
            ? "上次提问得到了澄清，这一次人物更愿意带着证据参与讨论。"
            : "人物没有换一种人格，只是变得更谨慎：先留下笔记，判断这次是否值得表达。",
          raw: `表达意愿 ${round(state.dynamic.voice)}；上次问题${p.accurate ? "得到部分证实" : "仍需要补足证据"}。`,
          evaluation: "变化发生在信任、表达意愿与策略层，而非扣减某一项八维。",
          impacts: ["表达策略保留上次反馈"],
          links,
        });
      } else if (item.kind === "resource-feedback") {
        emit("resource-feedback", {
          summary: p.granted
            ? "有了工具之后，真正起作用的仍是这几个月投入的练习。"
            : "借用与免费材料提供了慢一些的入口，相关练习仍在继续。",
          raw: `相关实践 ${round(state.development.practice[state.focus])}，自主实践累计 ${state.development.practiceHours} 小时。`,
          evaluation: "资源通过接触、训练和时间影响积累，不被解释为天赋差异。",
          impacts: ["下一次作品读取已经形成的真实练习"],
          links,
        });
      } else if (item.kind === "family-feedback") {
        emit("family-feedback", {
          summary: `人物已经走上${PATH_NAMES[state.education.path]}路径。家人开始面对具体的费用与日常，而不只是想象中的选项。`,
          raw: `当前资源 ${moneyLabel(state.dynamic.money)}；学习地点 ${state.education.institution}。`,
          evaluation:
            person.expectation === "支持探索"
              ? "协商继续进行，支持带着现实边界。"
              : "原有期待仍在，但真实进展提供了新的协商依据。",
          impacts: ["家人的期待保留为环境条件，不覆盖人物选择"],
          links,
        });
      } else if (item.kind === "metric-feedback") {
        state.dynamic.stress += p.metric ? 4 : -2;
        emit("metric-feedback", {
          summary: p.metric
            ? "题型与短期指标的熟悉度上升，未被覆盖的理解或维护问题在新任务里显现。"
            : "先前保留的长期记录，帮助这次任务更快定位问题。",
          raw: `当前相关任务表现 ${round(taskQuality())}；上轮原始表现 ${round(Number(p.quality))}。`,
          evaluation: p.metric
            ? "漂亮的考核记录仍有信息，但没有代替新情境中的真实证据。"
            : "这一次，考核与真实需求有较好的一致性。",
          impacts: ["长期结果回写到可追溯的事件链"],
          links,
        });
      } else if (item.kind === "internship-feedback") {
        addWork("现场实践与改进记录", Number(p.quality));
        emit("internship-feedback", {
          summary:
            "现场任务结束，人物保留了自己实际做过的部分，也知道哪些环节仍需要指导。",
          raw: `本次实践表现 ${round(Number(p.quality))}，并形成一份有来源的作品。`,
          evaluation: "实习名目与实际贡献分别保存，不能用单位名称代替贡献。",
          impacts: ["实践作品进入档案"],
          links,
        });
      } else if (item.kind === "alternative" && !state.job) {
        const domain = p.domain as Domain;
        const quality = taskQuality(domain, "alternative-task");
        const open = rand("alternative-channel") < 0.32 + env.opportunity * 0.4;
        const event = emit("alternative", {
          summary: open
            ? "同伴介绍的小团队愿意先看作品。之前被门槛挡住的记录，终于进入了讨论。"
            : "替代渠道也有等待与竞争，这次看见了作品，暂时没有空缺。",
          raw: `原渠道记录 ${round(Number(p.quality))}，当前相关任务 ${round(quality)}；变化来自中间两个月的实际积累。`,
          evaluation: "此渠道不使用性别与学校标签门槛，仍要求完成真实任务。",
          impacts: [open ? "获得另一项实际考察" : "保留联系与后续机会"],
          links,
        });
        if (open && quality > 31 + rand("alternative-threshold") * 12)
          acceptJob(domain, quality, event.id);
      } else if (item.kind === "obedience-feedback") {
        emit("obedience-feedback", {
          summary:
            p.choice === "accept"
              ? "接受任务之后仍需靠已有知识与练习完成；口头答应本身没有变成交付能力。"
              : "保留边界付出了一个入口的机会成本，其他渠道继续运行。",
          raw: `相关作品的原始质量 ${round(Number(p.quality))}，未因接受或拒绝而改写。`,
          evaluation:
            env.dissentSupport > 0.6
              ? "另一位主管认可明确范围的沟通。"
              : "原渠道仍将配合程度放在前面，但其评价没有覆盖其他机会。",
          impacts: ["后续机会继续读取真实作品与新实践"],
          links,
        });
      } else if (item.kind === "mismatch") {
        const mismatch = Number(p.mismatch);
        if (state.job?.organization === p.organization)
          state.dynamic.satisfaction -= mismatch * 8;
        const event = emit("mismatch", {
          summary:
            mismatch > 0.5
              ? `${p.organization}招聘时强调大型设计，入职后${p.role}的多数时间却在重复维护与修改表格。`
              : `${p.organization}的面试任务与实际职责较一致，人物得以继续使用相关实践。`,
          raw: `选拔与任务错配 ${Math.round(mismatch * 100)}%；实际工作仍产生相应熟练度。`,
          evaluation:
            mismatch > 0.5
              ? "招聘文案：“技术探索”；本月主要工作：“重复维护”。"
              : "相关考察提供了有效信息，入职期待和日常较一致。",
          impacts: ["期待落差影响兴趣、满意度和后续探索效用"],
          links,
        });
        defer("mismatch-feedback", 6, event.id, { mismatch });
      } else if (item.kind === "mismatch-feedback") {
        emit("mismatch-feedback", {
          summary:
            Number(p.mismatch) > 0.5
              ? "人物开始在业余保留新的实践，同时权衡收入与退出成本。适应、转向和继续寻找都仍有可能。"
              : "一致的任务使既有学习得到验证，人物仍可以在以后改变方向。",
          raw: `满意度 ${round(state.dynamic.satisfaction)}，当前策略“${state.lastAction}”。`,
          evaluation:
            "工作标签不决定整个人生；具体职责与自主空间持续产生影响。",
          impacts: ["后续月度决策读取真实期待落差"],
          links,
        });
      } else if (item.kind === "collaborate") {
        const quality = taskQuality();
        const event = emit("collaborate", {
          summary:
            "几位同事共同完成一项任务。人物需要说明自己的假设，也借助同伴的知识补上盲点。",
          raw: `已有知识 ${round(state.development.knowledge[state.focus])}，合作任务表现 ${round(quality)}。`,
          evaluation:
            env.dissentSupport > 0.5
              ? "主管愿意澄清分工，异议可以进入检查。"
              : "团队更强调按时配合，部分疑问被留到交付后。",
          impacts: ["形成合作证据与分工记录"],
          links,
        });
        defer("collaborate-feedback", 4, event.id, { quality });
      } else if (item.kind === "collaborate-feedback") {
        addWork("协作项目与贡献记录", Number(p.quality));
        emit("collaborate-feedback", {
          summary:
            "交付后整理了可复用的部分和实际贡献。态度评价与任务结果被放在两栏，没有混成一个好坏标签。",
          raw: `任务表现 ${round(Number(p.quality))}，相关作品已保存。`,
          evaluation:
            env.metricPressure > 0.7
              ? "考核更关注可见数量，部分协作成本没有被计入。"
              : "团队同时查看交付、过程与协作者反馈。",
          impacts: ["新增作品与贡献"],
          links,
        });
      } else if (item.kind === "promotion") {
        const quality = taskQuality();
        const merit =
          quality * (1 - env.metricPressure * 0.5) +
          (state.dynamic.voice * env.dissentSupport + 35 * env.metricPressure) *
            0.32;
        const sameOrganization =
          !p.organization || state.job?.organization === p.organization;
        const tenureEligible =
          state.job !== null && month - state.job.startedMonth >= 24;
        const promoted = sameOrganization && tenureEligible && merit > 37;
        if (promoted && state.job) {
          state.job.level++;
          state.job.salary = Math.round(state.job.salary * 1.14);
        }
        const event = emit("promotion", {
          summary:
            !sameOrganization || !tenureEligible
              ? "原先约定的考核期到来时，人物已经离开或改变了职责。原组织的考核不会在新岗位直接兑现。"
              : promoted
                ? "这次考核获得了职责和待遇上的增长。人物仍需面对新职责带来的真实负担。"
                : "这次没有晋升。实际贡献、可见指标和组织偏好并不总是重合，现有积累仍然保留。",
          raw: `实际任务表现 ${round(quality)}，累计贡献记录 ${round(state.development.contributions)}。`,
          evaluation:
            env.metricPressure > 0.7
              ? "考核优先读取短期数量与配合程度。"
              : "组织主要查看交付与协作证据，并给出具体反馈。",
          impacts: [
            promoted
              ? "职责增加，月收入提高"
              : "待遇暂时不变，后续仍有学习与转向",
          ],
          links,
        });
        defer("promotion-feedback", 6, event.id, { promoted });
      } else if (item.kind === "promotion-feedback") {
        emit("promotion-feedback", {
          summary: p.promoted
            ? "新职责开始变成日常：更多协调，也需要继续补足具体知识。"
            : "人物继续保留作品和建议记录，这次评价没有清空过去做过的事。",
          raw: `当前策略“${state.lastAction}”，工作实践累计 ${state.development.workMonths} 个月。`,
          evaluation: "晋升是机会与组织规则共同作用的局部结果。",
          impacts: ["继续积累实际职责与贡献"],
          links,
        });
      } else if (item.kind === "reskill-feedback") {
        const domain = p.domain as Domain;
        // 半年内已经逐月从原方向转移练习时间，这里只记录反馈，不补发经验。
        if (p.learned)
          state.dynamic.interests[domain] = clamp(
            state.dynamic.interests[domain] + 8,
          );
        const canSwitch =
          p.learned &&
          state.job &&
          state.job.mismatch > 0.45 &&
          state.development.practice[domain] > 20 &&
          rand("switch-opening") < env.opportunity;
        if (canSwitch)
          acceptJob(domain, taskQuality(domain, "switch-task"), item.parentId);
        emit("reskill-feedback", {
          summary: canSwitch
            ? "新练习与既有经验在一个开放入口相遇，人物转入了新的职责。"
            : p.learned
              ? "新方向留下了真实练习记录，尚不足以保证立即转行；继续积累仍有价值。"
              : "深化原方向带来了更熟悉的处理方式，新领域仍留在以后可能的选项里。",
          raw: `${DOMAIN_NAMES[domain]}的实践 ${round(state.development.practice[domain])}；半年中总投入时间没有增加。`,
          evaluation: "多面发展受时间约束，不设置固定天赋总点数。",
          impacts: ["新旧方向的实际记录均保留"],
          links,
        });
      } else if (item.kind === "mentor-feedback") {
        state.dynamic.connection += p.supported ? 5 : 2;
        emit("mentor-feedback", {
          summary: p.supported
            ? "后来的合作者把笔记用进了真实项目，也补上了新的视角。经验通过支持继续生长。"
            : "这些笔记没有换来考核奖励，但一次小范围合作仍然让双方受益。",
          raw: `关键关系 ${state.development.relations.length} 段，累计贡献 ${round(state.development.contributions)}。`,
          evaluation: "传承、关系与生活质量分别进入总结，不折算成知名度。",
          impacts: ["关系与可复用经验增加"],
          links,
        });
      }
    }
    if (state.job?.kind === "independent" && !state.chains.collaboration) {
      const event = emit("collaborate", {
        summary:
          "独立合作也需要和具体的人协作。人物与社区伙伴明确了范围、报酬和交付证据。",
        raw: `实际任务表现 ${round(taskQuality())}。`,
        evaluation: "自主不代表没有约束，沟通与实际工作都需要时间。",
        impacts: ["形成一条合作反馈链"],
      });
      defer("collaborate-feedback", 4, event.id, { quality: taskQuality() });
      if (!state.chains.mismatch)
        defer("mismatch", 3, event.id, {
          mismatch: 0.1,
          organization: "社区合作",
          role: "独立合作者",
        });
      if (!state.chains.promotion) defer("promotion", 24, event.id);
    }
    state.stage = stageOf(state);
    for (const key of [
      "energy",
      "stress",
      "autonomy",
      "satisfaction",
      "trust",
      "voice",
      "connection",
    ] as const)
      state.dynamic[key] = round(clamp(state.dynamic[key]));
    if (month === TOTAL_MONTHS)
      emit("conclusion", {
        summary: `${person.name}的人生没有在此结束。这只是本次观察暂时停下来的地方，过去的作品、选择与关系都留在档案中。`,
        raw: `累计学习 ${state.development.studyHours} 小时，自主实践 ${state.development.practiceHours} 小时，工作实践 ${state.development.workMonths} 个月。`,
        evaluation: "不使用财富、学历或八维总分宣布成功或失败。",
        impacts: ["可回放任意月份、导出档案或创建环境分支"],
      });
    snapshots.push(clone(state));
  }
  return { events, snapshots };
}

function summarize(
  person: Character,
  state: LifeState,
  events: LifeEvent[],
): LifeSummary {
  const strongest = [...DOMAINS].sort(
    (a, b) => state.development.practice[b] - state.development.practice[a],
  )[0];
  const turns = events.filter((event) => event.important).length;
  return {
    title: "一段人生，许多种收获",
    paragraphs: [
      `从十五岁到六十岁，${person.name}走过了${PATH_NAMES[state.education.path]}、${state.development.workMonths} 个月的工作实践与 ${turns} 个重要节点。最持续的积累在${DOMAIN_NAMES[strongest]}，并不意味着其他方向从此关闭。`,
      `留下 ${state.development.works.length} 份作品、${state.development.credentials.length} 段学习记录和 ${state.development.relations.length} 段关键关系。当前${state.job ? `在${state.job.organization}承担${state.job.role}职责` : "仍在寻找下一段合适的机会"}。`,
    ],
    gained: [
      `${state.development.studyHours.toLocaleString()} 小时学习`,
      `${state.development.works.length} 份有来源的作品`,
      `${state.development.relations.length} 段关键关系`,
    ],
    forgone: [
      events
        .find((event) => event.choices.length > 1)
        ?.choices.find(
          (choice) =>
            choice.id === events.find((e) => e.choices.length > 1)?.selected,
        )?.cost ?? "每一种时间安排都意味着暂缓另一种可能",
      state.blockedCount > 0
        ? `${state.blockedCount} 次机会在预筛选中关闭`
        : "有限的时间让部分方向停留在兴趣阶段",
    ],
    possible: [
      "把已有经验迁移到新任务",
      "继续学习、协作与普通生活",
      "换一个环境，回看哪些条件改变了选择",
    ],
  };
}
export function generateLife(config: PersonConfig): LifeRun {
  const person = createCharacter(config);
  const result = simulate(
    person,
    config.environment,
    initialState(person),
    [],
    [],
  );
  return {
    id: `life-${hash(JSON.stringify(config)).toString(36)}`,
    name: `${person.name}的人生`,
    version: RULE_VERSION,
    createdAt: new Date().toISOString(),
    character: person,
    initialEnvironment: clone(config.environment),
    environment: clone(config.environment),
    environmentHistory: [
      { fromMonth: 0, environment: clone(config.environment) },
    ],
    ...result,
    summary: summarize(person, result.snapshots[TOTAL_MONTHS], result.events),
    favorite: false,
  };
}
export function branchLife(
  parent: LifeRun,
  month: number,
  environment: Environment,
): LifeRun {
  if (parent.version !== RULE_VERSION)
    throw new Error("规则版本不同，无法创建可比较的分支。");
  if (!Number.isInteger(month) || month < 0 || month >= TOTAL_MONTHS)
    throw new Error("请选择十五岁至观察截止点之前的月份。");
  const result = simulate(
    parent.character,
    environment,
    parent.snapshots[month],
    parent.events.filter((event) => event.month <= month),
    parent.snapshots.slice(0, month + 1),
  );
  return {
    ...clone({ ...parent, snapshots: [], events: [] }),
    id: `branch-${hash(`${parent.id}|${month}|${JSON.stringify(environment)}`).toString(36)}`,
    name: `${parent.character.name} · ${environment.name}`,
    environment: clone(environment),
    environmentHistory: [
      ...parent.environmentHistory.filter((item) => item.fromMonth <= month),
      { fromMonth: month + 1, environment: clone(environment) },
    ],
    createdAt: new Date().toISOString(),
    ...result,
    summary: summarize(
      parent.character,
      result.snapshots[TOTAL_MONTHS],
      result.events,
    ),
    branch: { parentId: parent.id, month, environment: environment.id },
    favorite: false,
  };
}
export function findDivergence(first: LifeRun, second: LifeRun): number | null {
  for (let month = 0; month <= TOTAL_MONTHS; month++) {
    const a = first.snapshots[month],
      b = second.snapshots[month];
    if (
      a.lastAction !== b.lastAction ||
      a.education.path !== b.education.path ||
      a.job?.role !== b.job?.role ||
      Math.abs(
        a.development.practice[a.focus] - b.development.practice[b.focus],
      ) > 0.5 ||
      Math.abs(a.dynamic.money - b.dynamic.money) > 300
    )
      return month;
  }
  return null;
}
