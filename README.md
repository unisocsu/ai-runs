# AI Runs — GitHub Pages chat backed by GitHub Actions

A static GitHub Pages chat that writes message and result JSON files directly to this repository through the GitHub REST API. When no worker session is active, the page dispatches one GitHub Actions workflow. While the model runner is active, later messages are written to a repository-backed JSON queue and handled by that same run.

## Model

- **Model:** Qwen3-4B-Instruct-2507 GGUF, Q4_K_M quantization (~2.5 GB)
- **Runtime:** [llama.cpp](https://github.com/ggml-org/llama.cpp)
- **Runner:** `ubuntu-latest` (standard hosted runner; RAM is limited and is not configurable here)
- **Model file:** downloaded from [bartowski's Qwen3-4B-Instruct-2507 GGUF repository](https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF)
- **Model caching:** disabled; model is downloaded afresh every workflow run

The Q4_K_M file is about 2.5 GB and inference is CPU-only. Qwen3-4B-Instruct-2507 is smaller than the previous 7B model and should reduce model download and load time; actual generation speed and answer quality depend on the task and hosted runner.

This is a starting point for testing. It will not match Claude Sonnet just because it is allowed to think for longer; quality, context size, and speed depend on the model and runner.

## Website chat on GitHub Pages

The chat UI is in `public/`. The browser reads `runtime/session.json` and writes request files under `runtime/queue/<session-id>/` and result files under `runtime/results/` by calling the GitHub REST API directly. It does not call the old Cloudflare Pages Functions. If the session registry is active, a message only creates JSON files; it does not dispatch another workflow. If no active session exists, the page writes a new session registry and invokes `infer.yml`.

Enter a fine-grained GitHub token limited to this repository with **Contents: Read and write** and **Actions: Read and write** permissions. The browser sends it directly to `api.github.com` and stores it in a browser cookie for 30 days. Do not commit a token or use a broad-scope token. The repository is public, so queue JSON, prompts, results and saved conversation files are public too; do not send confidential data.

The worker loads the model once and polls the repository-backed JSON queue for up to five hours. Each completed response is written to `runtime/results/<message-id>.json`. The workflow fetches full Git history and rebases the saved conversation commit on the latest `main` so it does not discard JSON commits created while inference was running.

The workflow does not cache the model. It downloads the ~2.5 GB Qwen3-4B-Instruct-2507 GGUF file on every session start. Only the `llama.cpp` CMake build directory (including the compiled `llama-server`) is cached. The llama.cpp source is cloned each run. GitHub may evict caches, so a rebuild can still be needed.

## Agent tools (first version)

The inference script now runs a bounded agent loop instead of a single text completion. The workflow runs only when manually started with **Actions → Run local AI → Run workflow** (`workflow_dispatch`); it has no push or schedule trigger. Because this is a public repository, `ubuntu-latest` provides a 4-vCPU runner; the workflow checks that at least four logical CPUs are visible and configures `llama-server` with `--threads 4 --threads-batch 4`. It can:

- Search the web and inspect returned snippets/links.
- Create, list, and read files only inside `agent_workspace/`.
- Calculate arithmetic using a restricted expression parser.
- Run Bash commands in a disposable Ubuntu Docker container, including shell pipelines, scripts, downloads, package installation, compilation, and tests.
- The container has internet access and only `agent_workspace/` mounted from the runner. Its filesystem is discarded after each command; the mounted workspace persists and is uploaded as the `agent-workspace` artifact.
- Each Bash call has a 180-second timeout, 1 GB memory limit, 4 CPU limit, 256-process limit, and output capped at 12 KB.
- Keep GitHub write credentials out of the agent environment; the workflow only exposes its token to the final fixed commit/push step.
- Make up to 6 tool calls per request, then produce a final response.
- Upload generated workspace files as the `agent-workspace` artifact.

This is a much more capable shell, but not literally unlimited: each command has resource limits, the runner is temporary, and the agent still has a finite number of tool calls. Container commands have internet access, so only run tasks you trust. Prompts, answers, and the saved conversation remain publicly visible in this public repository. Never put secrets or private data in prompts or workspace files. Search results and downloaded files are untrusted data.

## Run it manually

1. Open the repository's **Actions** tab.
2. Select **Run local AI**.
3. Click **Run workflow**.
4. Enter your prompt and choose a maximum output length.
5. Wait for the run to finish.
6. Open the run's **Artifacts** section to download `ai-answer`; the latest answer is also committed to `latest-result.md`.

Every new session downloads the ~2.5 GB model. The compiled `llama.cpp` build is reused when its cache is available; otherwise it must be rebuilt.

## Conversation history and privacy

This repository is public. The workflow saves conversation history to `state/conversation.json` and the latest response to `latest-result.md`; **prompts and responses saved in these files are publicly visible**. Do not submit passwords, API keys, private personal data, or anything you do not want published. Workflow run logs and artifacts may also be accessible to people who can view the public repository.

Use **Reset conversation history** in the workflow inputs to start a new conversation. Resetting clears the saved conversation before the new prompt is processed; it does not erase previous Git commits.

## Limits

- This uses the standard GitHub-hosted runner, not a 348 GB RAM machine.
- A website chat reuses one runner/model for up to about five hours per session. After that, the next message starts a new run. Standard runners are ephemeral; there is no permanent always-on inference server.
- Model downloads and inference can be slow on CPU.
- GitHub Actions limits, cache limits, model-host availability, and workflow timeouts apply.
- The repository is public, so saved prompts and answers are public too.

## Agent skills

Skills live in `skills/`. The model can call `list_skills` and `read_skill` to load relevant guidance on demand. The Linux kernel security skill is for defensive static review: it asks for evidence-backed findings and proposed fixes, not execution of suspect code. Shell and browser actions run in isolated disposable containers without GitHub credentials.

## Architecture

```text
GitHub Actions workflow_dispatch
        |
        v
Download Qwen3-4B-Instruct-2507 GGUF model (every new session)
        |
        v
Restore compiled llama.cpp build (or compile if missing) -> run llama-server on localhost
        |
        v
Run bounded agent loop (up to 6 tool calls)
        |
        +--> web search
        +--> list/read/write files in agent_workspace/
        +--> restricted arithmetic calculator
        +--> isolated Bash container (install tools, compile, test)
        +--> isolated Playwright/Chromium browser
        +--> on-demand skills library
        |
        +--> upload agent-workspace and ai-answer artifacts
        +--> commit state/conversation.json and latest-result.md
```

## License notes

The workflow code in this repository is provided under the MIT License. The model and llama.cpp have their own licenses; see their upstream repositories for the applicable terms.
