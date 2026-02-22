import { describe, expect, it } from "vitest";
import { collectRiskFlags, scoreJob } from "../apps/worker/src/lib/scoring";
import type { CandidateProfile, JobPosting } from "../apps/worker/src/lib/types";

const profile: CandidateProfile = {
  name: "Scoring Candidate",
  targetTitles: ["Senior Full Stack Engineer"],
  skills: ["TypeScript", "Node", "Cloudflare Workers", "Astro", "Playwright"],
  remoteRequired: true,
  minCompensation: 150000
};

const job: JobPosting = {
  id: "score-job-1",
  title: "Senior Full Stack Engineer",
  company: "Remote First Labs",
  url: "https://example.com/jobs/score-job-1",
  description: "Build modern applications with TypeScript and Cloudflare Workers.",
  skills: ["TypeScript", "Node", "Cloudflare Workers"],
  compensation: 175000,
  applyFlow: "simple",
  locationType: "remote",
  requiresClearance: false,
  discoveredAt: new Date().toISOString()
};

describe("scoreJob", () => {
  it("returns a weighted score between 0 and 100", async () => {
    const score = await scoreJob(job, profile);
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
    expect(score.breakdown.weightedTotal).toBe(score.totalScore);
  });

  it("adds risk flags for blocked/approval conditions", () => {
    const flags = collectRiskFlags(
      {
        ...job,
        applyFlow: "workday",
        locationType: "onsite",
        requiresClearance: true
      },
      profile
    );
    expect(flags).toContain("WORKDAY_FLOW");
    expect(flags).toContain("ONSITE_ONLY");
    expect(flags).toContain("CLEARANCE_REQUIRED");
  });
});
