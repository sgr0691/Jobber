/**
 * Rivet-facing actor registry metadata.
 * This keeps actor signatures explicit and can be wired into rivetkit bootstrap code.
 */
export const rivetActorDefinitions = {
  JobWorkspace: {
    state: ["jobs", "applications", "outreach"],
    methods: ["discover", "score", "draft", "queueApply", "markApplied"]
  },
  RunnerCoordinator: {
    state: ["pendingTasks", "retries"],
    methods: ["enqueueTask", "receiveResult"]
  }
} as const;
