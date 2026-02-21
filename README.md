# Jobber

Jobber is a stateful, workflow-driven job automation system built for anyone who wants leverage --- not spam.

It intelligently:

-   Discovers relevant job postings\
-   Scores them using AI\
-   Generates tailored application materials\
-   Applies automatically when safe\
-   Drafts recruiter outreach\
-   Tracks everything in real time

Jobber treats job acquisition like a distributed system --- with
workflows, retries, state transitions, and observability.

------------------------------------------------------------------------

## Why Jobber Exists

Job searching is repetitive and mechanical.

Instead of manually: - Scanning job boards\
- Copying/pasting applications\
- Writing similar cover letters\
- Tracking follow-ups in spreadsheets

Jobber automates the mechanical work while keeping humans in control.

This is not a mass-apply bot.\
This is intelligent automation with guardrails.

------------------------------------------------------------------------

## Architecture (High Level)

**Brain → Rivet Actors on Cloudflare Workers**\
Stateful workflows, retries, scheduling, and real-time events.

**Intelligence → Workers AI**\
Parses job descriptions, scores alignment, drafts tailored materials.

**Hands → Browser Use + Playwright Runner**\
Executes real browser automation for complex job applications.

**UI → Astro Dashboard**\
Provides visibility, approval gates, and full audit trail.

------------------------------------------------------------------------

## Core Workflow

DISCOVER → SCORE → DRAFT → APPLY → OUTREACH → FOLLOWUP

Autopilot only runs when: - Score ≥ threshold\
- No risk flags\
- Simple apply flow

Everything else requires approval.

------------------------------------------------------------------------

## Tech Choices (Simple Explanation)

**Rivet**\
Provides stateful actors and workflows so we don't reinvent queue
systems.

**Cloudflare Workers**\
Global, serverless runtime with generous free tier.

**Workers AI**\
Edge-based AI inference for scoring and drafting.

**Browser Use + Playwright**\
Real browser automation for multi-step application flows.

**Astro**\
Lightweight dashboard deployed on Cloudflare Pages.

------------------------------------------------------------------------

## Safety Principles

-   Human-in-the-loop\
-   No bypassing protections\
-   Clear audit trail\
-   Global kill switch

------------------------------------------------------------------------

## What Makes It Different

Most job automation scripts: - Blindly apply\
- Lack scoring logic\
- Have no state awareness

Jobber behaves like a production backend system --- reliable,
observable, and controlled.

------------------------------------------------------------------------

## Status

Active development.\
Rivet-first architecture.\
Hybrid cloud + browser automation.

------------------------------------------------------------------------

Apply smarter, not louder.
