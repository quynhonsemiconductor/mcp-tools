import { mock } from 'bun:test';

/**
 * Standard set of mock data for GitHub tests
 */
export const MOCK_DATA = {
  issue: {
    id: 123,
    number: 42,
    title: 'Test Issue',
    state: 'open',
    body: 'This is a test issue',
    user: {
      login: 'testuser',
    },
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
  },
  // GitHub Discussion mock data
  teamDiscussion: {
    id: 567,
    node_id: 'MDEwOlRlYW1EaXNjdXNzaW9uNTY3',
    number: 1,
    title: 'Test Team Discussion',
    body: 'This is a test team discussion',
    author: {
      login: 'testuser',
    },
    private: false,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
    team_url: 'https://api.github.com/teams/1/discussions',
  },
  teamDiscussionComment: {
    id: 890,
    node_id: 'MDExOlRlYW1EaXNjdXNzaW9uQ29tbWVudDg5MA==',
    discussion_number: 1,
    number: 1,
    body: 'This is a test team discussion comment',
    author: {
      login: 'testuser',
    },
    created_at: '2023-01-03T00:00:00Z',
    updated_at: '2023-01-04T00:00:00Z',
    discussion_url: 'https://api.github.com/teams/1/discussions/1',
  },
  reaction: {
    id: 1,
    node_id: 'MDg6UmVhY3Rpb24x',
    user: {
      login: 'testuser',
      id: 12345,
    },
    content: '+1',
    created_at: '2023-01-05T00:00:00Z',
  },
  issueComment: {
    id: 101,
    body: 'This is a test comment',
    user: {
      login: 'testuser',
    },
    created_at: '2023-01-03T00:00:00Z',
    updated_at: '2023-01-03T00:00:00Z',
  },
  issueComments: [
    {
      id: 101,
      body: 'First comment',
      user: { login: 'testuser1' },
      created_at: '2023-01-03T00:00:00Z',
    },
    {
      id: 102,
      body: 'Second comment',
      user: { login: 'testuser2' },
      created_at: '2023-01-04T00:00:00Z',
    },
  ],
  repo: {
    id: 456,
    name: 'test-repo',
    full_name: 'testorg/test-repo',
    private: false,
    owner: {
      login: 'testorg',
    },
  },
  pullRequest: {
    id: 789,
    number: 27,
    title: 'Test PR',
    state: 'open',
    body: 'This is a test pull request',
    head: {
      ref: 'feature-branch',
      sha: '1234567890abcdef',
    },
    base: {
      ref: 'main',
      sha: 'abcdef1234567890',
    },
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
  },
  pullRequestFiles: [
    {
      sha: 'abc123',
      filename: 'src/index.js',
      status: 'modified',
      additions: 10,
      deletions: 5,
      changes: 15,
      blob_url: 'https://github.com/testorg/test-repo/blob/abc123/src/index.js',
      raw_url: 'https://github.com/testorg/test-repo/raw/abc123/src/index.js',
      contents_url:
        'https://api.github.com/repos/testorg/test-repo/contents/src/index.js?ref=abc123',
      patch: '@@ -1,5 +1,10 @@ class Example {}',
    },
    {
      sha: 'def456',
      filename: 'README.md',
      status: 'modified',
      additions: 3,
      deletions: 1,
      changes: 4,
      blob_url: 'https://github.com/testorg/test-repo/blob/def456/README.md',
      raw_url: 'https://github.com/testorg/test-repo/raw/def456/README.md',
      contents_url: 'https://api.github.com/repos/testorg/test-repo/contents/README.md?ref=def456',
      patch: '@@ -1,3 +1,5 @@ # Test Repository',
    },
  ],
  pullRequestComments: [
    {
      id: 201,
      body: 'Comment on the pull request',
      user: { login: 'reviewer1' },
      created_at: '2023-01-03T10:00:00Z',
      updated_at: '2023-01-03T10:00:00Z',
    },
    {
      id: 202,
      body: 'Another comment on the PR',
      user: { login: 'reviewer2' },
      created_at: '2023-01-04T11:00:00Z',
      updated_at: '2023-01-04T11:00:00Z',
    },
  ],
  pullRequestReviews: [
    {
      id: 301,
      user: { login: 'reviewer1' },
      body: 'Looks good!',
      state: 'APPROVED',
      submitted_at: '2023-01-05T00:00:00Z',
    },
    {
      id: 302,
      user: { login: 'reviewer2' },
      body: 'Please make these changes',
      state: 'CHANGES_REQUESTED',
      submitted_at: '2023-01-06T00:00:00Z',
    },
  ],
  combinedStatus: {
    state: 'success',
    statuses: [
      {
        context: 'ci/travis',
        state: 'success',
        description: 'The Travis CI build passed',
        target_url: 'https://travis-ci.org/testorg/test-repo/builds/123',
      },
      {
        context: 'continuous-integration/jenkins',
        state: 'success',
        description: 'The Jenkins CI build passed',
        target_url: 'https://jenkins.testorg.com/job/test-repo/123',
      },
    ],
    sha: '1234567890abcdef',
    total_count: 2,
  },
  searchResults: {
    total_count: 2,
    incomplete_results: false,
    items: [
      {
        id: 123,
        number: 42,
        title: 'Test Issue',
        state: 'open',
        body: 'This is a test issue',
        repository: {
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
        user: {
          login: 'testuser',
        },
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
      },
      {
        id: 124,
        number: 43,
        title: 'Another Test Issue',
        state: 'closed',
        body: 'This is another test issue',
        repository: {
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
        user: {
          login: 'testuser',
        },
        created_at: '2023-01-03T00:00:00Z',
        updated_at: '2023-01-04T00:00:00Z',
      },
    ],
  },
  codeSearchResults: {
    total_count: 2,
    incomplete_results: false,
    items: [
      {
        name: 'file1.js',
        path: 'src/file1.js',
        sha: '1234567890abcdef',
        repository: {
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
        score: 0.9,
        html_url: 'https://github.com/testorg/test-repo/blob/main/src/file1.js',
      },
      {
        name: 'file2.js',
        path: 'src/file2.js',
        sha: 'abcdef1234567890',
        repository: {
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
        score: 0.8,
        html_url: 'https://github.com/testorg/test-repo/blob/main/src/file2.js',
      },
    ],
  },
  commitsSearchResults: {
    total_count: 2,
    incomplete_results: false,
    items: [
      {
        sha: '1234567890abcdef',
        commit: {
          message: 'First commit message',
          author: {
            name: 'Test User',
            email: 'test@example.com',
            date: '2023-01-01T12:00:00Z',
          },
        },
        author: {
          login: 'testuser',
        },
        repository: {
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
      },
      {
        sha: 'abcdef1234567890',
        commit: {
          message: 'Second commit message',
          author: {
            name: 'Another User',
            email: 'another@example.com',
            date: '2023-01-02T12:00:00Z',
          },
        },
        author: {
          login: 'anotheruser',
        },
        repository: {
          name: 'test-repo',
          full_name: 'testorg/test-repo',
        },
      },
    ],
  },
  reposSearchResults: {
    total_count: 2,
    incomplete_results: false,
    items: [
      {
        id: 12345,
        name: 'test-repo',
        full_name: 'testorg/test-repo',
        private: false,
        html_url: 'https://github.com/testorg/test-repo',
        description: 'Test repository',
        owner: {
          login: 'testorg',
        },
        stargazers_count: 10,
        watchers_count: 5,
        language: 'TypeScript',
        forks_count: 3,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-15T00:00:00Z',
      },
      {
        id: 67890,
        name: 'another-repo',
        full_name: 'testorg/another-repo',
        private: true,
        html_url: 'https://github.com/testorg/another-repo',
        description: 'Another test repository',
        owner: {
          login: 'testorg',
        },
        stargazers_count: 20,
        watchers_count: 8,
        language: 'JavaScript',
        forks_count: 5,
        created_at: '2023-02-01T00:00:00Z',
        updated_at: '2023-02-15T00:00:00Z',
      },
    ],
  },
  // GitHub Branches mock data
  branch: {
    name: 'main',
    commit: {
      sha: '1234567890abcdef',
      url: 'https://api.github.com/repos/testorg/test-repo/commits/1234567890abcdef',
    },
    protected: true,
    protection: {
      enabled: true,
      required_status_checks: {
        enforcement_level: 'non_admins',
        contexts: ['ci/travis-ci'],
      },
    },
    protection_url: 'https://api.github.com/repos/testorg/test-repo/branches/main/protection',
  },
  branches: [
    {
      name: 'main',
      commit: {
        sha: '1234567890abcdef',
        url: 'https://api.github.com/repos/testorg/test-repo/commits/1234567890abcdef',
      },
      protected: true,
    },
    {
      name: 'feature-branch',
      commit: {
        sha: 'abcdef1234567890',
        url: 'https://api.github.com/repos/testorg/test-repo/commits/abcdef1234567890',
      },
      protected: false,
    },
    {
      name: 'bugfix-branch',
      commit: {
        sha: '9876543210fedcba',
        url: 'https://api.github.com/repos/testorg/test-repo/commits/9876543210fedcba',
      },
      protected: false,
    },
  ],
  renameBranchResponse: {
    name: 'new-branch-name',
    commit: {
      sha: 'abcdef1234567890',
      url: 'https://api.github.com/repos/testorg/test-repo/commits/abcdef1234567890',
    },
    protected: false,
  },
  mergeResponse: {
    sha: 'mergedabcdef123456',
    merged: true,
    message: 'Pull Request successfully merged',
  },
  createRefResponse: {
    ref: 'refs/heads/new-branch',
    node_id: 'MDM6UmVmcmVmcy9oZWFkcy9uZXctYnJhbmNo',
    url: 'https://api.github.com/repos/testorg/test-repo/git/refs/heads/new-branch',
    object: {
      sha: 'abc123def456',
      type: 'commit',
      url: 'https://api.github.com/repos/testorg/test-repo/git/commits/abc123def456',
    },
  },
  createOrUpdateFileContentsResponse: {
    content: {
      name: 'catalog.yaml',
      path: '.qnsc/catalog.yaml',
      sha: 'def456abc789',
      size: 128,
      url: 'https://api.github.com/repos/testorg/test-repo/contents/.qnsc/catalog.yaml',
      html_url: 'https://github.com/testorg/test-repo/blob/main/.qnsc/catalog.yaml',
      git_url: 'https://api.github.com/repos/testorg/test-repo/git/blobs/def456abc789',
      download_url: 'https://github.com/testorg/test-repo/raw/main/.qnsc/catalog.yaml',
      type: 'file',
    },
    commit: {
      sha: 'commit789abc123',
      node_id: 'MDY6Q29tbWl0Y29tbWl0Nzg5YWJjMTIz',
      url: 'https://api.github.com/repos/testorg/test-repo/git/commits/commit789abc123',
      html_url: 'https://github.com/testorg/test-repo/commit/commit789abc123',
      author: {
        name: 'Test Author',
        email: 'author@example.com',
        date: '2023-01-01T12:00:00Z',
      },
      committer: {
        name: 'Test Committer',
        email: 'committer@example.com',
        date: '2023-01-01T12:00:00Z',
      },
      message: 'Add catalog.yaml file',
    },
  },
  // GitHub Actions mock data
  workflow: {
    id: 5678,
    node_id: 'MDg6V29ya2Zsb3c1Njc4',
    name: 'CI',
    path: '.github/workflows/ci.yml',
    state: 'active',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
    url: 'https://api.github.com/repos/testorg/test-repo/actions/workflows/5678',
    html_url: 'https://github.com/testorg/test-repo/blob/main/.github/workflows/ci.yml',
    badge_url: 'https://github.com/testorg/test-repo/workflows/CI/badge.svg',
  },
  workflows: [
    {
      id: 5678,
      node_id: 'MDg6V29ya2Zsb3c1Njc4',
      name: 'CI',
      path: '.github/workflows/ci.yml',
      state: 'active',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
      url: 'https://api.github.com/repos/testorg/test-repo/actions/workflows/5678',
      html_url: 'https://github.com/testorg/test-repo/blob/main/.github/workflows/ci.yml',
      badge_url: 'https://github.com/testorg/test-repo/workflows/CI/badge.svg',
    },
    {
      id: 9012,
      node_id: 'MDg6V29ya2Zsb3c5MDEy',
      name: 'Release',
      path: '.github/workflows/release.yml',
      state: 'active',
      created_at: '2023-01-10T00:00:00Z',
      updated_at: '2023-01-11T00:00:00Z',
      url: 'https://api.github.com/repos/testorg/test-repo/actions/workflows/9012',
      html_url: 'https://github.com/testorg/test-repo/blob/main/.github/workflows/release.yml',
      badge_url: 'https://github.com/testorg/test-repo/workflows/Release/badge.svg',
    },
  ],
  workflowRun: {
    id: 12345,
    name: 'CI',
    node_id: 'MDExOldvcmtmbG93UnVuMTIzNDU=',
    head_branch: 'main',
    head_sha: '1234567890abcdef',
    run_number: 42,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    workflow_id: 5678,
    workflow_url: 'https://api.github.com/repos/testorg/test-repo/actions/workflows/5678',
    html_url: 'https://github.com/testorg/test-repo/actions/runs/12345',
    created_at: '2023-01-15T00:00:00Z',
    updated_at: '2023-01-15T00:10:00Z',
    run_attempt: 1,
    run_started_at: '2023-01-15T00:00:00Z',
  },
  workflowRuns: [
    {
      id: 12345,
      name: 'CI',
      node_id: 'MDExOldvcmtmbG93UnVuMTIzNDU=',
      head_branch: 'main',
      head_sha: '1234567890abcdef',
      run_number: 42,
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      workflow_id: 5678,
      workflow_url: 'https://api.github.com/repos/testorg/test-repo/actions/workflows/5678',
      html_url: 'https://github.com/testorg/test-repo/actions/runs/12345',
      created_at: '2023-01-15T00:00:00Z',
      updated_at: '2023-01-15T00:10:00Z',
      run_attempt: 1,
      run_started_at: '2023-01-15T00:00:00Z',
    },
    {
      id: 12346,
      name: 'CI',
      node_id: 'MDExOldvcmtmbG93UnVuMTIzNDY=',
      head_branch: 'feature',
      head_sha: 'abcdef1234567890',
      run_number: 43,
      event: 'pull_request',
      status: 'in_progress',
      workflow_id: 5678,
      workflow_url: 'https://api.github.com/repos/testorg/test-repo/actions/workflows/5678',
      html_url: 'https://github.com/testorg/test-repo/actions/runs/12346',
      created_at: '2023-01-16T00:00:00Z',
      updated_at: '2023-01-16T00:05:00Z',
      run_attempt: 1,
      run_started_at: '2023-01-16T00:00:00Z',
    },
  ],
  workflowJob: {
    id: 3456,
    run_id: 12345,
    workflow_name: 'CI',
    head_sha: '1234567890abcdef',
    run_url: 'https://api.github.com/repos/testorg/test-repo/actions/runs/12345',
    run_attempt: 1,
    node_id: 'MDg6Q2hlY2tSdW4zNDU2',
    name: 'build',
    steps: [
      {
        name: 'Set up Node.js',
        status: 'completed',
        conclusion: 'success',
        number: 1,
        started_at: '2023-01-15T00:01:00Z',
        completed_at: '2023-01-15T00:02:00Z',
      },
      {
        name: 'Install dependencies',
        status: 'completed',
        conclusion: 'success',
        number: 2,
        started_at: '2023-01-15T00:02:00Z',
        completed_at: '2023-01-15T00:04:00Z',
      },
      {
        name: 'Run tests',
        status: 'completed',
        conclusion: 'success',
        number: 3,
        started_at: '2023-01-15T00:04:00Z',
        completed_at: '2023-01-15T00:06:00Z',
      },
    ],
    status: 'completed',
    conclusion: 'success',
    started_at: '2023-01-15T00:01:00Z',
    completed_at: '2023-01-15T00:06:00Z',
    html_url: 'https://github.com/testorg/test-repo/actions/runs/12345/jobs/3456',
    url: 'https://api.github.com/repos/testorg/test-repo/actions/jobs/3456',
    runner_id: 1,
    runner_name: 'GitHub Actions 1',
    runner_group_id: 1,
    runner_group_name: 'Default',
  },
  workflowJobs: [
    {
      id: 3456,
      run_id: 12345,
      workflow_name: 'CI',
      head_sha: '1234567890abcdef',
      run_url: 'https://api.github.com/repos/testorg/test-repo/actions/runs/12345',
      run_attempt: 1,
      node_id: 'MDg6Q2hlY2tSdW4zNDU2',
      name: 'build',
      steps: [
        {
          name: 'Set up Node.js',
          status: 'completed',
          conclusion: 'success',
          number: 1,
          started_at: '2023-01-15T00:01:00Z',
          completed_at: '2023-01-15T00:02:00Z',
        },
        {
          name: 'Install dependencies',
          status: 'completed',
          conclusion: 'success',
          number: 2,
          started_at: '2023-01-15T00:02:00Z',
          completed_at: '2023-01-15T00:04:00Z',
        },
        {
          name: 'Run tests',
          status: 'completed',
          conclusion: 'success',
          number: 3,
          started_at: '2023-01-15T00:04:00Z',
          completed_at: '2023-01-15T00:06:00Z',
        },
      ],
      status: 'completed',
      conclusion: 'success',
      started_at: '2023-01-15T00:01:00Z',
      completed_at: '2023-01-15T00:06:00Z',
      html_url: 'https://github.com/testorg/test-repo/actions/runs/12345/jobs/3456',
      url: 'https://api.github.com/repos/testorg/test-repo/actions/jobs/3456',
      runner_id: 1,
      runner_name: 'GitHub Actions 1',
      runner_group_id: 1,
      runner_group_name: 'Default',
    },
    {
      id: 3457,
      run_id: 12345,
      workflow_name: 'CI',
      head_sha: '1234567890abcdef',
      run_url: 'https://api.github.com/repos/testorg/test-repo/actions/runs/12345',
      run_attempt: 1,
      node_id: 'MDg6Q2hlY2tSdW4zNDU3',
      name: 'deploy',
      steps: [
        {
          name: 'Deploy to staging',
          status: 'completed',
          conclusion: 'success',
          number: 1,
          started_at: '2023-01-15T00:07:00Z',
          completed_at: '2023-01-15T00:08:00Z',
        },
      ],
      status: 'completed',
      conclusion: 'success',
      started_at: '2023-01-15T00:07:00Z',
      completed_at: '2023-01-15T00:08:00Z',
      html_url: 'https://github.com/testorg/test-repo/actions/runs/12345/jobs/3457',
      url: 'https://api.github.com/repos/testorg/test-repo/actions/jobs/3457',
      runner_id: 1,
      runner_name: 'GitHub Actions 1',
      runner_group_id: 1,
      runner_group_name: 'Default',
    },
  ],
  workflowDispatchResponse: {
    message: 'Workflow dispatch event created.',
  },
  // Dependabot mock data
  dependabotAlerts: [
    {
      number: 1,
      state: 'open',
      dependency: {
        package: {
          ecosystem: 'npm',
          name: 'lodash',
        },
        manifest_path: 'package.json',
        scope: 'runtime',
      },
      security_advisory: {
        ghsa_id: 'GHSA-p6mc-m468-83gw',
        cve_id: 'CVE-2021-23337',
        summary: 'Prototype Pollution in lodash',
        description: 'This is a test description for a mock vulnerability',
        severity: 'high',
        vulnerabilities: [],
        references: [],
        published_at: '2021-02-15T20:13:56Z',
        updated_at: '2021-02-20T00:12:31Z',
      },
      security_vulnerability: {
        package: {
          ecosystem: 'npm',
          name: 'lodash',
        },
        vulnerable_version_range: '<=4.17.20',
        first_patched_version: {
          identifier: '4.17.21',
        },
      },
      url: 'https://api.github.com/repos/testorg/test-repo/dependabot/alerts/1',
      html_url: 'https://github.com/testorg/test-repo/security/dependabot/1',
      created_at: '2023-01-15T00:00:00Z',
      updated_at: '2023-01-15T00:10:00Z',
      dismissed_at: null,
      dismissed_by: null,
      dismissed_reason: null,
      dismissed_comment: null,
      fixed_at: null,
    },
    {
      number: 2,
      state: 'dismissed',
      dependency: {
        package: {
          ecosystem: 'npm',
          name: 'axios',
        },
        manifest_path: 'package.json',
        scope: 'runtime',
      },
      security_advisory: {
        ghsa_id: 'GHSA-wf5p-g6vw-pvj6',
        cve_id: 'CVE-2023-45857',
        summary: 'Server-Side Request Forgery in axios',
        description: 'This is a test description for a mock vulnerability',
        severity: 'medium',
        vulnerabilities: [],
        references: [],
        published_at: '2023-10-10T16:00:00Z',
        updated_at: '2023-10-15T00:00:00Z',
      },
      security_vulnerability: {
        package: {
          ecosystem: 'npm',
          name: 'axios',
        },
        vulnerable_version_range: '<1.6.0',
        first_patched_version: {
          identifier: '1.6.0',
        },
      },
      url: 'https://api.github.com/repos/testorg/test-repo/dependabot/alerts/2',
      html_url: 'https://github.com/testorg/test-repo/security/dependabot/2',
      created_at: '2023-10-12T00:00:00Z',
      updated_at: '2023-10-12T12:00:00Z',
      dismissed_at: '2023-10-12T12:00:00Z',
      dismissed_by: {
        login: 'testuser',
      },
      dismissed_reason: 'no_bandwidth',
      dismissed_comment: 'Will fix in next sprint',
      fixed_at: null,
    },
  ],
  dependabotAlert: {
    number: 1,
    state: 'open',
    dependency: {
      package: {
        ecosystem: 'npm',
        name: 'lodash',
      },
      manifest_path: 'package.json',
      scope: 'runtime',
    },
    security_advisory: {
      ghsa_id: 'GHSA-p6mc-m468-83gw',
      cve_id: 'CVE-2021-23337',
      summary: 'Prototype Pollution in lodash',
      description: 'This is a test description for a mock vulnerability',
      severity: 'high',
      vulnerabilities: [],
      references: [],
      published_at: '2021-02-15T20:13:56Z',
      updated_at: '2021-02-20T00:12:31Z',
    },
    security_vulnerability: {
      package: {
        ecosystem: 'npm',
        name: 'lodash',
      },
      vulnerable_version_range: '<=4.17.20',
      first_patched_version: {
        identifier: '4.17.21',
      },
    },
    url: 'https://api.github.com/repos/testorg/test-repo/dependabot/alerts/1',
    html_url: 'https://github.com/testorg/test-repo/security/dependabot/1',
    created_at: '2023-01-15T00:00:00Z',
    updated_at: '2023-01-15T00:10:00Z',
    dismissed_at: null,
    dismissed_by: null,
    dismissed_reason: null,
    dismissed_comment: null,
    fixed_at: null,
  },
  // GitHub Organizations mock data
  org: {
    login: 'testorg',
    id: 54321,
    node_id: 'MDEyOk9yZ2FuaXphdGlvbjU0MzIx',
    url: 'https://api.github.com/orgs/testorg',
    repos_url: 'https://api.github.com/orgs/testorg/repos',
    events_url: 'https://api.github.com/orgs/testorg/events',
    hooks_url: 'https://api.github.com/orgs/testorg/hooks',
    issues_url: 'https://api.github.com/orgs/testorg/issues',
    members_url: 'https://api.github.com/orgs/testorg/members{/member}',
    public_members_url: 'https://api.github.com/orgs/testorg/public_members{/member}',
    avatar_url: 'https://github.com/images/error/testorg_happy.gif',
    description: 'Test Organization',
    name: 'Test Organization',
    company: null,
    blog: 'https://testorg.example.com',
    location: 'San Francisco, CA',
    email: 'admin@testorg.example.com',
    twitter_username: 'testorg',
    is_verified: true,
    has_organization_projects: true,
    has_repository_projects: true,
    public_repos: 10,
    public_gists: 5,
    followers: 100,
    following: 50,
    html_url: 'https://github.com/testorg',
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    type: 'Organization',
  },
  orgs: [
    {
      login: 'testorg',
      id: 54321,
      node_id: 'MDEyOk9yZ2FuaXphdGlvbjU0MzIx',
      url: 'https://api.github.com/orgs/testorg',
      repos_url: 'https://api.github.com/orgs/testorg/repos',
      events_url: 'https://api.github.com/orgs/testorg/events',
      hooks_url: 'https://api.github.com/orgs/testorg/hooks',
      issues_url: 'https://api.github.com/orgs/testorg/issues',
      members_url: 'https://api.github.com/orgs/testorg/members{/member}',
      public_members_url: 'https://api.github.com/orgs/testorg/public_members{/member}',
      avatar_url: 'https://github.com/images/error/testorg_happy.gif',
      description: 'Test Organization',
    },
    {
      login: 'anotherorg',
      id: 98765,
      node_id: 'MDEyOk9yZ2FuaXphdGlvbjk4NzY1',
      url: 'https://api.github.com/orgs/anotherorg',
      repos_url: 'https://api.github.com/orgs/anotherorg/repos',
      events_url: 'https://api.github.com/orgs/anotherorg/events',
      hooks_url: 'https://api.github.com/orgs/anotherorg/hooks',
      issues_url: 'https://api.github.com/orgs/anotherorg/issues',
      members_url: 'https://api.github.com/orgs/anotherorg/members{/member}',
      public_members_url: 'https://api.github.com/orgs/anotherorg/public_members{/member}',
      avatar_url: 'https://github.com/images/error/anotherorg_happy.gif',
      description: 'Another Test Organization',
    },
  ],
  // GitHub Gists mock data
  gist: {
    id: 'abc123def456',
    node_id: 'MDQ6R2lzdGFiYzEyM2RlZjQ1Ng==',
    url: 'https://api.github.com/gists/abc123def456',
    forks_url: 'https://api.github.com/gists/abc123def456/forks',
    commits_url: 'https://api.github.com/gists/abc123def456/commits',
    git_pull_url: 'https://gist.github.com/abc123def456.git',
    git_push_url: 'https://gist.github.com/abc123def456.git',
    html_url: 'https://gist.github.com/abc123def456',
    files: {
      'hello_world.py': {
        filename: 'hello_world.py',
        type: 'application/x-python',
        language: 'Python',
        raw_url: 'https://gist.github.com/testuser/abc123def456/raw/hello_world.py',
        size: 25,
        truncated: false,
        content: 'print("Hello, World!")\n',
      },
      'README.md': {
        filename: 'README.md',
        type: 'text/markdown',
        language: 'Markdown',
        raw_url: 'https://gist.github.com/testuser/abc123def456/raw/README.md',
        size: 50,
        truncated: false,
        content: '# Test Gist\n\nThis is a test gist with multiple files.\n',
      },
    },
    public: true,
    created_at: '2023-01-01T12:00:00Z',
    updated_at: '2023-01-02T12:00:00Z',
    description: 'Test gist for demonstration',
    comments: 2,
    user: {
      login: 'testuser',
      id: 12345,
      node_id: 'MDQ6VXNlcjEyMzQ1',
      avatar_url: 'https://github.com/images/error/testuser_happy.gif',
      gravatar_id: '',
      url: 'https://api.github.com/users/testuser',
      html_url: 'https://github.com/testuser',
      type: 'User',
      site_admin: false,
    },
    comments_url: 'https://api.github.com/gists/abc123def456/comments',
    owner: {
      login: 'testuser',
      id: 12345,
      node_id: 'MDQ6VXNlcjEyMzQ1',
      avatar_url: 'https://github.com/images/error/testuser_happy.gif',
      gravatar_id: '',
      url: 'https://api.github.com/users/testuser',
      html_url: 'https://github.com/testuser',
      type: 'User',
      site_admin: false,
    },
    forks: [],
    history: [
      {
        url: 'https://api.github.com/gists/abc123def456/1',
        version: '1234567890abcdef',
        user: {
          login: 'testuser',
          id: 12345,
        },
        change_status: {
          total: 2,
          additions: 2,
          deletions: 0,
        },
        committed_at: '2023-01-01T12:00:00Z',
      },
    ],
    truncated: false,
  },
  gists: [
    {
      id: 'abc123def456',
      node_id: 'MDQ6R2lzdGFiYzEyM2RlZjQ1Ng==',
      url: 'https://api.github.com/gists/abc123def456',
      forks_url: 'https://api.github.com/gists/abc123def456/forks',
      commits_url: 'https://api.github.com/gists/abc123def456/commits',
      git_pull_url: 'https://gist.github.com/abc123def456.git',
      git_push_url: 'https://gist.github.com/abc123def456.git',
      html_url: 'https://gist.github.com/abc123def456',
      files: {
        'hello_world.py': {
          filename: 'hello_world.py',
          type: 'application/x-python',
          language: 'Python',
          raw_url: 'https://gist.github.com/testuser/abc123def456/raw/hello_world.py',
          size: 25,
          truncated: false,
        },
      },
      public: true,
      created_at: '2023-01-01T12:00:00Z',
      updated_at: '2023-01-02T12:00:00Z',
      description: 'Test gist for demonstration',
      comments: 2,
      user: {
        login: 'testuser',
        id: 12345,
        node_id: 'MDQ6VXNlcjEyMzQ1',
        avatar_url: 'https://github.com/images/error/testuser_happy.gif',
        gravatar_id: '',
        url: 'https://api.github.com/users/testuser',
        html_url: 'https://github.com/testuser',
        type: 'User',
        site_admin: false,
      },
      comments_url: 'https://api.github.com/gists/abc123def456/comments',
      owner: {
        login: 'testuser',
        id: 12345,
        node_id: 'MDQ6VXNlcjEyMzQ1',
        avatar_url: 'https://github.com/images/error/testuser_happy.gif',
        gravatar_id: '',
        url: 'https://api.github.com/users/testuser',
        html_url: 'https://github.com/testuser',
        type: 'User',
        site_admin: false,
      },
      truncated: false,
    },
    {
      id: 'def789ghi012',
      node_id: 'MDQ6R2lzdGRlZjc4OWdoaZEy',
      url: 'https://api.github.com/gists/def789ghi012',
      forks_url: 'https://api.github.com/gists/def789ghi012/forks',
      commits_url: 'https://api.github.com/gists/def789ghi012/commits',
      git_pull_url: 'https://gist.github.com/def789ghi012.git',
      git_push_url: 'https://gist.github.com/def789ghi012.git',
      html_url: 'https://gist.github.com/def789ghi012',
      files: {
        'test.js': {
          filename: 'test.js',
          type: 'application/javascript',
          language: 'JavaScript',
          raw_url: 'https://gist.github.com/testuser/def789ghi012/raw/test.js',
          size: 32,
          truncated: false,
        },
      },
      public: false,
      created_at: '2023-01-03T12:00:00Z',
      updated_at: '2023-01-04T12:00:00Z',
      description: 'Private test gist',
      comments: 0,
      user: {
        login: 'testuser',
        id: 12345,
        node_id: 'MDQ6VXNlcjEyMzQ1',
        avatar_url: 'https://github.com/images/error/testuser_happy.gif',
        gravatar_id: '',
        url: 'https://api.github.com/users/testuser',
        html_url: 'https://github.com/testuser',
        type: 'User',
        site_admin: false,
      },
      comments_url: 'https://api.github.com/gists/def789ghi012/comments',
      owner: {
        login: 'testuser',
        id: 12345,
        node_id: 'MDQ6VXNlcjEyMzQ1',
        avatar_url: 'https://github.com/images/error/testuser_happy.gif',
        gravatar_id: '',
        url: 'https://api.github.com/users/testuser',
        html_url: 'https://github.com/testuser',
        type: 'User',
        site_admin: false,
      },
      truncated: false,
    },
  ],
  release: {
    id: 123456,
    tag_name: 'v1.0.0',
    name: 'Release v1.0.0',
    body: 'This is a release description with changelog',
    draft: false,
    prerelease: false,
    published_at: '2023-01-01T00:00:00Z',
    created_at: '2023-01-01T00:00:00Z',
    author: {
      login: 'testuser',
      id: 12345,
    },
    assets: [
      {
        id: 78901,
        name: 'release-asset.zip',
        size: 1024000,
        download_count: 50,
        browser_download_url:
          'https://github.com/testorg/test-repo/releases/download/v1.0.0/release-asset.zip',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      },
    ],
    tarball_url: 'https://github.com/testorg/test-repo/archive/v1.0.0.tar.gz',
    zipball_url: 'https://github.com/testorg/test-repo/archive/v1.0.0.zip',
  },
  releases: [
    {
      id: 123456,
      tag_name: 'v2.0.0',
      name: 'Release v2.0.0',
      body: 'Major release with breaking changes',
      draft: false,
      prerelease: false,
      published_at: '2023-02-01T00:00:00Z',
      created_at: '2023-01-31T00:00:00Z',
      author: {
        login: 'testuser',
        id: 12345,
      },
      assets: [],
      tarball_url: 'https://github.com/testorg/test-repo/archive/v2.0.0.tar.gz',
      zipball_url: 'https://github.com/testorg/test-repo/archive/v2.0.0.zip',
    },
    {
      id: 123455,
      tag_name: 'v1.0.0',
      name: 'Release v1.0.0',
      body: 'Initial stable release',
      draft: false,
      prerelease: false,
      published_at: '2023-01-01T00:00:00Z',
      created_at: '2023-01-01T00:00:00Z',
      author: {
        login: 'testuser',
        id: 12345,
      },
      assets: [
        {
          id: 78901,
          name: 'release-asset.zip',
          size: 1024000,
          download_count: 50,
          browser_download_url:
            'https://github.com/testorg/test-repo/releases/download/v1.0.0/release-asset.zip',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
        },
      ],
      tarball_url: 'https://github.com/testorg/test-repo/archive/v1.0.0.tar.gz',
      zipball_url: 'https://github.com/testorg/test-repo/archive/v1.0.0.zip',
    },
  ],
  // GitHub Sub-Issues mock data
  subIssue: {
    id: 456,
    number: 43,
    title: 'Sub Issue',
    state: 'open',
    body: 'This is a sub issue',
    user: {
      login: 'testuser',
    },
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
  },
  subIssues: [
    {
      id: 456,
      number: 43,
      title: 'Sub Issue One',
      state: 'open',
      body: 'First sub issue',
      user: { login: 'testuser' },
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
    },
    {
      id: 457,
      number: 44,
      title: 'Sub Issue Two',
      state: 'open',
      body: 'Second sub issue',
      user: { login: 'testuser' },
      created_at: '2023-01-03T00:00:00Z',
      updated_at: '2023-01-04T00:00:00Z',
    },
  ],
  // GitHub Projects V2 mock data
  projectV2: {
    id: 'PVT_kwDOTest123',
    number: 1,
    title: 'Test Project',
    shortDescription: 'A test project',
    url: 'https://github.com/orgs/test-org/projects/1',
    public: true,
    closed: false,
    readme: 'Project readme content',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    creator: { login: 'testuser' },
  },
  projectV2Item: {
    id: 'PVTI_kwDOTest456',
    type: 'ISSUE',
    content: {
      __typename: 'Issue',
      title: 'Test Issue',
      number: 42,
      state: 'OPEN',
      url: 'https://github.com/test-org/test-repo/issues/42',
    },
    fieldValues: {
      nodes: [
        {
          __typename: 'ProjectV2ItemFieldTextValue',
          text: 'some text',
          field: { name: 'Title' },
        },
        {
          __typename: 'ProjectV2ItemFieldSingleSelectValue',
          name: 'Todo',
          field: { name: 'Status' },
        },
      ],
    },
  },
  projectV2Field: {
    id: 'PVTF_kwDOTest789',
    name: 'Status',
    dataType: 'SINGLE_SELECT',
    options: [
      { id: 'opt1', name: 'Todo' },
      { id: 'opt2', name: 'In Progress' },
      { id: 'opt3', name: 'Done' },
    ],
  },
};

/**
 * Mock setup for GitHub API tests
 * This function should be called before importing the file to be tested
 */
export function setupGitHubMocks() {
  // Create mock methods for different GitHub API endpoints
  const mocks = {
    // Reactions mocks
    reactions: {
      createForTeamDiscussionInOrg: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.reaction,
      })),
      createForTeamDiscussionCommentInOrg: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.reaction,
      })),
      deleteForCommitComment: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
      deleteForIssue: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
      deleteForIssueComment: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
      deleteForPullRequestComment: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
      deleteForRelease: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
      deleteForTeamDiscussion: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
      deleteForTeamDiscussionComment: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
    },
    // Team discussions mocks
    teams: {
      getDiscussionInOrg: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.teamDiscussion,
      })),
      getDiscussionCommentInOrg: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.teamDiscussionComment,
      })),
    },
    // Dependabot mocks
    dependabot: {
      listAlertsForRepo: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.dependabotAlerts,
        headers: {
          link: '<https://api.github.com/repos/testorg/test-repo/dependabot/alerts?page=2>; rel="next"',
        },
      })),
      getAlert: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.dependabotAlert })),
      updateAlert: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.dependabotAlert })),
    },
    issues: {
      get: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.issue })),
      listForRepo: mock((_params?: unknown) => Promise.resolve({
        data: [MOCK_DATA.issue],
        headers: {
          link: '<https://api.github.com/repos/testorg/test-repo/issues?page=2>; rel="next"',
        },
      })),
      create: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.issue })),
      update: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.issue })),
      listComments: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.issueComments })),
      createComment: mock((_params?: unknown) => Promise.resolve({
        data: { id: 123, body: 'Test comment' },
      })),
    },
    pulls: {
      // Return type is loosened to `Record<string, unknown>` (rather than the
      // literal `typeof MOCK_DATA.pullRequest` shape) so individual test files
      // can `mockImplementation` a partial PR fixture (e.g. just `number`/
      // `node_id`/`draft` for the mark-ready flow) without filling in every
      // field of the full mock pull request.
      get: mock(
        (_params?: unknown): Promise<{ data: Record<string, unknown> }> =>
          Promise.resolve({
            data: MOCK_DATA.pullRequest,
          }),
      ),
      list: mock((_params?: unknown) => Promise.resolve({ data: [MOCK_DATA.pullRequest] })),
      create: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.pullRequest })),
      merge: mock((_params?: unknown) => Promise.resolve({ data: { merged: true } })),
      listFiles: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.pullRequestFiles })),
      listReviews: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.pullRequestReviews })),
      listReviewComments: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.pullRequestComments,
      })),
      createReview: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.pullRequestReviews[0],
      })),
      updateBranch: mock((_params?: unknown) => Promise.resolve({
        data: { message: 'Branch was successfully updated' },
      })),
      requestReviewers: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.pullRequest })),
      removeRequestedReviewers: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.pullRequest,
      })),
    },
    repos: {
      get: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.repo })),
      list: mock((_params?: unknown) => Promise.resolve({ data: [MOCK_DATA.repo] })),
      listForOrg: mock((_params?: unknown) => Promise.resolve({ data: [MOCK_DATA.repo] })),
      listForUser: mock((_params?: unknown) => Promise.resolve({ data: [MOCK_DATA.repo] })),
      getCombinedStatusForRef: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.combinedStatus,
      })),
      // GitHub Branches mocks
      listBranches: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.branches,
      })),
      getBranch: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.branch,
      })),
      renameBranch: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.renameBranchResponse,
      })),
      merge: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.mergeResponse,
      })),
      getContent: mock((_params?: unknown) => Promise.resolve({
        data: {
          name: 'README.md',
          path: 'README.md',
          sha: 'abc123',
          size: 1024,
          type: 'file',
          content: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
          encoding: 'base64',
        },
      })),
      createOrUpdateFileContents: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.createOrUpdateFileContentsResponse,
      })),
      // GitHub Releases mocks
      listReleases: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.releases,
      })),
      getLatestRelease: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.release,
      })),
    },
    // GitHub Organizations mocks
    orgs: {
      list: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.orgs })),
      listForUser: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.orgs })),
      listForAuthenticatedUser: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.orgs })),
      get: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.org })),
    },
    // GitHub Gists mocks
    gists: {
      // Return type is loosened to `Record<string, unknown>` (rather than the
      // literal `typeof MOCK_DATA.gist` shape) so individual test files can
      // `mockImplementation` a partial gist fixture (e.g. testing base64
      // decoding with just `files`/`content`) without having to fill in every
      // field of the full mock gist.
      get: mock(
        (_params?: unknown): Promise<{ data: Record<string, unknown> }> =>
          Promise.resolve({
            data: MOCK_DATA.gist,
          }),
      ),
      list: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.gists })),
      listForUser: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.gists })),
      listPublic: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.gists })),
      create: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.gist })),
      update: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.gist })),
      delete: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
      getRevision: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.gist })),
      listRevisions: mock((_params?: unknown) => Promise.resolve({ data: [MOCK_DATA.gist] })),
      star: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
      unstar: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
      checkIsStarred: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
      listStarred: mock((_params?: unknown) => Promise.resolve({ data: MOCK_DATA.gists })),
      getComment: mock((_params?: unknown) => Promise.resolve({
        data: {
          id: 1001,
          body: 'Test gist comment',
          user: { login: 'testuser' },
          created_at: '2023-01-01T12:00:00Z',
          updated_at: '2023-01-01T12:00:00Z',
        },
      })),
      listComments: mock((_params?: unknown) => Promise.resolve({
        data: [
          {
            id: 1001,
            body: 'Test gist comment',
            user: { login: 'testuser' },
            created_at: '2023-01-01T12:00:00Z',
            updated_at: '2023-01-01T12:00:00Z',
          },
        ],
      })),
      createComment: mock((_params?: unknown) => Promise.resolve({
        data: {
          id: 1001,
          body: 'Test gist comment',
          user: { login: 'testuser' },
          created_at: '2023-01-01T12:00:00Z',
          updated_at: '2023-01-01T12:00:00Z',
        },
      })),
      updateComment: mock((_params?: unknown) => Promise.resolve({
        data: {
          id: 1001,
          body: 'Updated gist comment',
          user: { login: 'testuser' },
          created_at: '2023-01-01T12:00:00Z',
          updated_at: '2023-01-01T12:30:00Z',
        },
      })),
      deleteComment: mock((_params?: unknown) => Promise.resolve({ status: 204 })),
    },
    search: {
      issuesAndPullRequests: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.searchResults,
      })),
      code: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.codeSearchResults,
      })),
      commits: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.commitsSearchResults,
      })),
      repos: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.reposSearchResults,
      })),
    },
    // GitHub Actions mocks
    actions: {
      listRepoWorkflows: mock((_params?: unknown) => Promise.resolve({
        data: {
          total_count: MOCK_DATA.workflows.length,
          workflows: MOCK_DATA.workflows,
        },
      })),
      getWorkflow: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.workflow,
      })),
      createWorkflowDispatch: mock((_params?: unknown) => Promise.resolve({
        status: 204,
        data: MOCK_DATA.workflowDispatchResponse,
      })),
      listWorkflowRuns: mock((_params?: unknown) => Promise.resolve({
        data: {
          total_count: MOCK_DATA.workflowRuns.length,
          workflow_runs: MOCK_DATA.workflowRuns,
        },
      })),
      getWorkflowRun: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.workflowRun,
      })),
      cancelWorkflowRun: mock((_params?: unknown) => Promise.resolve({ status: 202 })),
      reRunWorkflow: mock((_params?: unknown) => Promise.resolve({ status: 201 })),
      reRunWorkflowFailedJobs: mock((_params?: unknown) => Promise.resolve({ status: 201 })),
      listJobsForWorkflowRun: mock((_params?: unknown) => Promise.resolve({
        data: {
          total_count: MOCK_DATA.workflowJobs.length,
          jobs: MOCK_DATA.workflowJobs,
        },
      })),
      getJobForWorkflowRun: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.workflowJob,
      })),
      downloadJobLogsForWorkflowRun: mock((_params?: unknown) => Promise.resolve({
        data: 'Mock workflow job log content\nLine 2\nLine 3',
      })),
    },
    // GitHub Git mocks
    git: {
      createRef: mock((_params?: unknown) => Promise.resolve({
        data: MOCK_DATA.createRefResponse,
      })),
    },
    // GraphQL mock for mutations like resolveReviewThread/unresolveReviewThread.
    // Takes (query, variables) like the real `octokit.graphql()`.
    graphql: mock((_query?: string, _variables?: unknown) => Promise.resolve({})),
    // Generic request mock for endpoints not covered by Octokit REST methods (e.g. sub-issues).
    // Takes (route, params) like the real `octokit.request()`.
    request: mock(
      (
        _route?: string,
        _params?: unknown,
      ): Promise<{ status?: number; data?: unknown }> => Promise.resolve({ data: {} }),
    ),
  };

  // Mock the registry decorator
  void mock.module('../../registry', () => ({
    Tool: () => (target: any) => target,
  }));

  // Mock environment variables
  void mock.module('../../../env', () => ({
    default: {
      GITHUB_TOKEN: 'mock-token',
      GH_API_URL: 'https://api.github.com',
    },
  }));

  // Mock OAuth configuration functions
  void mock.module('../auth/oauth-config', () => ({
    isOAuthConfigured: mock(() => false),
    getGitHubOAuthConfig: mock(() => ({ isConfigured: false })),
  }));

  // Create a mock Octokit implementation
  void mock.module('octokit', () => ({
    Octokit: function () {
      return {
        rest: mocks,
        graphql: mocks.graphql,
        request: mocks.request,
      };
    },
  }));

  return mocks;
}

/**
 * Helper to reset all mocks in a GitHub mock object
 */
export function resetGitHubMocks(mocks: ReturnType<typeof setupGitHubMocks>) {
  // Reset all issue-related mocks
  Object.values(mocks.issues).forEach((mockFn) => mockFn.mockReset());

  // Reset all pull request-related mocks
  Object.values(mocks.pulls).forEach((mockFn) => mockFn.mockReset());

  // Reset all repository-related mocks
  Object.values(mocks.repos).forEach((mockFn) => mockFn.mockReset());

  // Reset all actions-related mocks
  if (mocks.actions) {
    Object.values(mocks.actions).forEach((mockFn) => mockFn.mockReset());
  }

  // Reset all search-related mocks
  if (mocks.search) {
    Object.values(mocks.search).forEach((mockFn) => mockFn.mockReset());
  }

  // Reset all organization-related mocks
  if (mocks.orgs) {
    Object.values(mocks.orgs).forEach((mockFn) => mockFn.mockReset());
  }

  // Reset all gists-related mocks
  if (mocks.gists) {
    Object.values(mocks.gists).forEach((mockFn) => mockFn.mockReset());
  }

  // Reset all reactions-related mocks
  if (mocks.reactions) {
    Object.values(mocks.reactions).forEach((mockFn) => mockFn.mockReset());
  }

  // Reset all team-related mocks
  if (mocks.teams) {
    Object.values(mocks.teams).forEach((mockFn) => mockFn.mockReset());
  }

  // Reset all dependabot-related mocks
  if (mocks.dependabot) {
    Object.values(mocks.dependabot).forEach((mockFn) => mockFn.mockReset());
  }

  // Reset all git-related mocks
  if (mocks.git) {
    Object.values(mocks.git).forEach((mockFn) => mockFn.mockReset());
  }

  // Reset the generic request mock
  if (mocks.request) {
    mocks.request.mockReset();
  }
}
