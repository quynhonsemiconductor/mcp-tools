// MCP Tools Log Viewer

// State
let logContent = '';
let countdownInterval = null;
let countdownValue = 0;
let isRefreshing = false;
let pendingTimeout = null;
// Set true by stopAutoRefresh, checked in finally blocks before scheduling
// the post-fetch timeout. Guards against a fetch that's in flight when the
// user navigates away — otherwise its finally would schedule a new timer
// after pendingTimeout has already been cleared.
let isStopped = false;
let autoScrollEnabled = true;
let visibleLevels = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR']);
const REFRESH_RATE = 30000; // 30 seconds

// Function to fetch logs from API
async function fetchLogs() {
  console.log('Fetching logs from API...');
  try {
    const response = await fetch('/api/logs');
    console.log('Response status:', response.status);
    if (!response.ok) {
      const body = await response.text().catch(() => '<no body>');
      console.error(`Error fetching logs (${response.status}): ${body}`);
      return null;
    }

    const logs = await response.text();
    return logs;
  } catch (error) {
    console.error('Error fetching logs:', error);
    return null;
  }
}

// Escape HTML special characters to prevent XSS
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Color different log levels and tag with data-level for filtering
function colorizeLogLevel(logLine) {
  const patterns = [
    { level: 'DEBUG', regex: /\[DEBUG\]/, className: 'log-level-debug' },
    { level: 'INFO', regex: /\[INFO\]/, className: 'log-level-info' },
    { level: 'WARN', regex: /\[WARN\]/, className: 'log-level-warn' },
    { level: 'ERROR', regex: /\[ERROR\]/, className: 'log-level-error' }
  ];

  const escaped = escapeHtml(logLine);
  for (const pattern of patterns) {
    if (pattern.regex.test(logLine)) {
      return { html: `<span class="log-line ${pattern.className}">${escaped}</span>`, level: pattern.level };
    }
  }

  return { html: `<span class="log-line">${escaped}</span>`, level: null };
}

// Update the line count indicator
function updateLineCount(total, visible) {
  const counter = document.getElementById('log-line-count');
  if (!counter) return;
  if (!total) {
    counter.textContent = '';
    return;
  }
  counter.textContent = visible < total
    ? `${visible.toLocaleString()} of ${total.toLocaleString()} lines`
    : `${total.toLocaleString()} lines`;
}

// Toggle visibility of a log level
function toggleLogLevel(level) {
  if (visibleLevels.has(level)) {
    visibleLevels.delete(level);
  } else {
    visibleLevels.add(level);
  }

  // Update button state
  const btn = document.querySelector(`.log-filter-btn[data-level="${level}"]`);
  if (btn) btn.classList.toggle('active', visibleLevels.has(level));

  // Re-render to exclude filtered lines entirely
  renderLogs();
}

// Toggle auto-scroll
function toggleAutoScroll() {
  autoScrollEnabled = !autoScrollEnabled;
  const btn = document.getElementById('auto-scroll-toggle');
  if (btn) btn.classList.toggle('active', autoScrollEnabled);
}

// Update the log viewer content
async function updateLogs() {
  if (isRefreshing) {
    console.log('Already refreshing logs, skipping this update');
    return Promise.resolve();
  }

  isRefreshing = true;

  try {
    console.log('Refreshing logs...');
    const logs = await fetchLogs();
    console.log('Logs fetched:', logs ? logs.length : 'No logs');

    if (!logs) {
      console.warn('No logs received from fetch');
      // Mirror the initLogsViewer treatment so a refresh failure doesn't leave
      // the user staring at a healthy-looking countdown over stale content.
      const logViewer = document.getElementById('log-content');
      if (logViewer) {
        logViewer.innerHTML =
          '<span class="log-level-error">Failed to refresh logs. Will retry automatically.</span>';
      }
    } else {
      // Only update if logs have changed
      if (logs !== logContent) {
        logContent = logs;
        renderLogs();
      }
    }
  } catch (error) {
    console.error('Error during logs refresh:', error);
  } finally {
    // Skip scheduling if the user navigated away while the fetch was in flight —
    // stopAutoRefresh already ran and cleared pendingTimeout (which was null at
    // that point), so a new timer here would have nobody to clean it up.
    if (!isStopped) {
      // Set a short delay before resetting refresh state and restarting countdown
      // This makes the "Refreshing..." message visible for longer
      pendingTimeout = setTimeout(() => {
        pendingTimeout = null;
        isRefreshing = false;
        console.log('starting countdown after refresh');

        const autoRefreshBtn = document.getElementById('auto-refresh');
        if (autoRefreshBtn && autoRefreshBtn.textContent === 'Pause Auto-Refresh') {
          // Reset the countdown
          countdownValue = REFRESH_RATE / 1000;

          // Restart the countdown interval
          clearInterval(countdownInterval); // Clear any existing interval first
          countdownInterval = setInterval(tickCountdown, 1000);

          // Update the countdown display
          updateCountdownDisplay();
        }
      }, 500); // 500ms delay to show "Refreshing..." message a bit longer
    } else {
      // Paused — the 500ms callback that normally clears the latch won't run,
      // so reset it here. Otherwise a manual Refresh Now while paused leaves
      // isRefreshing stuck at true and every later click hits the early return.
      isRefreshing = false;
    }
  }

  // Return a resolved promise when everything is done
  return Promise.resolve();
}

// Update the countdown display
function updateCountdownDisplay() {
  const statusMessage = document.querySelector('.status-message');
  if (statusMessage && !isRefreshing) {
    statusMessage.innerHTML = `<span class="clock-icon">🕗</span> Refreshing in <span class="countdown">${countdownValue}s</span>`;
  }
}

// Single iteration of countdown
function tickCountdown() {
  if (isRefreshing) return; // Don't update during refresh

  countdownValue--;
  updateCountdownDisplay();

  if (countdownValue <= 0) {
    // When countdown reaches zero, pause the countdown and refresh
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    // Show refreshing message immediately
    const statusMessage = document.querySelector('.status-message');
    if (statusMessage) {
      statusMessage.innerHTML =
        '<span class="refreshing"><span class="refresh-icon">🔄</span> Refreshing...</span>';
    }

    // Track this timer in pendingTimeout so stopAutoRefresh can cancel it
    // if the user navigates away during the 100ms gap.
    pendingTimeout = setTimeout(() => {
      pendingTimeout = null;
      if (isStopped) return;
      updateLogs();
    }, 100);
  }
}

// Start and stop automatic refreshing
function startAutoRefresh() {
  console.log('Starting auto-refresh');
  // Reset state flags that stopAutoRefresh sets. Without this, Pause then
  // Start within the same page visit leaves isStopped=true, which makes the
  // countdown tick's guard silently no-op every refresh.
  isStopped = false;
  isRefreshing = false;

  // Clear any existing intervals
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  // Initialize countdown
  countdownValue = REFRESH_RATE / 1000;

  // Set up the countdown interval (update every second)
  countdownInterval = setInterval(tickCountdown, 1000);

  // Update UI
  const startBtn = document.getElementById('auto-refresh');
  if (startBtn) startBtn.textContent = 'Pause Auto-Refresh';
  updateCountdownDisplay(); // Update immediately
}

function stopAutoRefresh() {
  // Tell any in-flight fetch's finally block not to schedule a new timer
  isStopped = true;

  // Reset isRefreshing unconditionally. The latch is normally cleared either
  // by the 500ms post-fetch callback or by the in-flight fetch's finally —
  // but stopAutoRefresh cancels both paths (the timeout below, and the
  // isStopped guard inside the finally), so without this the latch can stay
  // stuck at true and silently no-op every subsequent refresh.
  isRefreshing = false;

  // Clear any pending timeout that would start a new interval
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }

  // Clear interval
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // Update UI
  const stopBtn = document.getElementById('auto-refresh');
  if (stopBtn) stopBtn.textContent = 'Start Auto-Refresh';

  const statusMessage = document.querySelector('.status-message');
  if (statusMessage) {
    statusMessage.textContent = 'Auto-refresh is paused';
  }
}

function toggleAutoRefresh() {
  if (countdownInterval) {
    stopAutoRefresh();
  } else {
    startAutoRefresh();
  }
}

// Render current logContent into the viewer, filtering by active log levels
function renderLogs() {
  const logViewer = document.getElementById('log-content');
  if (!logViewer || !logContent) return;

  const logLines = logContent.split('\n');
  const parsed = logLines.map((line) => colorizeLogLevel(line));
  const visible = parsed.filter(({ level }) => level === null || visibleLevels.has(level));

  logViewer.innerHTML = visible.map(({ html }) => html).join('\n');
  updateLineCount(parsed.length, visible.length);

  if (autoScrollEnabled) {
    logViewer.scrollTop = logViewer.scrollHeight;
  }
}

// Clear the log viewer
function clearLogViewer() {
  const logViewer = document.getElementById('log-content');
  if (logViewer) {
    logViewer.innerHTML =
      '<span class="log-level-info">Logs cleared from view (not from file)</span>';
    logContent = ''; // Reset stored content so it will update on next refresh
    updateLineCount(0, 0);
  }
}

// Initialize the log viewer — called by the SPA router when navigating to /logs
let logsInitialized = false;
// Bumped on every initLogsViewer call. The post-fetch finally checks its own
// captured value against the current one — if they differ, a newer init has
// taken over and this finally must abandon (otherwise it would stomp the new
// session's pendingTimeout and leak a countdown interval).
let initSessionId = 0;

async function initLogsViewer() {
  const mySession = ++initSessionId;
  // Stop any existing auto-refresh from a previous visit
  stopAutoRefresh();
  isRefreshing = false;
  isStopped = false;
  logContent = '';

  if (!logsInitialized) {
    // Wire up button event listeners once
    document
      .getElementById('refresh-logs')
      .addEventListener('click', updateLogs);
    document
      .getElementById('auto-refresh')
      .addEventListener('click', toggleAutoRefresh);
    document
      .getElementById('clear-view')
      .addEventListener('click', clearLogViewer);
    document
      .getElementById('auto-scroll-toggle')
      .addEventListener('click', toggleAutoScroll);

    // Log level filter buttons
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleLogLevel(btn.dataset.level));
    });

    // Disable auto-scroll when user scrolls up manually
    const logViewer = document.getElementById('log-content');
    if (logViewer) {
      logViewer.addEventListener('scroll', () => {
        const atBottom = logViewer.scrollHeight - logViewer.scrollTop - logViewer.clientHeight < 50;
        if (!atBottom && autoScrollEnabled) {
          autoScrollEnabled = false;
          const btn = document.getElementById('auto-scroll-toggle');
          if (btn) btn.classList.remove('active');
        }
      });
    }

    logsInitialized = true;
  }

  // Show "Refreshing..." message
  const statusMessage = document.querySelector('.status-message');
  if (statusMessage) {
    statusMessage.innerHTML =
      '<span class="refreshing"><span class="refresh-icon">🔄</span> Refreshing...</span>';
  }

  // Update button state to show auto-refresh is active
  document.getElementById('auto-refresh').textContent = 'Pause Auto-Refresh';

  // Start with auto-scroll off so the page starts at the top (newest logs first)
  autoScrollEnabled = false;
  const scrollBtn = document.getElementById('auto-scroll-toggle');
  if (scrollBtn) scrollBtn.classList.remove('active');

  // Reset level filters on each visit
  visibleLevels = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR']);
  document.querySelectorAll('.log-filter-btn').forEach(btn => btn.classList.add('active'));

  // Initial fetch of logs
  try {
    const logs = await fetchLogs();

    if (logs) {
      logContent = logs;
      renderLogs();
    } else {
      // Surface the failure in the log area so the user isn't watching a
      // countdown over an empty viewer with no idea anything went wrong.
      const logViewer = document.getElementById('log-content');
      if (logViewer) {
        logViewer.innerHTML =
          '<span class="log-level-error">Failed to load logs. Will retry automatically.</span>';
      }
    }
  } catch (error) {
    console.error('Error during initial logs fetch:', error);
  } finally {
    // If a newer init has taken over while this fetch was in flight, abandon —
    // scheduling here would stomp the newer session's pendingTimeout and leak
    // its countdown interval.
    if (mySession === initSessionId && !isStopped) {
      pendingTimeout = setTimeout(() => {
        pendingTimeout = null;
        isRefreshing = false;
        countdownValue = REFRESH_RATE / 1000;
        clearInterval(countdownInterval);
        countdownInterval = setInterval(tickCountdown, 1000);
        updateCountdownDisplay();
      }, 500);
    }
  }
}

// Expose to the SPA router (same pattern as config-editor)
window.initLogsViewer = initLogsViewer;
window.stopLogsAutoRefresh = stopAutoRefresh;

// If the user lands directly on /logs, initialize immediately
document.addEventListener('DOMContentLoaded', function () {
  if (window.location.pathname === '/logs') {
    initLogsViewer();
  }
});

// Clean up intervals when page is unloaded
window.addEventListener('unload', function () {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
});
