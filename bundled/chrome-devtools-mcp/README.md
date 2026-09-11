# chrome-devtools-mcp

**Version:** 0.12.1

<a href="https://glama.ai/mcp/servers/ChromeDevTools/chrome-devtools-mcp">View on Glama.ai</a>

**Source:** [https://github.com/ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) (chrome-devtools-mcp-v0.12.1)

## Tools

### click

Clicks on the provided element

### close_page

Closes the page by its index. The last open page cannot be closed.

### drag

Drag an element onto another element

### emulate

Emulates various features on the selected page.

### evaluate_script

Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON
so returned values have to JSON-serializable.

### fill

Type text into a input, text area or select an option from a <select> element.

### fill_form

Fill out multiple form elements at once

### get_console_message

Gets a console message by its ID. You can get all messages by calling list_console_messages.

### get_network_request

Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.

### handle_dialog

If a browser dialog was opened, use this command to handle it

### hover

Hover over the provided element

### list_console_messages

List all console messages for the currently selected page since the last navigation.

### list_network_requests

List all requests for the currently selected page since the last navigation.

### list_pages

Get a list of pages open in the browser.

### navigate_page

Navigates the currently selected page to a URL.

### new_page

Creates a new page

### performance_analyze_insight

Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.

### performance_start_trace

Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.

### performance_stop_trace

Stops the active performance trace recording on the selected page.

### press_key

Press a key or key combination. Use this when other input methods like fill() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).

### resize_page

Resizes the selected page's window so that the page has specified dimension

### select_page

Select a page as a context for future tool calls.

### take_screenshot

Take a screenshot of the page or element.

### take_snapshot

Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).

### upload_file

Upload a file through a provided element.

### wait_for

Wait for the specified text to appear on the selected page.

---

- **Security Scan:** Not Available
