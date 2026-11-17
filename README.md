# riskrouter-recorder

Drop-in recorders for Python and Node, with no dependencies, that turn the decision logs you already keep into
evidence. Each record and its salt stay in your own journal; only the record's salted SHA-256 and a short kind
are sent to an evidence log, so that later anyone holding the record can check it was never changed. The log can
be RiskRouter's (`https://api.riskrouter.eu`), your own instance, or none at all: with no key, nothing is sent and
the journal keeps everything.

| | Install | Read |
| --- | --- | --- |
| Python 3.8+ | `pip install riskrouter-recorder` | [`python/README.md`](python/README.md) |
| Node 20+ | `npm install riskrouter-recorder` | [`js/README.md`](js/README.md) |

Using GitHub Actions? This repository is also the **Seal a release with RiskRouter** action: one step seals
each file of a release and leaves a receipt anyone can verify offline. See
[Seal a release from GitHub Actions](#seal-a-release-from-github-actions).

What is in them:

- a recorder with a local journal, batching, retries and completeness chains;
- a Python `logging` handler, a decorator (Python) or function wrapper (Node), and OpenTelemetry span processors;
- agent adapters for LangChain and LangGraph and for the OpenAI Agents SDK: one record per run, with content
  digests, never content;
- a local MCP server (Node, `riskrouter-recorder-mcp`) that gives any MCP client a `record_decision` tool. It
  records the agent's own statement of what it decided and marks every record so; it never returns a record or a
  salt to the agent;
- `riskrouter-logseal`, which seals a log stream segment by segment, and `riskrouter-otlp-sealer`, which seals
  spans and log records at the OpenTelemetry Collector.

```sh
npx -y -p riskrouter-recorder riskrouter-recorder-mcp     # the local MCP server, over stdio
```

In an MCP client's settings (setup steps for an assistant: [`llms-install.md`](llms-install.md)):

```json
{ "mcpServers": { "riskrouter-recorder": { "command": "npx",
    "args": ["-y", "-p", "riskrouter-recorder", "riskrouter-recorder-mcp"],
    "env": { "RISKROUTER_JOURNAL": "/absolute/path/to/evidence-journal.jsonl" } } } }
```

Its tools are `record_decision`, `evidence_lookup` and `evidence_status`; only `record_decision` writes, and
nothing deletes. With `RISKROUTER_API_KEY` set, each record's salted digest goes to the log; without it, nothing
leaves the machine.

RiskRouter also runs a hosted MCP endpoint for reading the log and its proofs, at `https://api.riskrouter.eu/mcp`
(`eu.riskrouter/evidence-log` in the official MCP Registry). That is the service, not this package.

## Seal a release from GitHub Actions

Seal the SHA-256 of each file of a release, so anyone can later show the artefact they hold is the one that
shipped, on the day it shipped. Only each record's salted digest leaves the runner; the files stay where they are.
With an SBOM, each record is a `cra.release` of the Cyber Resilience Act pack.

```yaml
on:
  release:
    types: [published]
jobs:
  seal:
    runs-on: ubuntu-latest
    permissions:
      contents: write   # to attach the receipts to the release
    steps:
      - uses: actions/checkout@v4
      - run: gh release download "$GITHUB_REF_NAME" --dir dist
        env: { GH_TOKEN: "${{ github.token }}" }
      - id: seal
        uses: aniljangrabe-dev/riskrouter-recorder@main
        with:
          api-key: ${{ secrets.RISKROUTER_API_KEY }}   # free sandbox key: https://riskrouter.eu/integrate
          files: dist/*
          # sbom: dist/sbom.cdx.json
      - run: gh release upload "$GITHUB_REF_NAME" ${{ steps.seal.outputs.receipts }}/*.riskrouter.json
        env: { GH_TOKEN: "${{ github.token }}" }
```

| Input | | |
| --- | --- | --- |
| `api-key` | required | Your key, from a secret. A free sandbox key is at https://riskrouter.eu/integrate (no form, no email; up to 50 entries a day). |
| `files` | required | Shell globs, separated by spaces or new lines, such as `dist/*.tar.gz dist/*.zip`. A glob that matches nothing fails the step. |
| `product` | the repository | The product's name in each record. |
| `version` | the tag or branch | The version in each record. |
| `sbom` | none | A CycloneDX or SPDX file. With it, each record is a `cra.release`. |
| `out` | `riskrouter-receipts` | Where the receipts and the journal go. |
| `api` | `https://api.riskrouter.eu` | Another instance of the log, if you run your own. |

The step's output `receipts` names that directory, and the run's summary page lists each file, its log entry and
its receipt. A file that could not be recorded is reported as not sealed, and the step fails: it never reports a
seal it does not have.

Each `<file>.riskrouter.json` is a receipt the published verifiers check offline. Attaching it to the release makes
the record and its salt public, which is fine for a public release; for a private one, keep the receipts privately
instead. Without the receipt, nobody, RiskRouter included, can tie the log entry to the file. The same sealer runs
outside GitHub: `RISKROUTER_API_KEY=… npx -p riskrouter-recorder riskrouter-seal-release --product acme/app --version 1.2.0 dist/*`.

## Checking what was recorded

A record's bundle is checked offline, without RiskRouter, by either of the open-source verifiers at
https://github.com/aniljangrabe-dev/riskrouter-verify. The record format, the salted digest and the log's proofs
are specified at https://riskrouter.eu/spec.

## About this repository

This repository is an exact copy of `recorders/` in RiskRouter's own repository, which is private; a workflow
copies every change here when it lands there. Issues are welcome here, and a pull request is read and, if accepted,
applied at the source and copied back. Report a security problem as https://riskrouter.eu/security says, not in
an issue.

Licence: Apache-2.0 ([`LICENSE`](LICENSE)), like the verifiers, the conformance suite and the integration kit. The
RiskRouter service itself is not licensed.
