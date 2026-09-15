/**
 * search-people-tool.ts — find a colleague in the organisation directory.
 *
 * The question this answers is asked constantly and by everyone, not just engineers:
 * who is this person, what do they do, how do I reach them, who do they report to.
 * Without it that information has to be looked up by hand in a portal.
 *
 * Read-only and delegated, like the rest of the Microsoft tools, so it returns only
 * what the signed-in person can already see in the address book.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { graphRequest } from './api';

export const SearchMicrosoftPeopleSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Name or email address to look for, e.g. "Nghia" or "nghiavt"'),
  limit: z.number().int().min(1).max(25).default(10).describe('Maximum people to return'),
});

export type SearchMicrosoftPeopleParams = z.input<typeof SearchMicrosoftPeopleSchema>;

interface DirectoryResponse {
  value?: {
    id?: string;
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
    jobTitle?: string | null;
    department?: string | null;
    officeLocation?: string | null;
    mobilePhone?: string | null;
    businessPhones?: string[];
    accountEnabled?: boolean;
  }[];
}

@Tool({
  id: 'microsoft-search-people',
  name: 'searchMicrosoftPeople',
  description:
    'Look up colleagues in the organisation directory by name or email address. Use for questions about who someone is or how to contact them. Returns job title and department when the directory holds them.',
  category: 'Microsoft 365',
  parameters: SearchMicrosoftPeopleSchema,
  version: '1.0.0',
  annotations: {
    title: 'Search Microsoft People',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class SearchMicrosoftPeopleTool implements ToolHandler {
  /**
   * Search the directory.
   *
   * @param args - Text to match, and a result limit
   * @returns JSON string of matching people
   */
  @CatchErrors()
  async execute(args: SearchMicrosoftPeopleParams): Promise<string> {
    const { query, limit } = SearchMicrosoftPeopleSchema.parse(args);

    // Quotes are part of Graph's $search syntax here, so a quote in the input would
    // change the meaning of the query rather than being searched for.
    const escaped = query.replace(/"/g, '');
    // Name and email fields only. jobTitle and department are not searchable with
    // User.ReadBasic.All, and including either makes Graph reject the whole query with
    // Authorization_RequestDenied — a message that points at the scope rather than the
    // field, which is thoroughly misleading. Filtering on them is refused as well, so
    // there is no way to reach them under this permission. They are still returned when
    // the directory holds them, which in this tenant it currently does not.
    const fields = ['displayName', 'mail', 'userPrincipalName', 'givenName', 'surname'];
    const search = fields.map((field) => `"${field}:${escaped}"`).join(' OR ');
    const select =
      'id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones,accountEnabled';

    const response = await graphRequest<DirectoryResponse>(
      `/users?$search=${encodeURIComponent(search)}&$top=${limit}&$select=${select}`,
      {
        // $search on /users is only served against the eventually consistent index,
        // and Graph rejects the request outright without this header.
        headers: { ConsistencyLevel: 'eventual' },
      },
    );

    const people = (response.value ?? [])
      // Leavers stay in the directory with the account disabled. Returning them as
      // equivalent to current staff sends people chasing an address nobody reads.
      .filter((person) => person.accountEnabled !== false);

    return JSON.stringify(
      {
        query,
        count: people.length,
        ...(people.length === 0
          ? {
              note: 'No enabled accounts matched. Graph matches from the start of a word, so a partial surname works while a fragment from the middle of one does not. Searching by job title or department is not possible with the permission this uses.',
            }
          : {}),
        people: people.map((person) => ({
          name: person.displayName,
          email: person.mail || person.userPrincipalName,
          jobTitle: person.jobTitle || undefined,
          department: person.department || undefined,
          office: person.officeLocation || undefined,
          phone: person.mobilePhone || person.businessPhones?.[0] || undefined,
        })),
      },
      null,
      2,
    );
  }
}
