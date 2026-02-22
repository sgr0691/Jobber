import { describe, expect, it } from "vitest";
import { evaluateAutopilot } from "../apps/worker/src/lib/autopilot";
import type { CandidateProfile, JobPosting, ScoredJob } from "../apps/worker/src/lib/types";

const profile: CandidateProfile = {
  name: "Test Candidate",
  targetTitles: ["Software Engineer"],
  skills: ["typescript", "node"],
  remoteRequired: true,
  minCompensation: 130000
};

const baseJob: JobPosting = {
  id: "job-1",
  title: "Software Engineer",
  company: "Acme",
  url: "https://example.com/jobs/1",
  description: "Build distributed systems.",
  skills: ["typescript", "node"],
  compensation: 150000,
  applyFlow: "simple",
  locationType: "remote",
  requiresClearance: false,
  discoveredAt: new Date().toISOString()
};

const baseScore: ScoredJob = {
  jobId: "job-1",
  totalScore: 90,
  riskFlags: [],
  breakdown: {
    titleMatch: 90,
    skillsMatch: 90,
    compensationMatch: 90,
    remoteMatch: 90,
    semanticFit: 90,
    weightedTotal: 90
  },
  scoredAt: new Date().toISOString()
};

describe("evaluateAutopilot", () => {
  it("auto-applies high-confidence simple flows", () => {
    const decision = evaluateAutopilot(baseJob, baseScore, profile);
    expect(decision.action).toBe("AUTO_APPLY");
  });

  it("requires approval for workday jobs", () => {
    const decision = evaluateAutopilot(
      { ...baseJob, applyFlow: "workday" },
      { ...baseScore, riskFlags: ["WORKDAY_FLOW"] },
      profile
    );
    expect(decision.action).toBe("REQUIRE_APPROVAL");
  });

  it("requires approval for medium scores", () => {
    const decision = evaluateAutopilot(baseJob, { ...baseScore, totalScore: 78 }, profile);
    expect(decision.action).toBe("REQUIRE_APPROVAL");
  });

  it("blocks clearance-required roles", () => {
    const decision = evaluateAutopilot(
      { ...baseJob, requiresClearance: true },
      { ...baseScore, riskFlags: ["CLEARANCE_REQUIRED"] },
      profile
    );
    expect(decision.action).toBe("BLOCK");
  });

  it("blocks onsite-only jobs when remote is required", () => {
    const decision = evaluateAutopilot(
      { ...baseJob, locationType: "onsite" },
      { ...baseScore, riskFlags: ["ONSITE_ONLY"] },
      profile
    );
    expect(decision.action).toBe("BLOCK");
  });
});
