/**
 * comments-tool.ts — read and add comments on a work item, epic or feature.
 *
 * Where the discussion about a piece of work lives. Rova exposes the same shape under two
 * parents, `/work-items/:id/comments` and `/portfolio-items/:id/comments`, so one pair of
 * tools covers both rather than four nearly identical descriptions.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { rovaItems, rovaRequest, type RovaPage } from './api';

/** Which collection an item belongs to. Work items and portfolio items are separate tables. */
export const ROVA_COMMENT_PARENTS = ['work-item', 'portfolio-item'] as const;

interface RovaComment {
  id?: string;
  body?: string;
  authorId?: string;
  authorName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

/**
 * Build the comments path for a parent.
 *
 * @param parent - Which collection the id belongs to
 * @param id - The parent item's id
 * @returns Path to that item's comments
 */
function commentsPath(parent: (typeof ROVA_COMMENT_PARENTS)[number], id: string): string {
  const base = parent === 'work-item' ? 'work-items' : 'portfolio-items';
  return `/${base}/${encodeURIComponent(id)}/comments`;
}

export const ListRovaCommentsSchema = z.object({
  parent: z
    .enum(ROVA_COMMENT_PARENTS)
    .default('work-item')
    .describe('Whether the id is a work item (story, task, defect) or a portfolio item (epic, feature)'),
  id: z.string().min(1).describe('Id of the item whose comments to read'),
  limit: z.number().int().min(1).max(100).default(50).describe('Maximum comments to return'),
});

export type ListRovaCommentsParams = z.input<typeof ListRovaCommentsSchema>;

@Tool({
  id: 'rova-list-comments',
  name: 'listRovaComments',
  description:
    'Read the comments on a Rova work item, epic or feature. Use before replying, or to find what was decided about a piece of work.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: ListRovaCommentsSchema,
  version: '1.0.0',
  annotations: { title: 'List Rova Comments', readOnlyHint: true, openWorldHint: true },
})
export class ListRovaCommentsTool implements ToolHandler {
  /**
   * Read a comment thread.
   *
   * @param args - Parent kind, id and a limit
   * @returns JSON string of comments oldest first
   */
  @CatchErrors()
  async execute(args: ListRovaCommentsParams): Promise<string> {
    const { parent, id, limit } = ListRovaCommentsSchema.parse(args);
    const body = await rovaRequest<RovaPage<RovaComment>>(
      `${commentsPath(parent, id)}?limit=${limit}`,
    );
    const comments = rovaItems(body)
      // Deletion is soft, so removed comments come back and would otherwise be read as
      // part of the conversation.
      .filter((comment) => !comment.isDeleted);

    return JSON.stringify(
      {
        parent,
        id,
        count: comments.length,
        comments: comments.map((comment) => ({
          id: comment.id,
          by: comment.authorName || undefined,
          at: comment.createdAt,
          ...(comment.updatedAt && comment.updatedAt !== comment.createdAt
            ? { edited: comment.updatedAt }
            : {}),
          body: comment.body,
        })),
      },
      null,
      2,
    );
  }
}

export const AddRovaCommentSchema = z.object({
  parent: z
    .enum(ROVA_COMMENT_PARENTS)
    .default('work-item')
    .describe('Whether the id is a work item or a portfolio item'),
  id: z.string().min(1).describe('Id of the item to comment on'),
  body: z.string().min(1).max(50_000).describe('The comment text'),
});

export type AddRovaCommentParams = z.input<typeof AddRovaCommentSchema>;

@Tool({
  id: 'rova-add-comment',
  name: 'addRovaComment',
  description:
    'Add a comment to a Rova work item, epic or feature, as the signed-in user. Use to record a decision or an update against the work it concerns.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: AddRovaCommentSchema,
  version: '1.0.0',
  annotations: {
    title: 'Add Rova Comment',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
})
export class AddRovaCommentTool implements ToolHandler {
  /**
   * Post a comment.
   *
   * @param args - Parent kind, id and the text
   * @returns JSON string confirming the comment
   */
  @CatchErrors()
  async execute(args: AddRovaCommentParams): Promise<string> {
    const { parent, id, body } = AddRovaCommentSchema.parse(args);
    const created = await rovaRequest<RovaComment>(commentsPath(parent, id), {
      method: 'POST',
      body: JSON.stringify({ body }),
    });

    return JSON.stringify(
      { added: true, commentId: created.id, parent, id, by: created.authorName || undefined },
      null,
      2,
    );
  }
}
