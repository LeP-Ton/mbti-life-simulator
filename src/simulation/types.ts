export const FUNCTIONS = [
  "Ni",
  "Ne",
  "Si",
  "Se",
  "Ti",
  "Te",
  "Fi",
  "Fe",
] as const;
export type CognitiveFunction = (typeof FUNCTIONS)[number];
export type Scores = Record<CognitiveFunction, number>;
export type Mbti =
  | "ISTJ"
  | "ISFJ"
  | "INFJ"
  | "INTJ"
  | "ISTP"
  | "ISFP"
  | "INFP"
  | "INTP"
  | "ESTP"
  | "ESFP"
  | "ENFP"
  | "ENTP"
  | "ESTJ"
  | "ESFJ"
  | "ENFJ"
  | "ENTJ";
export const DOMAINS = [
  "technology",
  "design",
  "research",
  "service",
  "craft",
  "business",
] as const;
export type Domain = (typeof DOMAINS)[number];
export type DomainValues = Record<Domain, number>;
export type Stage = "school" | "preparation" | "entry" | "career" | "later";
export type EducationPath =
  "pending" | "university" | "vocational" | "apprentice" | "work" | "graduate";
export interface Environment {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  learningAccess: number;
  exploration: number;
  standardWeight: number;
  credentialBias: number;
  genderBias: number;
  ageBias: number;
  taskAlignment: number;
  dissentSupport: number;
  support: number;
  opportunity: number;
  metricPressure: number;
}
export interface PersonConfig {
  name: string;
  gender: "女" | "男" | "非二元";
  region: "青屿市" | "临溪镇" | "远岚县";
  familyResources: number;
  expectation: "支持探索" | "重视学历" | "尽早稳定";
  seed: string;
  scores: Scores;
  environment: Environment;
}
export interface Character extends Omit<PersonConfig, "environment"> {
  id: string;
  generationVersion: string;
  inference: TypeInference;
}
export interface TypeInference {
  type: Mbti | null;
  alternatives: { type: Mbti; similarity: number }[];
  distinction: number;
  close: boolean;
  tied: boolean;
  ranking: CognitiveFunction[];
  algorithmVersion: string;
}
export interface Choice {
  id: string;
  label: string;
  utility: number;
  reason: string;
  cost: string;
}
export interface Allocation {
  study: number;
  practice: number;
  work: number;
  connection: number;
  rest: number;
}
export interface Work {
  id: string;
  month: number;
  title: string;
  domain: Domain;
  quality: number;
  contribution: string;
}
export interface Exam {
  month: number;
  name: string;
  score: number;
  rank: number;
  contact: number;
  training: number;
}
export interface Credential {
  title: string;
  month: number;
  institution: string;
}
export interface Relation {
  name: string;
  role: string;
  since: number;
  trust: number;
  contribution: string;
}
export interface Development {
  knowledge: DomainValues;
  practice: DomainValues;
  examPractice: number;
  studyHours: number;
  practiceHours: number;
  workMonths: number;
  searchMonths: number;
  contributions: number;
  works: Work[];
  exams: Exam[];
  credentials: Credential[];
  relations: Relation[];
}
export interface DynamicState {
  energy: number;
  stress: number;
  autonomy: number;
  satisfaction: number;
  trust: number;
  voice: number;
  connection: number;
  money: number;
  interests: DomainValues;
}
export interface Education {
  path: EducationPath;
  institution: string;
  startedMonth: number;
  graduationMonth: number | null;
  prestige: number;
  graduated: boolean;
}
export interface Job {
  organization: string;
  role: string;
  domain: Domain;
  startedMonth: number;
  level: number;
  salary: number;
  mismatch: number;
  kind: "employed" | "independent";
}
export interface PendingEvent {
  due: number;
  kind: string;
  parentId: string;
  payload: Record<string, number | string | boolean>;
}
export interface LifeState {
  month: number;
  stage: Stage;
  education: Education;
  job: Job | null;
  development: Development;
  dynamic: DynamicState;
  allocation: Allocation;
  focus: Domain;
  lastAction: string;
  opportunityCount: number;
  blockedCount: number;
  queue: PendingEvent[];
  chains: Record<string, string>;
  employmentStart: number | null;
}
export type EventCategory = "learning" | "career" | "life" | "turning";
export interface LifeEvent {
  id: string;
  month: number;
  templateId: string;
  title: string;
  summary: string;
  category: EventCategory;
  important: boolean;
  conditions: string[];
  choices: Choice[];
  selected: string;
  raw: string;
  evaluation: string;
  impacts: string[];
  links: string[];
  chainId?: string;
  opportunity?: {
    source: string;
    requirement: string;
    deadline: number;
    outcome: string;
  };
}
export interface LifeSummary {
  title: string;
  paragraphs: string[];
  gained: string[];
  forgone: string[];
  possible: string[];
}
export interface LifeRun {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  character: Character;
  initialEnvironment: Environment;
  environment: Environment;
  environmentHistory: { fromMonth: number; environment: Environment }[];
  snapshots: LifeState[];
  events: LifeEvent[];
  summary: LifeSummary;
  branch?: { parentId: string; month: number; environment: string };
  favorite: boolean;
}
