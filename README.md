# AI Runs — local LLM on GitHub Actions

A free-first experiment that runs an open-weight language model on the CPU/RAM of a GitHub-hosted runner. It does **not** provide a permanent server: each answer is a separate GitHub Actions run.

## First model

- **Model:** Qwen3-8B GGUF, Q4_K_M quantization
- **Runtime:** [llama.cpp](https://github.com/ggml-org/llama.cpp)
- **Runner:** `ubuntu-latest` (standard hosted runner; RAM is limited and is not configurable here)
- **Model file:** downloaded from the official [Qwen GGUF repository](https://huggingface.co/Qwen/Qwen3-8B-GGUF)
- **Model caching:** disabled; model is downloaded afresh every workflow run

This is a starting point for testing. It will not match Claude Sonnet just because it is allowed to think for longer; quality, context size, and speed depend on the model and runner.

## Website chat on Cloudflare Pages

A browser chat interface is available in `public/`, with Pages Functions in `functions/api/` that dispatch and poll GitHub Actions. To publish it, follow [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md). Cloudflare Pages can assign a free `*.pages.dev` address. You must configure encrypted `GITHUB_TOKEN` and `CHAT_ACCESS_KEY` secrets in Cloudflare Pages before the chat can start runs.

The workflow does not cache the model. It downloads the multi-gigabyte Qwen GGUF file on every run. Only the `llama.cpp` CMake build directory (including the compiled `llama-server`) is cached, so a cache hit skips C++ compilation. The llama.cpp source is cloned each run. GitHub may evict caches, so a rebuild can still be needed.

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
- Standard runners are ephemeral; there is no always-on API or live chat website yet.
- Model downloads and inference can be slow on CPU.
- GitHub Actions limits, cache limits, model-host availability, and workflow timeouts apply.
- The repository is public, so saved prompts and answers are public too.

## Architecture

```text
GitHub Actions workflow_dispatch
        |
        v
Download Qwen3 GGUF model (every run)
        |
        v
Restore compiled llama.cpp build (or compile if missing) -> run llama-server on localhost
        |
        v
Send conversation to local OpenAI-compatible endpoint
        |
        +--> upload ai-answer artifact
        +--> commit state/conversation.json and latest-result.md
```

## License notes

The workflow code in this repository is provided under the MIT License. The model and llama.cpp have their own licenses; see their upstream repositories for the applicable terms.
