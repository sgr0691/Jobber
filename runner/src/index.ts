import { chromium } from "playwright-core";
import type { RunnerResult, RunnerTask } from "./contracts";

const workerBaseUrl = process.env.WORKER_BASE_URL ?? "http://127.0.0.1:8787";
const pollIntervalMs = Number.parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);
const pendingLimit = Number.parseInt(process.env.PENDING_LIMIT ?? "2", 10);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPendingTasks(): Promise<RunnerTask[]> {
  const response = await fetch(`${workerBaseUrl}/api/runner/pending?limit=${pendingLimit}`);
  if (!response.ok) {
    throw new Error(`Runner pending fetch failed (${response.status})`);
  }
  const body = (await response.json()) as { tasks?: RunnerTask[] };
  return body.tasks ?? [];
}

async function submitResult(result: RunnerResult): Promise<void> {
  const response = await fetch(`${workerBaseUrl}/api/runner/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result)
  });
  if (!response.ok) {
    throw new Error(`Runner result submit failed (${response.status})`);
  }
}

async function runApplyTask(task: RunnerTask): Promise<RunnerResult> {
  const url = String(task.payload.url ?? "");
  if (!url) {
    return { task_id: task.task_id, status: "FAILED", data: { reason: "Missing target url" } };
  }

  // Browser Use style signal: model asks for hand-off when captcha appears.
  if (task.payload.forceCaptcha === true) {
    return {
      task_id: task.task_id,
      status: "NEEDS_APPROVAL",
      data: { reason: "Captcha hint in payload." }
    };
  }

  // Default mode is deterministic dry-run to keep CI/headless safe.
  if (process.env.RUNNER_REAL_BROWSER !== "true") {
    return {
      task_id: task.task_id,
      status: "SUCCESS",
      data: {
        mode: "dry-run",
        note: "Enable RUNNER_REAL_BROWSER=true for Playwright execution."
      },
      screenshot_url: "https://example.com/screenshots/dry-run.png"
    };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const content = (await page.content()).toLowerCase();
    if (content.includes("captcha")) {
      return {
        task_id: task.task_id,
        status: "NEEDS_APPROVAL",
        data: { reason: "Captcha detected in page content." }
      };
    }

    const screenshotPath = `/tmp/${task.task_id}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      task_id: task.task_id,
      status: "SUCCESS",
      data: { visited: url },
      screenshot_url: screenshotPath
    };
  } catch (error) {
    return {
      task_id: task.task_id,
      status: "FAILED",
      data: { reason: error instanceof Error ? error.message : "Unknown playwright failure" }
    };
  } finally {
    await browser?.close();
  }
}

async function executeTask(task: RunnerTask): Promise<RunnerResult> {
  if (task.type === "APPLY") {
    return runApplyTask(task);
  }

  return {
    task_id: task.task_id,
    status: "SUCCESS",
    data: { note: "Outreach task simulated." }
  };
}

async function loop(): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const tasks = await fetchPendingTasks();
      for (const task of tasks) {
        const result = await executeTask(task);
        await submitResult(result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown runner error";
      console.error(`[runner] ${message}`);
    }
    await sleep(pollIntervalMs);
  }
}

void loop();
