export type WorkflowStage =
  | "DISCOVER"
  | "SCORE"
  | "DRAFT"
  | "APPLY"
  | "OUTREACH"
  | "FOLLOWUP";

export type ApplyFlow = "simple" | "workday" | "greenhouse" | "lever" | "custom";
export type LocationType = "remote" | "hybrid" | "onsite";

export interface JobPosting {
  id: string;
  title: string;
  company: string;
  url: string;
  description: string;
  skills: string[];
  compensation?: number;
  applyFlow: ApplyFlow;
  locationType: LocationType;
  requiresClearance: boolean;
  discoveredAt: string;
}

export interface CandidateProfile {
  name: string;
  targetTitles: string[];
  skills: string[];
  remoteRequired: boolean;
  minCompensation?: number;
}

export interface ScoreWeights {
  titleMatch: number;
  skillsMatch: number;
  compensationMatch: number;
  remoteMatch: number;
  semanticFit: number;
}

export interface ScoreBreakdown {
  titleMatch: number;
  skillsMatch: number;
  compensationMatch: number;
  remoteMatch: number;
  semanticFit: number;
  weightedTotal: number;
}

export interface ScoredJob {
  jobId: string;
  totalScore: number;
  riskFlags: string[];
  breakdown: ScoreBreakdown;
  scoredAt: string;
}

export interface DraftArtifacts {
  resumeSummary: string;
  coverLetter: string;
  outreachDraft: string;
  generatedAt: string;
}

export type ApplicationStatus =
  | "QUEUED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "FAILED"
  | "BLOCKED"
  | "NEEDS_APPROVAL";

export interface ApplicationRecord {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  runnerTaskId?: string;
  screenshotUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachRecord {
  id: string;
  jobId: string;
  message: string;
  status: "DRAFTED" | "SENT";
  createdAt: string;
  updatedAt: string;
}

export interface RunnerTask {
  task_id: string;
  type: "APPLY" | "OUTREACH";
  payload: Record<string, unknown>;
}

export interface PendingRunnerTask extends RunnerTask {
  retries: number;
  createdAt: string;
}

export interface RunnerResult {
  task_id: string;
  status: "SUCCESS" | "FAILED" | "NEEDS_APPROVAL";
  data?: Record<string, unknown>;
  screenshot_url?: string;
}

export type RealtimeEventType =
  | "job_scored"
  | "application_submitted"
  | "approval_required";

export interface RealtimeEvent<TPayload = unknown> {
  type: RealtimeEventType;
  payload: TPayload;
  timestamp: string;
}

export type AutopilotAction = "AUTO_APPLY" | "REQUIRE_APPROVAL" | "BLOCK";

export interface AutopilotDecision {
  action: AutopilotAction;
  reasons: string[];
}

export interface WorkerAiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface WorkerEnv {
  AI?: WorkerAiBinding;
  JOBBER_REMOTE_REQUIRED?: string;
  JOBBER_AUTO_APPLY_THRESHOLD?: string;
  JOBBER_APPROVAL_THRESHOLD?: string;
}
