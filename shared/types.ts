export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type Action = "left" | "right" | "cw" | "ccw" | "down" | "drop";
export type Board = number[][];
export type Piece = { type: PieceType; rotation: number; x: number; y: number };
export type Metrics = {
  maxHeight: number;
  aggregateHeight: number;
  holes: number;
  bumpiness: number;
};
export type Candidate = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  actions: Action[];
  after: Metrics & { clearedLines: number; topOut: boolean };
  heuristicScore: number;
};
export type Game = {
  sessionId: string;
  stateVersion: number;
  pieceId: string;
  board: Board;
  currentPiece: Piece;
  nextPiece: PieceType;
  bag: PieceType[];
  rng: number;
  score: number;
  clearedLines: number;
  pieces: number;
  over: boolean;
};
export type GameDecisionState = Pick<
  Game,
  | "sessionId"
  | "stateVersion"
  | "pieceId"
  | "board"
  | "currentPiece"
  | "nextPiece"
> & {
  metrics: Metrics & { score: number; clearedLines: number };
  candidates: Candidate[];
};
export type Protocol = "openrouter-decisions" | "typesafe-systemone" | "mock";
export type ProviderInput = {
  name: string;
  protocol: Protocol;
  endpoint: string;
  modelId: string;
  timeoutMs: number;
  retries: number;
  notes: string;
  enabled: boolean;
  apiKey?: string;
  clearKey?: boolean;
};
export type TestResult = {
  receipt?: string;
  success: boolean;
  protocol: Protocol;
  modelId: string;
  status: number | null;
  latencyMs: number;
  time: string;
  formatValid: boolean;
  summary: string;
};
export type Provider = Omit<ProviderInput, "apiKey" | "clearKey"> & {
  id: string;
  version: number;
  hasKey: boolean;
  keyMask: string;
  active: boolean;
  lastTest: TestResult | null;
};
export type DecisionResult = {
  candidateId: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  boardRisk?: number;
  boardQuality?: number;
  source: "Jev / 真实模型" | "Mock 模拟" | "本地启发式";
  raw: unknown;
  latencyMs: number;
  status?: number;
  attempts?: number;
};
export type Identity = {
  requestId: string;
  sessionId: string;
  pieceId: string;
  stateVersion: number;
  configVersion: number;
};
export type DecisionRecord = {
  providerId?:string;
  configVersion?:number;
  id: string;
  time: string;
  state: GameDecisionState;
  questions: unknown;
  provider: string;
  model: string;
  protocol: string;
  result?: DecisionResult;
  error?: string;
  errorResponse?: unknown;
  fallback: boolean;
  executed?: { candidateId: string; actions: Action[]; clearedLines: number };
  total: number;
  elapsed: number;
};
export type Settings = {
  seed: number;
  minIntervalMs: number;
  callLimit: number;
  candidateLimit: number;
  fallback: boolean;
  failureLimit: number;
  mockDelayMs: number;
  mockFault: "none" | "error" | "timeout";
};
