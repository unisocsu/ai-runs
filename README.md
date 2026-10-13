# AI Runs — local LLM on GitHub Actions

A free-first experiment that runs an open-weight language model on the CPU/RAM of a GitHub-hosted runner. It does **not** provide a permanent server: each answer is a separate GitHub Actions run.

## Model

- **Model:** DeepSeek-R1-Distill-Qwen-7B GGUF, Q4_K_M quantization
- **Runtime:** [llama.cpp](https://github.com/ggml-org/llama.cpp)
- **Runner:** `ubuntu-latest` (standard hosted runner; RAM is limited and is not configurable here)
- **Model file:** downloaded from [bartowski's DeepSeek GGUF repository](https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF)
- **Model caching:** disabled; model is downloaded afresh every workflow run

The 7B Q4_K_M file is multi-gigabyte and inference is CPU-only. Actual speed and memory use depend on the hosted runner. DeepSeek-R1 distilled models may produce reasoning-style output and are not guaranteed to outperform the previous model on every task.

This is a starting point for testing. It will not match Claude Sonnet just because it is allowed to think for longer; quality, context size, and speed depend on the model and runner.

## Website chat on Cloudflare Pages

A browser chat interface is available in `public/`, with Pages Functions in `functions/api/`. A website chat session starts one GitHub Actions run; the runner keeps the model loaded and polls a Cloudflare KV queue for further messages in that same session. To enable this, follow [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md) and configure the `AI_QUEUE` KV binding plus matching `CHAT_QUEUE_KEY` secrets in Cloudflare Pages and GitHub Actions.

The workflow does not cache the model. It downloads the multi-gigabyte Qwen GGUF file on every run. Only the `llama.cpp` CMake build directory (including the compiled `llama-server`) is cached, so a cache hit skips C++ compilation. The llama.cpp source is cloned each run. GitHub may evict caches, so a rebuild can still be needed.

## Agent tools (first version)

The inference script now runs a bounded agent loop instead of a single text completion. The workflow runs only when manually started with **Actions → Run local AI → Run workflow** (`workflow_dispatch`); it has no push or schedule trigger. It can:

- Search the web and inspect returned snippets/links.
- Create, list, and read files only inside `agent_workspace/`.
- Calculate arithmetic using a restricted expression parser.
- Run Bash commands in a disposable Ubuntu Docker container, including shell pipelines, scripts, downloads, package installation, compilation, and tests.
- The container has internet access and only `agent_workspace/` mounted from the runner. Its filesystem is discarded after each command; the mounted workspace persists and is uploaded as the `agent-workspace` artifact.
- Each Bash call has a 180-second timeout, 1 GB memory limit, 2 CPU limit, 256-process limit, and output capped at 12 KB.
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

Every run downloads a multi-gigabyte model. The compiled `llama.cpp` build is reused when its cache is available; otherwise it must be rebuilt.

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
Download DeepSeek-R1-Distill-Qwen-7B GGUF model (every run)
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
