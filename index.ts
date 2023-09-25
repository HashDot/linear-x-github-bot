import { LinearClient } from "@linear/sdk";
import { Octokit } from "octokit";
import { createHmac } from "crypto";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN as string;
const GITHUB_OWNER = process.env.GITHUB_OWNER as string;
const GITHUB_REPO = process.env.GITHUB_REPO as string;

const LINEAR_TOKEN = process.env.LINEAR_TOKEN as string;
const LINEAR_WEBHOOK_SECRET = process.env.LINEAR_WEBHOOK_SECRET as string;

const linearClient = new LinearClient({
  apiKey: LINEAR_TOKEN,
});

const githubClient = new Octokit({
  auth: GITHUB_TOKEN,
});

const createIssuePR = async ({
  identifier,
  number,
}: {
  identifier: string;
  number: number;
}) => {
  const issue = await getLinearIssue({ identifier, number });
  try {
    await githubClient.rest.repos.getBranch({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      branch: issue.branchName,
    });

    console.log("branch already exists");
    return;
  } catch (error: any) {
    if (error.message === "Branch not found") {
      if (!issue.parent) {
        try {
          console.log("Create new branch from main");
          const { data } = await githubClient.rest.repos.getBranch({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            branch: "main",
          });

          return await githubClient.rest.git.createRef({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            ref: `refs/heads/${issue.branchName}`,
            sha: data.commit.sha,
          });
        } catch (error: any) {
          throw new Error(error);
        }
      }

      if (issue.parent) {
        try {
          console.log("Create new branch from parent");
          const { data } = await githubClient.rest.repos.getBranch({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            branch: issue.parent.branchName,
          });

          return await githubClient.rest.git.createRef({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            ref: `refs/heads/${issue.branchName}`,
            sha: data.commit.sha,
          });
        } catch (error: any) {
          throw new Error(error);
        }
      }

      console.log("Something went wrong");
      return;
    }

    throw new Error(error);
  }
};

const getLinearIssue = async ({
  identifier,
  number,
}: {
  identifier: string;
  number: number;
}) => {
  const issue = await linearClient.issue(`${identifier}-${number}`);
  return {
    branchName: issue.branchName,
    parent: await issue.parent,
  };
};

const createPR = async ({ webhook }: { webhook: any }) => {
  if (webhook.type === "Issue") {
    const issue = webhook.data;

    if (issue.state?.type === "started") {
      createIssuePR({
        identifier: webhook.data.team.key,
        number: webhook.data.number,
      });
    }
  }
};

import { Elysia } from "elysia";

new Elysia()
  .post("/", ({ body, request }) => {
    const signature = createHmac("sha256", LINEAR_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest("hex");

    if (signature !== request.headers.get("linear-signature")) {
      return "invalid signature";
    }
    createPR({ webhook: body });
    return "Rick & Morty";
  })
  .listen(8080);

console.log(`Linear x GitHub Bot`);
