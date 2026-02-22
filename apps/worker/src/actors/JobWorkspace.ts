import { evaluateAutopilot } from "../lib/autopilot";
import { EventBroker } from "../lib/events";
import { scoreJob } from "../lib/scoring";
import type {
  ApplicationRecord,
  CandidateProfile,
  DraftArtifacts,
  JobPosting,
  RunnerTask,
  ScoredJob,
  WorkerAiBinding,
  WorkerEnv
} from "../lib/types";
import { RunnerCoordinator } from "./RunnerCoordinator";

const DRAFT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

interface JobWorkspaceOptions {
  profile: CandidateProfile;
  runner: RunnerCoordinator;
  events: EventBroker;
  env: WorkerEnv;
}

function normalizeDraftText(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  if (raw && typeof raw === "object" && "response" in raw) {
    const response = (raw as { response?: unknown }).response;
    if (typeof response === "string" && response.trim()) {
      return response.trim();
    }
  }
  return fallback;
}

export class JobWorkspace {
  private readonly jobs = new Map<string, JobPosting>();
  private readonly scores = new Map<string, ScoredJob>();
  private readonly drafts = new Map<string, DraftArtifacts>();
  private readonly applications = new Map<string, ApplicationRecord>();

  constructor(private readonly options: JobWorkspaceOptions) {}

  discover(inputJobs: Array<Omit<JobPosting, "id" | "discoveredAt"> & { id?: string }>): JobPosting[] {
    const discovered = inputJobs.map((job): JobPosting => {
      const normalized: JobPosting = {
        ...job,
        id: job.id ?? crypto.randomUUID(),
        discoveredAt: new Date().toISOString()
      };
      this.jobs.set(normalized.id, normalized);
      return normalized;
    });
    return discovered;
  }

  async score(jobId: string): Promise<ScoredJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown job id ${jobId}`);
    }

    const scored = await scoreJob(job, this.options.profile, this.options.env.AI);
    this.scores.set(jobId, scored);
    await this.options.events.publish("job_scored", {
      jobId,
      totalScore: scored.totalScore,
      riskFlags: scored.riskFlags
    });
    return scored;
  }

  async draft(jobId: string): Promise<DraftArtifacts> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown job id ${jobId}`);
    }

    const fallback = `Hi ${job.company} team,\n\nI am excited about the ${job.title} role and believe my profile aligns well with your requirements.\n\nBest,\n${this.options.profile.name}`;
    const aiDraft = await this.generateDraftWithAi(job, this.options.env.AI, fallback);

    const artifact: DraftArtifacts = {
      resumeSummary: `Target role: ${job.title}. Top matching skills: ${job.skills.slice(0, 4).join(", ")}.`,
      coverLetter: aiDraft,
      outreachDraft: `Hi ${job.company} recruiter, I just applied to the ${job.title} role and would love to connect.`,
      generatedAt: new Date().toISOString()
    };

    this.drafts.set(jobId, artifact);
    return artifact;
  }

  async queueApply(jobId: string): Promise<{ status: ApplicationRecord["status"]; reasons: string[] }> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown job id ${jobId}`);
    }

    const scored = this.scores.get(jobId) ?? (await this.score(jobId));
    const decision = evaluateAutopilot(job, scored, this.options.profile, this.options.env);
    const application = this.ensureApplication(jobId);

    if (decision.action === "AUTO_APPLY") {
      const task: RunnerTask = {
        task_id: crypto.randomUUID(),
        type: "APPLY",
        payload: {
          jobId,
          url: job.url,
          company: job.company,
          title: job.title,
          draft: this.drafts.get(jobId)
        }
      };
      this.options.runner.enqueueTask(task);

      application.status = "QUEUED";
      application.runnerTaskId = task.task_id;
      application.notes = decision.reasons.join(" ");
      application.updatedAt = new Date().toISOString();
      return { status: application.status, reasons: decision.reasons };
    }

    if (decision.action === "REQUIRE_APPROVAL") {
      application.status = "NEEDS_APPROVAL";
      application.notes = decision.reasons.join(" ");
      application.updatedAt = new Date().toISOString();
      await this.options.events.publish("approval_required", {
        jobId,
        score: scored.totalScore,
        reasons: decision.reasons
      });
      return { status: application.status, reasons: decision.reasons };
    }

    application.status = "BLOCKED";
    application.notes = decision.reasons.join(" ");
    application.updatedAt = new Date().toISOString();
    return { status: application.status, reasons: decision.reasons };
  }

  async markApplied(jobId: string, result: { screenshotUrl?: string; notes?: string }): Promise<ApplicationRecord> {
    const application = this.ensureApplication(jobId);
    application.status = "SUBMITTED";
    application.screenshotUrl = result.screenshotUrl;
    application.notes = result.notes ?? application.notes;
    application.updatedAt = new Date().toISOString();

    await this.options.events.publish("application_submitted", {
      jobId,
      screenshotUrl: application.screenshotUrl
    });

    return application;
  }

  approve(jobId: string): ApplicationRecord {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown job id ${jobId}`);
    }

    const application = this.ensureApplication(jobId);
    const task: RunnerTask = {
      task_id: crypto.randomUUID(),
      type: "APPLY",
      payload: {
        jobId,
        url: job.url,
        company: job.company,
        title: job.title,
        draft: this.drafts.get(jobId),
        manualApproval: true
      }
    };
    this.options.runner.enqueueTask(task);

    application.status = "QUEUED";
    application.runnerTaskId = task.task_id;
    application.notes = "Approved by user for manual-gated flow.";
    application.updatedAt = new Date().toISOString();
    return application;
  }

  reject(jobId: string): ApplicationRecord {
    const application = this.ensureApplication(jobId);
    application.status = "BLOCKED";
    application.notes = "Rejected by user.";
    application.updatedAt = new Date().toISOString();
    return application;
  }

  async requireApproval(jobId: string, reason: string): Promise<ApplicationRecord> {
    const application = this.ensureApplication(jobId);
    application.status = "NEEDS_APPROVAL";
    application.notes = reason;
    application.updatedAt = new Date().toISOString();
    await this.options.events.publish("approval_required", {
      jobId,
      reasons: [reason]
    });
    return application;
  }

  fail(jobId: string, reason: string): ApplicationRecord {
    const application = this.ensureApplication(jobId);
    application.status = "FAILED";
    application.notes = reason;
    application.updatedAt = new Date().toISOString();
    return application;
  }

  listJobs(): JobPosting[] {
    return [...this.jobs.values()];
  }

  listApplications(): ApplicationRecord[] {
    return [...this.applications.values()];
  }

  listScores(): ScoredJob[] {
    return [...this.scores.values()];
  }

  getApplicationByTaskId(taskId: string): ApplicationRecord | undefined {
    return [...this.applications.values()].find((app) => app.runnerTaskId === taskId);
  }

  private ensureApplication(jobId: string): ApplicationRecord {
    const existing = this.applications.get(jobId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const created: ApplicationRecord = {
      id: crypto.randomUUID(),
      jobId,
      status: "IN_PROGRESS",
      createdAt: now,
      updatedAt: now
    };
    this.applications.set(jobId, created);
    return created;
  }

  private async generateDraftWithAi(
    job: JobPosting,
    ai: WorkerAiBinding | undefined,
    fallback: string
  ): Promise<string> {
    if (!ai) {
      return fallback;
    }

    try {
      const result = await ai.run(DRAFT_MODEL, {
        prompt: [
          "Write a concise job-specific cover letter in 150 words or less.",
          `Candidate: ${this.options.profile.name}`,
          `Role: ${job.title} at ${job.company}`,
          `Job description: ${job.description}`
        ].join("\n"),
        max_tokens: 300
      });
      return normalizeDraftText(result, fallback);
    } catch {
      return fallback;
    }
  }
}
