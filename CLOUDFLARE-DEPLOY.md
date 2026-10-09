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

In the Pages project, open **Settings → Variables and Secrets** and add these as encrypted secrets for Production (and Preview only if needed):

- `GITHUB_TOKEN`: a GitHub fine-grained personal access token scoped only to `unisocsu/ai-runs`, with **Actions: Read and write** and **Contents: Read-only**.
- `CHAT_ACCESS_KEY`: a long random access key that you share only with intended users.

Do not put either secret in this repository or in `public/app.js`. After saving secrets, redeploy the latest deployment.

## 3. Test

Open the Pages URL, click the gear icon, enter the `CHAT_ACCESS_KEY`, and save. Send a short message. The page will poll the API while the workflow queues, starts the model and generates the response.

## Important limitations

- This is an experimental asynchronous chat. A response can take several minutes or longer, especially on the first run.
- GitHub Actions serializes model runs; this is not a continuously running inference server.
- The model conversation is shared in `state/conversation.json`, and prompts/answers are committed to this **public repository**. Do not send secrets or private information.
- Anyone who obtains the access key can start Actions runs and consume the repository's Actions quota. Rotate the key if it leaks.
- Cloudflare provides the free `pages.dev` subdomain; a custom domain requires a domain you own and add to Cloudflare.
