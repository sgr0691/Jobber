import type {
  AutopilotDecision,
  CandidateProfile,
  JobPosting,
  ScoredJob,
  WorkerEnv
} from "./types";

const DEFAULT_AUTO_APPLY_THRESHOLD = 85;
const DEFAULT_APPROVAL_THRESHOLD = 70;

function parseEnvNumber(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }
  const parsed = Number.parseInt(input, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function evaluateAutopilot(
  job: JobPosting,
  scored: ScoredJob,
  profile: CandidateProfile,
  env?: WorkerEnv
): AutopilotDecision {
  const autoApplyThreshold = parseEnvNumber(env?.JOBBER_AUTO_APPLY_THRESHOLD, DEFAULT_AUTO_APPLY_THRESHOLD);
  const approvalThreshold = parseEnvNumber(env?.JOBBER_APPROVAL_THRESHOLD, DEFAULT_APPROVAL_THRESHOLD);
  const needsRemote = env?.JOBBER_REMOTE_REQUIRED
    ? env.JOBBER_REMOTE_REQUIRED === "true"
    : profile.remoteRequired;

  const reasons: string[] = [];

  if (job.requiresClearance || scored.riskFlags.includes("CLEARANCE_REQUIRED")) {
    reasons.push("Clearance is required for this role.");
    return { action: "BLOCK", reasons };
  }

  if (needsRemote && (job.locationType === "onsite" || scored.riskFlags.includes("ONSITE_ONLY"))) {
    reasons.push("Role is onsite-only while remote is required.");
    return { action: "BLOCK", reasons };
  }

  if (job.applyFlow === "workday") {
    reasons.push("Workday flow requires manual review.");
    return { action: "REQUIRE_APPROVAL", reasons };
  }

  if (scored.totalScore >= autoApplyThreshold && scored.riskFlags.length === 0 && job.applyFlow === "simple") {
    reasons.push(`Score ${scored.totalScore} meets auto-apply threshold.`);
    return { action: "AUTO_APPLY", reasons };
  }

  if (scored.totalScore >= approvalThreshold && scored.totalScore < autoApplyThreshold) {
    reasons.push(`Score ${scored.totalScore} is in manual approval range.`);
    return { action: "REQUIRE_APPROVAL", reasons };
  }

  reasons.push(`Score ${scored.totalScore} is below approval threshold.`);
  return { action: "BLOCK", reasons };
}
