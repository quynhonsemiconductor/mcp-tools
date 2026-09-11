# Mock libraries for Bun test: Current state and practical solutions

Bun's test framework offers substantial native mocking capabilities with Jest-like compatibility, achieving up to **13x faster performance** than traditional test runners. However, the ecosystem requires understanding specific patterns and third-party solutions to address current limitations in timer mocking, fetch mocking, and module isolation.

The framework provides built-in support for function mocking through `mock()` and `jest.fn()`, spies via `spyOn()`, and module mocking with `mock.module()`. While these core features handle most testing scenarios effectively, developers need supplementary libraries for advanced use cases. The community has responded with targeted solutions like bun-bagel and @aryzing/bun-mock-fetch for HTTP mocking, while established libraries like Sinon.js provide timer mocking capabilities that Bun currently lacks natively.

## Native mocking: Fast but feature-incomplete

Bun's built-in mocking system delivers impressive performance while maintaining familiar APIs. The framework supports function mocking with full call tracking, method spying without implementation replacement, and module mocking for both ES modules and CommonJS. Mock functions created with `mock()` or `jest.fn()` provide rich metadata through `.mock.calls`, `.mock.results`, and `.mock.instances` properties, enabling detailed assertion capabilities.

Module mocking represents a powerful but complex feature. The `mock.module()` function handles relative paths, absolute paths, and package names automatically, with live bindings ensuring that ES module changes propagate to existing imports. However, **critical limitations exist**: the framework lacks auto-mocking capabilities (no `jest.mock()` equivalent), requires the `--preload` flag for mocks that must activate before imports, and suffers from test isolation issues where mocks persist between test suites.

Time mocking presents another significant gap. While Bun provides `setSystemTime()` for mocking Date objects and `jest.useFakeTimers()` compatibility, **timer mocking remains unimplemented**. The official documentation explicitly states that `setTimeout` and `setInterval` mocking is on the roadmap but not yet available, forcing developers to use third-party solutions like Sinon.js for timer-dependent tests.

## Third-party solutions fill critical gaps

The Bun-specific mocking library ecosystem remains small but focused, with developers creating targeted solutions for the framework's most pressing limitations. **@aryzing/bun-mock-fetch** emerges as the most comprehensive fetch mocking solution, offering advanced matching capabilities including regex patterns, minimatch support, and request-based response functions. Its ability to fall back to native fetch for unmatched requests makes it particularly practical for real-world applications.

**bun-bagel** provides a lighter alternative for fetch mocking, featuring URL pattern matching with wildcards and custom response configuration. While experimental and less feature-complete than @aryzing/bun-mock-fetch, it serves simpler use cases effectively. The library's focus on Bun's runtime environment ensures optimal performance, though users report limitations with header mocking and complex scenarios.

For broader testing utilities, **@itsmeid/bun-test-utils** attempts to provide a more comprehensive solution, including custom timers and DOM control. However, limited maintenance and a smaller user base make it less reliable than more focused alternatives. The community generally recommends using specialized libraries for specific needs rather than all-in-one solutions.

## Popular JavaScript libraries show mixed compatibility

Established JavaScript mocking libraries demonstrate varying levels of compatibility with Bun's test runner. **Sinon.js stands out with full compatibility**, requiring no special configuration and providing all its features including spies, stubs, mocks, and crucially, fake timers. This makes Sinon the go-to solution for timer mocking until Bun implements native support.

Jest compatibility remains partial but functional for basic use cases. While `jest.fn()` works identically to Bun's native `mock()`, advanced features like `jest.mock()`, `jest.requireActual()`, and automatic mocking remain unsupported. **Migration from Jest requires significant refactoring**, particularly for projects heavily reliant on module mocking. The workaround involves using `mock.module()` with manual module recreation, often requiring the `--preload` flag for proper initialization.

**MSW (Mock Service Worker)** and **testdouble.js** both function well with proper setup, offering network-level mocking and TDD-focused workflows respectively. Nock shows partial compatibility with reported issues for complex scenarios, leading many developers to prefer Bun-specific alternatives. Libraries designed for Node.js internals like proxyquire and rewire show limited compatibility and should be avoided in favor of Bun's native capabilities.

## Community patterns address isolation challenges

The Bun testing community has developed consistent patterns to address the framework's current limitations. **The --preload flag emerges as a critical tool** for module mocking scenarios, allowing developers to establish mocks before imports occur. Configuration through `bunfig.toml` standardizes this approach:

```toml
[test]
preload = ["./test-setup.ts"]
```

Test isolation represents a persistent challenge, with mocks leaking between test suites by default. Developers combat this through disciplined cleanup practices, using `mock.clearAllMocks()` or `mock.restore()` in `afterEach` hooks. For module mocks specifically, manual restoration often requires saving original module references and re-mocking with original implementations.

Fetch mocking patterns have evolved beyond library usage, with many developers preferring direct global manipulation: `spyOn(globalThis, 'fetch')` provides a straightforward approach for simple scenarios. This method integrates well with Bun's existing spy infrastructure while avoiding third-party dependencies.

## Migration strategies require careful planning

Teams considering migration to Bun test should evaluate their current mocking requirements carefully. **Projects with simple mocking needs see immediate benefits**, while those heavily dependent on Jest's advanced features face significant refactoring. The recommended approach involves gradual migration, starting with pure function tests and progressively addressing module mocking complexities.

Performance improvements justify migration efforts for many teams. Benchmarks consistently show Bun test running 13x faster than Jest and 8x faster than Vitest, with `expect().toEqual()` assertions performing up to 100x faster. Cold start performance and memory usage improvements particularly benefit large test suites and CI/CD pipelines.

The migration path from Vitest proves smoother than Jest, thanks to Bun's `vi` global object providing API compatibility. Most Vitest tests require minimal changes, though configuration adjustments and understanding of Bun's limitations remain necessary.

## Practical recommendations for different scenarios

For new projects, **Bun's native mocking capabilities suffice for most testing needs**. Supplement with Sinon.js for timer mocking and either @aryzing/bun-mock-fetch or bun-bagel for HTTP mocking based on complexity requirements. This combination provides comprehensive coverage while maintaining Bun's performance advantages.

Existing projects require more nuanced evaluation. Teams should inventory their current mocking usage, particularly focusing on `jest.mock()` usage, timer-dependent tests, and module mocking complexity. Projects with extensive Jest infrastructure may benefit from waiting for additional Bun features or maintaining a hybrid approach during transition.

Complex scenarios demand specific solutions. Use MSW for sophisticated API mocking requirements, particularly when testing against real-world service behaviors. Deploy testdouble.js for teams practicing strict TDD methodologies. For projects requiring extensive module mocking, invest time in understanding the --preload pattern and developing consistent mock management strategies.

## Future outlook shows promise

The Bun team actively addresses mocking limitations, with timer mocking explicitly mentioned on the roadmap. GitHub issues tracking jest.mock() support (#5394) and module mock restoration (#7376) show ongoing development efforts. The community's rapid growth suggests accelerating ecosystem development, with more sophisticated mocking solutions likely emerging.

Current limitations shouldn't deter adoption for appropriate use cases. The framework's performance benefits, growing compatibility, and active development make it increasingly viable for production use. Teams prioritizing test execution speed and willing to adapt to current constraints find Bun test a compelling alternative to established runners.

## Conclusion

Bun's test framework mocking landscape reflects a rapidly maturing ecosystem balancing performance innovation with compatibility needs. While native capabilities handle common scenarios effectively, gaps in timer mocking, fetch mocking, and module isolation require third-party solutions and community patterns. The combination of Bun's built-in features, targeted libraries like @aryzing/bun-mock-fetch, and established tools like Sinon.js provides comprehensive mocking coverage for most real-world applications. Teams should evaluate their specific requirements against current limitations, but for many projects, Bun test's performance advantages justify adoption despite its evolving feature set.