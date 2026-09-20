import type { LabResult, Questions, RunIdentity } from "./contracts.js";
export type RunMode = "mock" | "local" | "real" | "manual";
export type RunStatus =
  | "running"
  | "paused"
  | "success"
  | "completed"
  | "failed"
  | "cancelled"
  | "exhausted";
export type VisibleCandidate = {
  questionId?: string;
  id: string;
  label: string;
  details: string;
  baseline?: boolean;
  probability?: number;
};
export type StepRecord = {
  id: string;
  time: string;
  identity: RunIdentity;
  state: unknown;
  questions: Questions;
  candidates: VisibleCandidate[];
  result?: LabResult;
  error?: string;
  errorResponse?: unknown;
  action?: string;
  execution?: unknown;
  elapsed: number;
  provider: string;
  model: string;
  protocol: string;
  fallback: boolean;
};
export type RunRecord = {
  id: string;
  experimentId: string;
  experimentVersion: string;
  seed?: number;
  parameters: unknown;
  baselineVersion: string;
  mode: RunMode;
  provider: {
    id?: string;
    name: string;
    modelId: string;
    protocol: string;
    version?: number;
  };
  startedAt: string;
  status: RunStatus;
  stepCount: number;
  requests: number;
  failures: number;
  latencyMs: number;
  metrics: Record<string, string | number | boolean>;
  steps: StepRecord[];
  actions: unknown[];
  initialState?: unknown;
};
