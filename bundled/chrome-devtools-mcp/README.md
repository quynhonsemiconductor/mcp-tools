# chrome-devtools-mcp

**Version:** 1.9.0

<a href="https://glama.ai/mcp/servers/ChromeDevTools/chrome-devtools-mcp">View on Glama.ai</a>

**Source:** [https://github.com/ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) (chrome-devtools-mcp-v1.9.0)

## Tools

### click

Clicks on the provided element

### close_page

Closes the page by its index. The last open page cannot be closed.

### drag

Drag an element onto another element

### emulate

Emulates various features on the target page.

### evaluate_script

Evaluate a JavaScript function inside the target page. Returns the response as JSON, so returned values have to be JSON-serializable.

### fill

Type text into an input, text area or select an option from a <select> element.

### fill_form

Fill out multiple form elements (inputs, selects, checkboxes, radios) at once. ALWAYS prefer this tool over multiple individual 'fill' or 'click' calls when interacting with forms. It is significantly faster, more reliable, and reduces turn count. Example: Fill username, password, and check "Remember Me" in one call.

### get_console_message

Gets a console message by its ID. You can get all messages by calling list_console_messages.

### get_network_request

Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel. Useful for inspecting request headers (including 'Cookie') and response headers (including 'Set-Cookie' and directives).

### handle_dialog

If a browser dialog was opened, use this command to handle it

### hover

Hover over the provided element

### lighthouse_audit

Get Lighthouse score and reports for accessibility, SEO, best practices, and agentic browsing. This excludes performance. For performance audits, run performance_start_trace

### list_console_messages

List all console messages for the target page since the last navigation.

### list_network_requests

Lists the most recent requests for the target page since the last navigation.

### list_pages

Get a list of pages open in the browser.

### navigate_page

Go to a URL, or back, forward, or reload. Use project URL if not specified otherwise.

### new_page

Open a new tab and load a URL. Use project URL if not specified otherwise.

### performance_analyze_insight

Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.

### performance_start_trace

Start a performance trace on the target webpage. Use to find frontend performance issues, Core Web Vitals (LCP, INP, CLS), and improve page load speed.

### performance_stop_trace

Stop the active performance trace recording on the target webpage.

### press_key

Press a key or key combination. Use this when other input methods like fill() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).

### resize_page

Resizes the page's window so that the page has specified dimension

### select_page

Select a page as a context for future tool calls.

### take_heapsnapshot

Capture a heap snapshot of the target page. Use to analyze the memory distribution of JavaScript objects and debug memory leaks.

### take_screenshot

Take a screenshot of the page or element.

### take_snapshot

Take a text snapshot of the target page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).

### type_text

Type text using keyboard into a previously focused input

### upload_file

Upload a file through a provided element.

### wait_for

Wait for the specified text to appear on the selected page.

---

- **Security Scan:** Not Available
