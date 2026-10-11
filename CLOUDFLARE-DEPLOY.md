# Deploy the AI Runs chat to Cloudflare Pages

The website is a static frontend in `public/` plus two Cloudflare Pages Functions in `functions/api/`. The API starts and checks GitHub Actions runs; the model itself still runs on a temporary GitHub-hosted runner.

## 1. Create the Pages site

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Choose **Create application → Pages → Connect to Git**.
3. Connect the GitHub account and select `unisocsu/ai-runs`.
4. Set the production branch to `main`.
5. Set **Build command** to empty / no build command.
6. Set **Build output directory** to `public`.
7. Deploy. Cloudflare assigns a free `*.pages.dev` subdomain.

The repository root contains `functions/api/`; Cloudflare Pages Functions are deployed alongside the static site.

## 2. Configure API secrets

To let the GitHub Actions deployment workflow publish the site automatically, also add these **repository Actions secrets** in GitHub → Settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with permission to deploy Pages projects.
- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID.

Then open **Actions → Deploy AI Runs Chat Website → Run workflow** and set `deploy_to_cloudflare` to `true`. If you leave it `false`, the workflow only packages the site as a downloadable artifact.



In the Pages project, open **Settings → Variables and Secrets** and add these as encrypted secrets for Production (and Preview only if needed):

- `GITHUB_TOKEN`: a GitHub fine-grained personal access token scoped only to `unisocsu/ai-runs`, with **Actions: Read and write** and **Contents: Read-only**.
- `CHAT_ACCESS_KEY`: a long random access key that you share only with intended users.
- `CHAT_QUEUE_KEY`: a second, different long random secret used only between the GitHub runner and the private queue API.

### Configure the session queue (required for one-run multi-message chat)

1. In Cloudflare, open **Workers & Pages → KV** and create a namespace named something like `ai-runs-chat-queue`.
2. Open the Pages project → **Settings → Bindings** (or **Settings → Functions → KV namespace bindings**, depending on the dashboard layout). Add a KV namespace binding with **Variable name** `AI_QUEUE` and select the namespace you created.
3. Under Pages **Settings → Variables and Secrets**, add `CHAT_QUEUE_KEY` as an encrypted Production secret. Use the same random value as the GitHub Actions secret below.
4. In GitHub → `unisocsu/ai-runs` → **Settings → Secrets and variables → Actions**, add the repository secret `CHAT_QUEUE_KEY` with exactly the same value.
5. Save changes and redeploy the Pages site.

Generate a long random value for `CHAT_QUEUE_KEY`; do not reuse `CHAT_ACCESS_KEY`. Never put either value in repository files or frontend JavaScript. The KV queue stores pending prompts and answers temporarily (up to six hours). After saving bindings/secrets, redeploy the latest deployment.

## 3. Test

Open the Pages URL, click the gear icon, enter the `CHAT_ACCESS_KEY`, and save. Send a short message. The page will poll the API while the workflow queues, starts the model and generates the response.

## Important limitations

- This is an experimental asynchronous chat. A response can take several minutes or longer, especially on the first run.
- A chat session reuses one GitHub Actions run and its loaded model for multiple messages while the runner is alive. The runner polls the Cloudflare KV queue and ends after about five hours; a later message starts a new run.
- GitHub Actions serializes model runs; this is not a permanent inference server.
- The model conversation is shared in `state/conversation.json`, and prompts/answers are committed to this **public repository**. Do not send secrets or private information.
- Anyone who obtains the access key can start Actions runs and consume the repository's Actions quota. Rotate the key if it leaks.
- Cloudflare provides the free `pages.dev` subdomain; a custom domain requires a domain you own and add to Cloudflare.
