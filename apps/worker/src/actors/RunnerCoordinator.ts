import type { PendingRunnerTask, RunnerResult, RunnerTask } from "../lib/types";

const MAX_RETRIES = 2;

export class RunnerCoordinator {
  private readonly pendingQueue: PendingRunnerTask[] = [];
  private readonly inFlight = new Map<string, PendingRunnerTask>();
  private readonly completedResults = new Map<string, RunnerResult>();

  enqueueTask(task: RunnerTask): PendingRunnerTask {
    const pending: PendingRunnerTask = {
      ...task,
      retries: 0,
      createdAt: new Date().toISOString()
    };
    this.pendingQueue.push(pending);
    return pending;
  }

  claimPending(limit = 3): PendingRunnerTask[] {
    const claimed = this.pendingQueue.splice(0, limit);
    for (const task of claimed) {
      this.inFlight.set(task.task_id, task);
    }
    return claimed;
  }

  receiveResult(result: RunnerResult): { requeued: boolean } {
    const task = this.inFlight.get(result.task_id);
    if (!task) {
      this.completedResults.set(result.task_id, result);
      return { requeued: false };
    }

    this.inFlight.delete(result.task_id);

    if (result.status === "FAILED" && task.retries < MAX_RETRIES) {
      task.retries += 1;
      this.pendingQueue.push(task);
      return { requeued: true };
    }

    this.completedResults.set(result.task_id, result);
    return { requeued: false };
  }

  peekResult(taskId: string): RunnerResult | undefined {
    return this.completedResults.get(taskId);
  }
}
