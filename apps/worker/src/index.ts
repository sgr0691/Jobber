import { z } from "zod";
import { getSystem } from "./lib/store";
import type { RunnerResult, WorkerEnv } from "./lib/types";

const discoverJobSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  company: z.string().min(1),
  url: z.string().url(),
  description: z.string().min(1),
  skills: z.array(z.string()).default([]),
  compensation: z.number().optional(),
  applyFlow: z.enum(["simple", "workday", "greenhouse", "lever", "custom"]),
  locationType: z.enum(["remote", "hybrid", "onsite"]),
  requiresClearance: z.boolean().default(false)
});

const discoverPayloadSchema = z.object({
  jobs: z.array(discoverJobSchema).min(1)
});

const runnerResultSchema = z.object({
  task_id: z.string().min(1),
  status: z.enum(["SUCCESS", "FAILED", "NEEDS_APPROVAL"]),
  data: z.record(z.string(), z.unknown()).optional(),
  screenshot_url: z.string().url().optional()
});

function applyCorsHeaders(headers: Headers): void {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
}

function json(data: unknown, status = 200): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  applyCorsHeaders(headers);
  return new Response(JSON.stringify(data), { status, headers });
}

function text(message: string, status = 200): Response {
  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8" });
  applyCorsHeaders(headers);
  return new Response(message, { status, headers });
}

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function getJobRoute(pathname: string): { jobId: string; action: string } | null {
  const match = pathname.match(/^\/api\/jobs\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }
  return {
    jobId: decodeURIComponent(match[1]),
    action: decodeURIComponent(match[2])
  };
}

async function handleRunnerResult(result: RunnerResult, env: WorkerEnv): Promise<{ ok: boolean; requeued: boolean }> {
  const { runner, workspace } = getSystem(env);
  const receipt = runner.receiveResult(result);
  const application = workspace.getApplicationByTaskId(result.task_id);

  if (!application) {
    return { ok: true, requeued: receipt.requeued };
  }

  if (result.status === "SUCCESS") {
    await workspace.markApplied(application.jobId, {
      screenshotUrl: result.screenshot_url,
      notes: "Runner completed task successfully."
    });
    return { ok: true, requeued: receipt.requeued };
  }

  if (result.status === "NEEDS_APPROVAL") {
    await workspace.requireApproval(application.jobId, "Runner detected captcha or manual checkpoint.");
    return { ok: true, requeued: receipt.requeued };
  }

  if (!receipt.requeued) {
    workspace.fail(application.jobId, "Runner failed after retry budget.");
  }

  return { ok: true, requeued: receipt.requeued };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === "OPTIONS") {
      const headers = new Headers();
      applyCorsHeaders(headers);
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    const { pathname } = url;
    const { workspace, runner, events } = getSystem(env);

    if (pathname === "/") {
      return text("Jobber worker online");
    }

    if (pathname === "/ws") {
      return events.subscribe(request);
    }

    if (pathname === "/api/state" && request.method === "GET") {
      return json({
        jobs: workspace.listJobs(),
        scores: workspace.listScores(),
        applications: workspace.listApplications()
      });
    }

    if (pathname === "/api/jobs/discover" && request.method === "POST") {
      const payload = discoverPayloadSchema.safeParse(await parseBody(request));
      if (!payload.success) {
        return json({ error: payload.error.flatten() }, 400);
      }
      const jobs = workspace.discover(payload.data.jobs);
      return json({ jobs }, 201);
    }

    const jobRoute = getJobRoute(pathname);
    if (jobRoute && request.method === "POST") {
      try {
        switch (jobRoute.action) {
          case "score": {
            const scored = await workspace.score(jobRoute.jobId);
            return json({ scored });
          }
          case "draft": {
            const draft = await workspace.draft(jobRoute.jobId);
            return json({ draft });
          }
          case "queue-apply": {
            const result = await workspace.queueApply(jobRoute.jobId);
            return json({ result });
          }
          case "approve": {
            const application = workspace.approve(jobRoute.jobId);
            return json({ application });
          }
          case "reject": {
            const application = workspace.reject(jobRoute.jobId);
            return json({ application });
          }
          default:
            return json({ error: "Unknown job action" }, 404);
        }
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unhandled job action error" }, 400);
      }
    }

    if (pathname === "/api/runner/pending" && request.method === "GET") {
      const limit = Number.parseInt(url.searchParams.get("limit") ?? "3", 10);
      const tasks = runner.claimPending(Number.isFinite(limit) ? limit : 3);
      return json({ tasks });
    }

    if (pathname === "/api/runner/result" && request.method === "POST") {
      const parsed = runnerResultSchema.safeParse(await parseBody(request));
      if (!parsed.success) {
        return json({ error: parsed.error.flatten() }, 400);
      }
      const result = await handleRunnerResult(parsed.data, env);
      return json(result);
    }

    return json({ error: "Not found" }, 404);
  }
};
