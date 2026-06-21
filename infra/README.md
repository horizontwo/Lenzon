# Lenzon — Infrastructure & System Diagrams

How Lenzon turns a GitHub repo or pull request into a narrated, animated
codebase explainer: Vercel orchestrates, and the heavy lifting (clone, analyze,
render) is offloaded to SQS-driven workers on AWS Fargate.

This folder holds the high-level architecture diagrams plus one illustrative
infrastructure construct. It describes the *shape* of the system, not a
deployable copy of our environment.

## Diagrams

The Mermaid (`.mmd`) sources render natively on GitHub and in most Markdown
viewers, and are easy to edit as the system evolves.

| Diagram | Shows |
|---|---|
| [`lenzon_architecture.svg`](./lenzon_architecture.svg) ([PNG](./lenzon_architecture.png)) | The system at a glance — input → generation pipeline → client runtime, with Vercel orchestrating and AWS doing the compute. |
| [`pipeline-pr-explainer.mmd`](./pipeline-pr-explainer.mmd) | The live PR-explainer run: webhook → Vercel → HMAC handoff → Fargate worker → triage / analyze / produce / audio → PR comment, with the status-paint loop back to GitHub. |
| [`agents-data-flow.mmd`](./agents-data-flow.mmd) | The agent pipeline: Agent 1a triage → mode selection → Agent 1b analysis → Agent 2 producer → client player, including the re-render economics. |

### Rendering

GitHub renders ` ```mermaid ` fenced blocks automatically. To export PNG/SVG
locally:

```bash
npm i -g @mermaid-js/mermaid-cli
mmdc -i pipeline-pr-explainer.mmd -o pipeline-pr-explainer.svg
```

## Example construct

[`job-worker.ts`](./job-worker.ts) is an illustrative, self-contained AWS CDK
construct showing the pattern behind each Lenzon workload: an SQS queue + DLQ
feeding an EventBridge Pipe that runs a Fargate task, with a KMS-encrypted S3
bucket and least-privilege IAM roles. It carries no account-specific values —
pass your own `resourcePrefix`, VPC, cluster, and KMS key to instantiate it.

It's provided as a reference for the architecture, not as a turnkey deployment.
