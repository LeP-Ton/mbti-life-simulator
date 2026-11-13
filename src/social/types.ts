import type { Domain, Scores } from "../simulation/types";

export type { Domain };
export type Id = string;
export type MoneyFen = number;
export type PersonalityModel = "jung8" | "big5" | "none";
export const BIG5 = ["O", "C", "E", "A", "N"] as const;
export type Big5Key = (typeof BIG5)[number];
export const NEEDS = [
  "material",
  "security",
  "mastery",
  "autonomy",
  "belonging",
  "fairness",
] as const;
export type Need = (typeof NEEDS)[number];
export const EMOTIONS = [
  "joy",
  "distress",
  "fear",
  "anger",
  "gratitude",
  "pride",
  "shame",
] as const;
export type Emotion = (typeof EMOTIONS)[number];
export type Vector6 = [number, number, number, number, number, number];
export type DomainVector = Record<Domain, number>;

export interface BetaBelief {
  alpha: number;
  beta: number;
  lastUpdatedTick: number;
  lastEvidenceSequence: number;
}
export interface Credential {
  id: Id;
  schoolId: Id;
  level: number;
  month: number;
}
export interface WorkEvidence {
  id: Id;
  domain: Domain;
  quality: number;
  month: number;
  contribution: number;
  externalCredit?: number;
  success?: boolean;
}
export interface EducationState {
  path:
    | "school"
    | "university"
    | "vocational"
    | "apprentice"
    | "completed"
    | "none";
  schoolId: Id | null;
  domain: Domain;
  level: number;
  startedMonth: number;
  credits: number;
  unpaidMonths: number;
  absenceMonths: number;
  attendance: number;
}
export interface EmploymentState {
  positionId: Id | null;
  startedMonth: number;
  searchMonths: number;
  lastGrossWage: MoneyFen;
  lastIncome: MoneyFen;
  wageArrears: MoneyFen;
  contributions: number;
  workHours: number;
  productiveHours: number;
  qualitySum: number;
  qualityCount: number;
  attemptedTasks: number;
  successfulTasks: number;
  leaveReason: string | null;
}
export type ActionKind =
  | "deliver"
  | "study"
  | "practice"
  | "search"
  | "connect"
  | "recover"
  | "public"
  | "private"
  | "verify"
  | "silent"
  | "enrol"
  | "move";
export interface Hours {
  course: number;
  work: number;
  study: number;
  practice: number;
  search: number;
  connection: number;
  rest: number;
  care: number;
}
export interface Commitment {
  id: Id;
  kind: "course" | "work" | "care" | "collaboration";
  hours: number;
  targetId: Id;
}
export interface Experience {
  eventId: Id;
  sequence: number;
  tick: number;
  context: string;
  counterpartId: Id;
  action: ActionKind;
  reward: number;
  expected: number;
  probability: number;
  probabilities: Partial<Record<ActionKind, number>>;
  features: Vector6;
}
export interface RevisionRecord {
  id: Id;
  month: number;
  layer: "habit" | "trait" | "institution";
  baseVersion: number;
  status: "accepted" | "rejected" | "deferred";
  reason: string;
  evidenceIds: Id[];
  before: number[];
  after: number[];
  counterEvidenceIds?: Id[];
  scope?: string;
}
export interface StructuredMemory {
  recent: Experience[];
  quarter: Experience[];
  annual: Experience[];
  revisions: RevisionRecord[];
  lastAction: ActionKind;
  lastHours: Hours;
  totalStudyHours: number;
  totalPracticeHours: number;
  totalWorkHours: number;
  totalWorks: number;
  observedOpportunities: number;
  publicReports: number;
  privateReports: number;
  silentReports: number;
  validReports: number;
  invalidReports: number;
}
export interface Person {
  id: Id;
  name: string;
  birthMonth: number;
  alive: boolean;
  diedMonth: number | null;
  householdId: Id;
  regionId: Id;
  gender: string;
  guardianIds: Id[];
  profiles: {
    initialJung8: Scores;
    initialBig5: Record<Big5Key, number>;
    effectiveJung8: Scores;
    effectiveBig5: Record<Big5Key, number>;
    version: number;
  };
  motives: Record<Need, number>;
  values: { honesty: number; fairness: number; boundaries: number };
  development: {
    knowledge: DomainVector;
    practice: DomainVector;
    examPractice: number;
    credentials: Credential[];
    works: WorkEvidence[];
  };
  state: {
    health: number;
    energy: number;
    stress: number;
    emotions: Record<Emotion, number>;
    wellbeing: Record<Need, number>;
  };
  education: EducationState;
  employment: EmploymentState;
  cashAccountId: Id;
  interests: DomainVector;
  beliefs: Record<string, BetaBelief>;
  otherAgentModels: Record<Id, [number, number, number]>;
  habits: Record<string, number>;
  commitments: Commitment[];
  memory: StructuredMemory;
  knownVacancies: Record<Id, number>;
  careHours: number;
  monthlyHours: Hours;
  personalNorm: number;
}
export interface Household {
  id: Id;
  regionId: Id;
  memberIds: Id[];
  accountId: Id;
  contributionRate: number;
  careDemand: number;
  basicNeed: MoneyFen;
  lastConsumption: MoneyFen;
  shortfall: MoneyFen;
  resourceIndex: number;
  parentalEducation: number;
}
export interface School {
  id: Id;
  name: string;
  regionId: Id;
  path: "university" | "vocational" | "apprentice";
  annualSeats: number;
  usedSeats: number;
  durationMonths: number;
  annualFee: MoneyFen;
  courseWeights: DomainVector;
  quality: number;
  accountId: Id;
  cutoff: number;
}
export interface FirmPolicy {
  punitive: number;
  metricWeight: number;
  evidenceResponse: number;
  credentialWeight: number;
  genderBias: number;
  ageBias: number;
}
export interface Firm {
  id: Id;
  name: string;
  regionId: Id;
  domain: Domain;
  accountId: Id;
  positionIds: Id[];
  capacity: number;
  orders: number;
  reputation: number;
  backlog: number;
  priceIndex: number;
  policy: FirmPolicy;
  owners: { householdId: Id; share: number }[];
  status: "active" | "closed";
  arrearsMonths: number;
  lastProfit: MoneyFen;
  annualProfit: MoneyFen;
  lastRevenue: MoneyFen;
  wagesDue: MoneyFen;
  wagesPaid: MoneyFen;
  lastOutput: number;
  turnover: number;
  administrationHours: number;
  correctionCost: number;
  maintenanceTasks: {
    id: Id;
    remaining: number;
    total: number;
    realDefect: boolean;
    causeId: Id;
    reporterId?: Id;
  }[];
  unpaidWorkHours: number;
  reinforcement: { action: number; probability: number; eventId: Id }[];
  revisions: RevisionRecord[];
  rewardBaseline: number;
  version: number;
  policyLocked: boolean;
}
export interface Position {
  id: Id;
  firmId: Id;
  domain: Domain;
  requirements: DomainVector;
  grade: 0 | 1 | 2;
  wage: MoneyFen;
  requiredHours: number;
  holderId: Id | null;
  enabled: boolean;
}
export interface RelationEdge {
  id: Id;
  a: Id;
  b: Id;
  family: boolean;
  strength: number;
  lastContactTick: number;
  willingness: Record<Id, BetaBelief>;
  reliability: Record<Id, BetaBelief>;
}
export interface Account {
  id: Id;
  ownerId: Id;
  kind: "person" | "household" | "firm" | "school" | "government";
  balance: MoneyFen;
}
export interface FinancialClaim {
  id: Id;
  debtorAccountId: Id;
  creditorAccountId: Id;
  category: "wage" | "tax" | "tuition" | "supplier";
  amount: MoneyFen;
  originMonth: number;
  eventId: Id;
}
export interface LedgerEntry {
  id: Id;
  month: number;
  from: Id | "external";
  to: Id | "external";
  amount: MoneyFen;
  category: string;
  causeId: Id;
}
export interface GovernmentState {
  accountId: Id;
  wageTax: number;
  profitTax: number;
  lastRequested: MoneyFen;
  lastPaid: MoneyFen;
}
export interface ExternalSectorState {
  inflow: MoneyFen;
  outflow: MoneyFen;
  openingCash: MoneyFen;
  demandIndex: number;
  priceIndex: number;
  segmentMultipliers: Record<string, number>;
}
export interface MacroInput {
  month: number;
  demandIndex?: number;
  priceIndex?: number;
  segmentMultipliers?: Record<string, number>;
  governmentGrant?: MoneyFen;
}
export interface ExogenousInput {
  month: number;
  kind: "death" | "health" | "birth" | "migration";
  targetId: Id;
  severity?: number;
  regionId?: Id;
}
export interface ScheduledEvent {
  id: Id;
  dueMonth: number;
  kind: "job" | "school" | "leave" | "repair" | "birth" | "migration";
  personId?: Id;
  targetId?: Id;
  causeId: Id;
  payload: Record<string, number | string | boolean>;
}
export interface Issue {
  id: Id;
  firmId: Id;
  personId: Id;
  createdTick: number;
  expiresTick: number;
  realDefect: boolean;
  confidence: number;
  noticed: boolean;
  resolved: boolean;
}
export interface Observation {
  tick: number;
  month: number;
  seed: string;
  personId: Id;
  personalityModel: PersonalityModel;
  context: string;
  availableHours: number;
  careHours: number;
  requiredWork: number;
  requiredCourse: number;
  ownCash: MoneyFen;
  householdCash: MoneyFen;
  basicCost: MoneyFen;
  cashShortfall: number;
  domain: Domain;
  support: number;
  wage: MoneyFen;
  currentFirmId: Id | null;
  taxRate: number;
  knownPositions: {
    id: Id;
    firmId: Id;
    wage: MoneyFen;
    grade: number;
    domain: Domain;
    requirements: DomainVector;
  }[];
  schools: {
    id: Id;
    fee: MoneyFen;
    annualFee: MoneyFen;
    duration: number;
    quality: number;
    path: School["path"];
    domain: Domain;
  }[];
  currentCourse: Observation["schools"][number] | null;
  contacts: { id: Id; trust: number; strength: number }[];
  issue: { id: Id; confidence: number; firmId: Id } | null;
  punishmentBeliefs: { public: number; private: number };
  norm: number;
  contextFeatures: Vector6;
  canMove: boolean;
}
export interface ActionPlan {
  id: ActionKind;
  hours: Hours;
  features: Vector6;
  outcomes: Vector6;
  domain: Domain;
  targetId: Id | null;
  estimatedCost: MoneyFen;
}
export interface Decision {
  personId: Id;
  tick: number;
  context: string;
  selected: ActionPlan;
  candidates: { plan: ActionPlan; value: number; probability: number }[];
  probability: number;
  expectedReward: number;
}
export interface WorldEvent {
  id: Id;
  sequence: number;
  month: number;
  substep: number;
  kind: string;
  title: string;
  actorIds: Id[];
  causeIds: Id[];
  truth: Record<string, number | string | boolean>;
  observations: Record<Id, Record<string, number | string | boolean>>;
  hours: number;
  money: MoneyFen;
  ruleId: string;
}
export interface Metrics {
  month: number;
  population: number;
  alive: number;
  employed: number;
  eligibleWorkers: number;
  employmentRate: number;
  meanCash: number;
  medianCash: number;
  incomeP10: number;
  incomeP50: number;
  incomeP90: number;
  meanStress: number;
  meanEnergy: number;
  meanWellbeing: number;
  publicReports: number;
  privateReports: number;
  silentReports: number;
  validReports: number;
  invalidReports: number;
  observedOpportunities: number;
  defects: number;
  openOpportunities: number;
  openDefects: number;
  fixedDefects: number;
  taskAttempts: number;
  taskSuccesses: number;
  reworkHours: number;
  punishmentSquaredError: number;
  beliefSamples: number;
  separations: number;
  hires: number;
  consumptionGap: MoneyFen;
  activeFirms: number;
  totalProfit: MoneyFen;
  totalCash: MoneyFen;
  externalNet: MoneyFen;
  accountingError: number;
}
export interface SeedBundle {
  population: string;
  profiles: string;
  shocks: string;
  actions: string;
  feedback: string;
}
export interface Parameters {
  personalityStrength: number;
  temperature: number;
  discount: number;
  riskAversion: number;
  beliefHalfLifeMonths: number;
  beliefLearning: boolean;
  habitLearning: boolean;
  institutionLearning: boolean;
  plasticity: boolean;
  habitRate: number;
  institutionRate: number;
  emotionHalfLifeDays: number;
  emotionImpulse: number;
  knowledgeRate: number;
  practiceRate: number;
  knowledgeDecay: number;
  practiceDecay: number;
  publicInformation: number;
  totalDemand: number;
  unitRevenue: MoneyFen;
  materialsRate: number;
  operatingCost: MoneyFen;
  assessmentAccuracy: number;
  issueRate: number;
  birthAnnualRisk: number;
  healthAnnualRisk: number;
  migrationAnnualRate: number;
  wageTax: number;
  profitTax: number;
  housingCost: MoneyFen;
  mortalityAnnual: [number, number, number, number, number, number];
}
export interface ParameterEvidence {
  key: string;
  value: number | boolean | number[];
  unit: string;
  range: string;
  source: string;
  population: string;
  status: "hypothesis" | "estimated";
  version: string;
}
export interface ParameterBundle {
  id: string;
  calibrated: false;
  parameters: Parameters;
  evidence: ParameterEvidence[];
}
export interface ScenarioConfig {
  seed: string;
  population: number;
  model: PersonalityModel;
  parameters: Parameters;
  trackedIds: Id[];
  focalName: string;
  months: number;
  focal?: {
    jung8: Scores;
    gender: string;
    familyResources: number;
    region: string;
    profileOnly?: boolean;
  };
  macroSeries?: MacroInput[];
  exogenousEvents?: ExogenousInput[];
}
export interface Intervention {
  id: string;
  fromMonth: number;
  punitive?: number;
  firmIds?: Id[];
  lockPolicy?: boolean;
  parameters?: Partial<Parameters>;
}
export interface InterventionRecord extends Intervention {
  createdAtMonth: number;
}
export interface World {
  schemaVersion: 2;
  ruleVersion: string;
  month: number;
  substep: 0 | 1 | 2 | 3;
  scenarioId: string;
  parameterBundleId: string;
  personalityModel: PersonalityModel;
  seeds: SeedBundle;
  parameters: Parameters;
  focalPersonId: Id;
  persons: Record<Id, Person>;
  households: Record<Id, Household>;
  schools: Record<Id, School>;
  firms: Record<Id, Firm>;
  positions: Record<Id, Position>;
  relations: Record<Id, RelationEdge>;
  accounts: Record<Id, Account>;
  claims: Record<Id, FinancialClaim>;
  government: GovernmentState;
  externalSector: ExternalSectorState;
  scenarioInputs: {
    macroSeries: MacroInput[];
    exogenousEvents: ExogenousInput[];
  };
  openingAccounts: { accountId: Id; amount: MoneyFen; source: string }[];
  pendingEvents: ScheduledEvent[];
  issues: Record<Id, Issue>;
  interventionHistory: InterventionRecord[];
  eventSequence: number;
  ledgerSequence: number;
  personSequence: number;
  counters: Omit<
    Metrics,
    | "month"
    | "population"
    | "alive"
    | "employed"
    | "eligibleWorkers"
    | "employmentRate"
    | "meanCash"
    | "medianCash"
    | "incomeP10"
    | "incomeP50"
    | "incomeP90"
    | "meanStress"
    | "meanEnergy"
    | "meanWellbeing"
    | "activeFirms"
    | "totalProfit"
    | "totalCash"
    | "externalNet"
    | "accountingError"
    | "consumptionGap"
    | "openOpportunities"
    | "openDefects"
  >;
}
export interface StepResult {
  month: number;
  events: WorldEvent[];
  ledger: LedgerEntry[];
  metrics: Metrics;
  decisions: Decision[];
}
export interface WorldCheckpoint {
  schemaVersion: 2;
  month: number;
  world: World;
}
export interface PersonFrame {
  month: number;
  person: Person;
  cash: MoneyFen;
  householdCash: MoneyFen;
  firmName: string | null;
  jobGrade: number | null;
  debt: MoneyFen;
}
export interface WorldRun {
  id: Id;
  name: string;
  config: ScenarioConfig;
  schemaVersion: 2;
  ruleVersion: string;
  calibrated: false;
  metrics: Metrics[];
  frames: Record<Id, PersonFrame[]>;
  events: WorldEvent[];
  ledger: LedgerEntry[];
  checkpointMonths: number[];
  finalWorld: World;
  parent?: { runId: Id; month: number; intervention: Intervention };
}
export interface LifeView {
  personId: Id;
  frame: PersonFrame | null;
  events: WorldEvent[];
  months: number[];
}
export interface ExperimentSpec {
  seed: string;
  population: number;
  seeds: number;
  warmupMonths: number;
  followupMonths: number;
  parameters?: Partial<Parameters>;
  models?: PersonalityModel[];
  replicateStart?: number;
}
export interface ExperimentCell {
  model: PersonalityModel;
  punitive: number;
  learning: boolean;
  replicate: number;
  seed: string;
  year1: Metrics;
  year5: Metrics;
}
export interface ExperimentReport {
  format: "social-experiment/2";
  ruleVersion: string;
  kernelSha256?: string;
  calibrated: false;
  label: string;
  spec: ExperimentSpec;
  parameterBundle: ParameterBundle;
  cells: ExperimentCell[];
  effects: {
    horizon: "year1" | "endpoint";
    model: PersonalityModel;
    learning: boolean;
    metric: string;
    mean: number;
    standardError: number | null;
    interval95: [number, number] | null;
    n: number;
  }[];
  uncertainty: string[];
}
