import { JobWorkspace } from "../actors/JobWorkspace";
import { RunnerCoordinator } from "../actors/RunnerCoordinator";
import { EventBroker } from "./events";
import type { CandidateProfile, WorkerEnv } from "./types";

const defaultCandidateProfile: CandidateProfile = {
  name: "Default Candidate",
  targetTitles: ["Software Engineer", "Full Stack Engineer", "Platform Engineer"],
  skills: ["typescript", "node", "cloudflare workers", "playwright", "astro", "api design"],
  remoteRequired: true,
  minCompensation: 150000
};

const mutableEnv: WorkerEnv = {};
const events = new EventBroker();
const runner = new RunnerCoordinator();
const workspace = new JobWorkspace({
  profile: defaultCandidateProfile,
  runner,
  events,
  env: mutableEnv
});

export function getSystem(env: WorkerEnv): {
  workspace: JobWorkspace;
  runner: RunnerCoordinator;
  events: EventBroker;
} {
  Object.assign(mutableEnv, env);
  return { workspace, runner, events };
}
