import type { EventCategory } from "./types";

export const CHAINS = [
  {
    id: "exploration",
    name: "创新与标准答案",
    description: "兴趣探索占用复习时间，也可能帮助理解；作品与分数分别反馈。",
  },
  {
    id: "dissent",
    name: "问题还是态度",
    description: "指出矛盾后的实际修正与态度评价，影响下一次表达意愿。",
  },
  {
    id: "resources",
    name: "看得见的资源差异",
    description: "训练名额、工具与同伴支持，转化为真实接触和后续作品。",
  },
  {
    id: "family",
    name: "期待与自己的路",
    description: "家庭期待与生活成本共同参与升学选择，后续再检验适应。",
  },
  {
    id: "metrics",
    name: "漂亮指标的背面",
    description: "短期指标和真实学习、维护成本可能不同，延迟观察后果。",
  },
  {
    id: "labels",
    name: "作品被看见之前",
    description: "学历、性别、年龄筛选先行；替代渠道重新查看同一份作品。",
  },
  {
    id: "mismatch",
    name: "造火箭与拧螺丝",
    description: "面试与日常任务是否一致，改变满意度与后续寻找机会的意愿。",
  },
  {
    id: "obedience",
    name: "诚意的价码",
    description: "临时改期与无偿方案被包装成诚意，人物根据边界和资源选择。",
  },
  {
    id: "collaboration",
    name: "一个人的作品，一群人的事",
    description: "合作不是态度标签，知识、沟通投入与支持共同决定交付。",
  },
  {
    id: "promotion",
    name: "贡献与晋升",
    description: "可见指标与实际贡献进入不同权重的考核，反馈下一次策略。",
  },
  {
    id: "reskill",
    name: "转弯之后",
    description: "继续学习需要真实时间，转向与再就业读取新积累的实践。",
  },
  {
    id: "mentorship",
    name: "把经验留给后来的人",
    description: "支持、传承和普通生活都有后果，不把知名度当作统一终点。",
  },
] as const;

export interface EventTemplate {
  id: string;
  title: string;
  category: EventCategory;
  important?: boolean;
  chainId?: string;
}
export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "begin",
    title: "十五岁，故事从这里开始",
    category: "life",
    important: true,
  },
  { id: "semester", title: "一张阶段成绩单", category: "learning" },
  {
    id: "daily-school",
    title: "那些没有登上成绩单的日子",
    category: "learning",
  },
  { id: "daily-work", title: "普通的一年，也有积累", category: "career" },
  {
    id: "explore",
    title: "标准答案之外，多问了一个为什么",
    category: "learning",
    important: true,
    chainId: "exploration",
  },
  {
    id: "explore-feedback",
    title: "校刊说“鼓励创新”，成绩单另有一栏",
    category: "learning",
    chainId: "exploration",
  },
  {
    id: "dissent",
    title: "这个问题，算不算态度问题",
    category: "turning",
    important: true,
    chainId: "dissent",
  },
  {
    id: "dissent-feedback",
    title: "下一次举手之前",
    category: "life",
    chainId: "dissent",
  },
  {
    id: "resource",
    title: "一份共享的工具包",
    category: "learning",
    chainId: "resources",
  },
  {
    id: "resource-feedback",
    title: "获得工具之后，仍然需要练习",
    category: "learning",
    chainId: "resources",
  },
  {
    id: "family",
    title: "饭桌上的未来",
    category: "life",
    important: true,
    chainId: "family",
  },
  {
    id: "family-feedback",
    title: "选择没有消除所有顾虑",
    category: "life",
    chainId: "family",
  },
  {
    id: "metric",
    title: "表格里的进步，比实际更快",
    category: "turning",
    important: true,
    chainId: "metrics",
  },
  {
    id: "metric-feedback",
    title: "被推迟的成本，回来敲门了",
    category: "career",
    chainId: "metrics",
  },
  {
    id: "pathway",
    title: "路口没有标准选项",
    category: "turning",
    important: true,
  },
  { id: "course", title: "第一次把概念用在具体问题上", category: "learning" },
  { id: "project", title: "作品集多了一页", category: "learning" },
  {
    id: "internship",
    title: "从课堂到现场",
    category: "career",
    important: true,
  },
  {
    id: "internship-feedback",
    title: "实习评价和亲手做过的事",
    category: "career",
  },
  {
    id: "graduate",
    title: "带着积累，走出校门",
    category: "turning",
    important: true,
  },
  {
    id: "further-study",
    title: "再留一段时间，把问题弄清楚",
    category: "learning",
    important: true,
  },
  {
    id: "label-gate",
    title: "作品还没打开，筛选已经结束",
    category: "career",
    important: true,
    chainId: "labels",
  },
  {
    id: "label-open",
    title: "这一回，先看做过什么",
    category: "career",
    important: true,
    chainId: "labels",
  },
  {
    id: "alternative",
    title: "换一个入口，作品终于被打开",
    category: "career",
    chainId: "labels",
  },
  {
    id: "obedience",
    title: "“如果有诚意，今晚就做一版”",
    category: "career",
    important: true,
    chainId: "obedience",
  },
  {
    id: "obedience-feedback",
    title: "愿意接受，与能够交付",
    category: "career",
    chainId: "obedience",
  },
  {
    id: "offer",
    title: "第一份，或下一份工作",
    category: "turning",
    important: true,
  },
  { id: "search", title: "还在寻找合适的入口", category: "career" },
  {
    id: "mismatch",
    title: "面试造火箭，日常拧螺丝？",
    category: "career",
    important: true,
    chainId: "mismatch",
  },
  {
    id: "mismatch-feedback",
    title: "招聘文案之后，是每一天",
    category: "life",
    chainId: "mismatch",
  },
  {
    id: "collaborate",
    title: "这一次，需要和别人一起完成",
    category: "career",
    chainId: "collaboration",
  },
  {
    id: "collaborate-feedback",
    title: "交付以后，谁的贡献被看见",
    category: "career",
    chainId: "collaboration",
  },
  {
    id: "promotion",
    title: "轮到这次考核了",
    category: "turning",
    important: true,
    chainId: "promotion",
  },
  {
    id: "promotion-feedback",
    title: "新头衔，和没有写进头衔的事",
    category: "career",
    chainId: "promotion",
  },
  {
    id: "reskill",
    title: "转弯需要时间，也需要余地",
    category: "turning",
    important: true,
    chainId: "reskill",
  },
  {
    id: "reskill-feedback",
    title: "新方向，不是重新抽一次运气",
    category: "career",
    chainId: "reskill",
  },
  {
    id: "layoff",
    title: "组织调整，不是一份能力判决",
    category: "turning",
    important: true,
  },
  {
    id: "independent",
    title: "试着为自己的作品负责",
    category: "career",
    important: true,
  },
  {
    id: "boundary",
    title: "把一部分时间，还给生活",
    category: "life",
    important: true,
  },
  {
    id: "mentor",
    title: "有人愿意把经验讲给后来的人",
    category: "life",
    important: true,
    chainId: "mentorship",
  },
  {
    id: "mentor-feedback",
    title: "经验的另一种去向",
    category: "life",
    chainId: "mentorship",
  },
  { id: "community", title: "认真过的普通日子", category: "life" },
  {
    id: "conclusion",
    title: "六十岁，先把这一页折起来",
    category: "turning",
    important: true,
  },
];
export const TEMPLATE_MAP = Object.fromEntries(
  EVENT_TEMPLATES.map((template) => [template.id, template]),
);
