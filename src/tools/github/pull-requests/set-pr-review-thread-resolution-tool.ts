import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the setGithubPullRequestReviewThreadResolution tool parameters
 */
export const GithubSetPrReviewThreadResolutionToolSchema = z.object({
  threadId: z
    .string()
    .describe('The Node ID of the review thread to resolve or unresolve (e.g., PRRT_kwDOABC123)'),
  resolved: z
    .boolean()
    .describe(
      'Set to true to resolve the thread (mark as addressed), or false to unresolve it (reopen for discussion)',
    ),
});

/**
 * Type for the setGithubPullRequestReviewThreadResolution tool parameters
 */
export type GithubSetPrReviewThreadResolutionToolParams = z.infer<
  typeof GithubSetPrReviewThreadResolutionToolSchema
>;

/**
 * Interface for review thread data from GraphQL
 */
interface ReviewThread {
  id: string;
  isResolved: boolean;
  viewerCanResolve: boolean;
  viewerCanUnresolve: boolean;
}

/**
 * Interface for GraphQL mutation response
 */
interface ResolveThreadResponse {
  resolveReviewThread: { thread: ReviewThread };
}

interface UnresolveThreadResponse {
  unresolveReviewThread: { thread: ReviewThread };
}

/**
 * setGithubPullRequestReviewThreadResolution - Sets the resolution status of a review thread on a pull request
 */
@Tool({
  id: 'github-set-pr-review-thread-resolution',
  name: 'setGithubPullRequestReviewThreadResolution',
  description:
    'Sets the resolution status of a review thread on a pull request. Use resolved=true to mark feedback as addressed, or resolved=false to reopen for further discussion.',
  category: 'Github: Pulls',
  parameters: GithubSetPrReviewThreadResolutionToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Set GitHub Pull Request Review Thread Resolution',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubSetPrReviewThreadResolutionTool extends GithubBaseTool {
  /**
   * Execute the tool to resolve or unresolve a PR review thread
   */
  @CatchErrors()
  async execute(args: GithubSetPrReviewThreadResolutionToolParams): Promise<string> {
    const { threadId, resolved } = args;
    const octokit = this.getClient();

    let thread: ReviewThread;

    if (resolved) {
      const response = await octokit.graphql<ResolveThreadResponse>(
        `mutation ResolveThread($threadId: ID!) {
          resolveReviewThread(input: { threadId: $threadId }) {
            thread {
              id
              isResolved
              viewerCanResolve
              viewerCanUnresolve
            }
          }
        }`,
        { threadId },
      );
      thread = response.resolveReviewThread.thread;
    } else {
      const response = await octokit.graphql<UnresolveThreadResponse>(
        `mutation UnresolveThread($threadId: ID!) {
          unresolveReviewThread(input: { threadId: $threadId }) {
            thread {
              id
              isResolved
              viewerCanResolve
              viewerCanUnresolve
            }
          }
        }`,
        { threadId },
      );
      thread = response.unresolveReviewThread.thread;
    }

    return JSON.stringify({
      success: true,
      thread: {
        id: thread.id,
        isResolved: thread.isResolved,
        viewerCanResolve: thread.viewerCanResolve,
        viewerCanUnresolve: thread.viewerCanUnresolve,
      },
      action: resolved ? 'resolved' : 'unresolved',
    });
  }
}
