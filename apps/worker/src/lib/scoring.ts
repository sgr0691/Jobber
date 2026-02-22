import type {
  CandidateProfile,
  JobPosting,
  ScoreBreakdown,
  ScoreWeights,
  ScoredJob,
  WorkerAiBinding
} from "./types";

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  titleMatch: 0.2,
  skillsMatch: 0.35,
  compensationMatch: 0.15,
  remoteMatch: 0.1,
  semanticFit: 0.2
};

const SCORE_MODEL = "@cf/meta/llama-3.1-8b-instruct";

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9+.#-]+/g)
      .filter(Boolean)
  );
}

function overlapPercent(candidateTokens: Set<string>, referenceTokens: Set<string>): number {
  if (candidateTokens.size === 0 || referenceTokens.size === 0) {
    return 0;
  }

  let hits = 0;
  for (const token of candidateTokens) {
    if (referenceTokens.has(token)) {
      hits += 1;
    }
  }
  return clampScore((hits / candidateTokens.size) * 100);
}

function computeTitleScore(job: JobPosting, profile: CandidateProfile): number {
  const targetTitleTokens = tokenSet(profile.targetTitles.join(" "));
  const jobTitleTokens = tokenSet(job.title);
  return overlapPercent(targetTitleTokens, jobTitleTokens);
}

function computeSkillsScore(job: JobPosting, profile: CandidateProfile): number {
  const jobSkills = tokenSet(job.skills.join(" "));
  const profileSkills = tokenSet(profile.skills.join(" "));
  return overlapPercent(jobSkills, profileSkills);
}

function computeCompensationScore(job: JobPosting, profile: CandidateProfile): number {
  if (!profile.minCompensation || !job.compensation) {
    return 70;
  }
  if (job.compensation >= profile.minCompensation) {
    return 100;
  }

  const gapRatio = Math.max(0, 1 - job.compensation / profile.minCompensation);
  return clampScore(100 - gapRatio * 100);
}

function computeRemoteScore(job: JobPosting, profile: CandidateProfile): number {
  if (!profile.remoteRequired) {
    return 100;
  }

  if (job.locationType === "remote") {
    return 100;
  }
  if (job.locationType === "hybrid") {
    return 50;
  }
  return 0;
}

function extractAiScore(result: unknown): number | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const scoreCandidates = [
    (result as { score?: unknown }).score,
    (result as { response?: unknown }).response
  ];

  for (const candidate of scoreCandidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return clampScore(candidate);
    }

    if (typeof candidate === "string") {
      const numeric = Number.parseFloat(candidate);
      if (Number.isFinite(numeric)) {
        return clampScore(numeric);
      }

      const match = candidate.match(/\b([0-9]{1,3})\b/);
      if (match) {
        return clampScore(Number.parseInt(match[1], 10));
      }
    }
  }

  return null;
}

async function computeSemanticScore(
  ai: WorkerAiBinding | undefined,
  job: JobPosting,
  profile: CandidateProfile
): Promise<number> {
  if (!ai) {
    return clampScore((computeTitleScore(job, profile) + computeSkillsScore(job, profile)) / 2);
  }

  const prompt = [
    "Return ONLY a numeric fit score from 0-100.",
    "Candidate profile:",
    JSON.stringify(profile),
    "Job posting:",
    JSON.stringify(job)
  ].join("\n");

  try {
    const result = await ai.run(SCORE_MODEL, {
      prompt,
      max_tokens: 8
    });
    const parsed = extractAiScore(result);
    return parsed ?? 65;
  } catch {
    return clampScore((computeTitleScore(job, profile) + computeSkillsScore(job, profile)) / 2);
  }
}

export function collectRiskFlags(job: JobPosting, profile: CandidateProfile): string[] {
  const flags: string[] = [];
  if (job.requiresClearance) {
    flags.push("CLEARANCE_REQUIRED");
  }
  if (profile.remoteRequired && job.locationType === "onsite") {
    flags.push("ONSITE_ONLY");
  }
  if (job.applyFlow === "workday") {
    flags.push("WORKDAY_FLOW");
  }
  return flags;
}

export async function scoreJob(
  job: JobPosting,
  profile: CandidateProfile,
  ai?: WorkerAiBinding,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS
): Promise<ScoredJob> {
  const titleMatch = computeTitleScore(job, profile);
  const skillsMatch = computeSkillsScore(job, profile);
  const compensationMatch = computeCompensationScore(job, profile);
  const remoteMatch = computeRemoteScore(job, profile);
  const semanticFit = await computeSemanticScore(ai, job, profile);

  const weightedTotal = clampScore(
    titleMatch * weights.titleMatch +
      skillsMatch * weights.skillsMatch +
      compensationMatch * weights.compensationMatch +
      remoteMatch * weights.remoteMatch +
      semanticFit * weights.semanticFit
  );

  const breakdown: ScoreBreakdown = {
    titleMatch,
    skillsMatch,
    compensationMatch,
    remoteMatch,
    semanticFit,
    weightedTotal
  };

  return {
    jobId: job.id,
    totalScore: weightedTotal,
    riskFlags: collectRiskFlags(job, profile),
    breakdown,
    scoredAt: new Date().toISOString()
  };
}
