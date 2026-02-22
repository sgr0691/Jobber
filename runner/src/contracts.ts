export interface RunnerTask {
  task_id: string;
  type: "APPLY" | "OUTREACH";
  payload: Record<string, unknown>;
}

export interface RunnerResult {
  task_id: string;
  status: "SUCCESS" | "FAILED" | "NEEDS_APPROVAL";
  data?: Record<string, unknown>;
  screenshot_url?: string;
}
