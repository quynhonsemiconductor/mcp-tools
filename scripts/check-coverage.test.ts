// Units for the coverage gate's lcov aggregation. The gate excludes test
// scaffolding (src/test-utils/**, any __test__/, any __mocks__/) before totalling
// — that exclusion is load-bearing arithmetic, so it gets the same treatment as
// product code: tests.
import { describe, expect, it } from 'bun:test';

import { sumLcov } from './check-coverage';

const block = (path: string, found: number, hit: number, fnFound: number, fnHit: number) =>
  [
    `SF:${path}`,
    'DA:1,1',
    `LF:${found}`,
    `LH:${hit}`,
    `FNF:${fnFound}`,
    `FNH:${fnHit}`,
    'end_of_record',
  ].join('\n');

describe('sumLcov', () => {
  it('sums line and function counters across multiple files', () => {
    const lcov = [block('src/a.ts', 10, 8, 4, 3), block('src/b.ts', 20, 10, 6, 6)].join('\n');

    expect(sumLcov(lcov)).toEqual({
      linesFound: 30,
      linesHit: 18,
      functionsFound: 10,
      functionsHit: 9,
    });
  });

  it('excludes test scaffolding files from the totals', () => {
    const lcov = [
      block('src/product.ts', 10, 10, 4, 4),
      block('src/test-utils/mocks.ts', 100, 0, 50, 0),
      block('src/tools/github/__test__/test-utils.ts', 100, 0, 50, 0),
      block('src/gateway/__mocks__/mcp-fixtures.ts', 100, 0, 50, 0),
    ].join('\n');

    const totals = sumLcov(lcov);
    expect(totals).toEqual({
      linesFound: 10,
      linesHit: 10,
      functionsFound: 4,
      functionsHit: 4,
    });
  });

  it('keeps scaffolding-shaped paths that are not scaffolding files', () => {
    // A product module named like the pattern must survive: the match is on the
    // directory segments, not a bare substring.
    const lcov = block('src/my-test-utils/real-code.ts', 10, 5, 2, 2);

    expect(sumLcov(lcov).linesFound).toBe(10);
  });

  it('treats an empty report as zero', () => {
    expect(sumLcov('')).toEqual({
      linesFound: 0,
      linesHit: 0,
      functionsFound: 0,
      functionsHit: 0,
    });
  });
});
