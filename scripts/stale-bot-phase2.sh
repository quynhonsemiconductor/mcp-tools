#!/bin/bash
# Phase 2: Communication Period Script for Stale Bot Rollout
# This script identifies issues/PRs with 15-60 days of inactivity and can post notification comments

set -e

# Configuration
MIN_DAYS=15
MAX_DAYS=60
DRY_RUN=${DRY_RUN:-true}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Communication message for issues
ISSUE_MESSAGE="## 📢 Stale Bot Notification

Hello! We're implementing automated repository maintenance to help keep our issue tracker focused on active work.

**What's changing:**
- A stale bot will be enabled soon on this repository
- Issues without activity will be marked as **stale** after **45 days**
- Stale issues will be **automatically closed** after **7 additional days** of inactivity
- Any comment or activity will remove the stale label and reset the timer

**What you can do:**
- If this issue is still relevant, please add a comment to keep it active
- If this issue is no longer needed, feel free to close it

This change helps us maintain a cleaner, more focused issue tracker. Thank you for your understanding!

---
*This is part of our stale bot rollout.*"

# Communication message for PRs
PR_MESSAGE="## 📢 Stale Bot Notification

Hello! We're implementing automated repository maintenance to help keep our PR queue focused on active work.

**What's changing:**
- A stale bot will be enabled soon on this repository
- Pull requests without activity will be marked as **stale** after **45 days**
- Stale PRs will be **automatically closed** after **7 additional days** of inactivity
- Any comment, commit, or activity will remove the stale label and reset the timer

**What you can do:**
- If this PR is still in progress, please add a comment or push new commits
- If this PR is no longer needed, feel free to close it
- Add the \`work-in-progress\` label if you need more time

This change helps us maintain a cleaner, more focused PR queue. Thank you for your understanding!

---
*This is part of our stale bot rollout.*"

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_item() {
    local type=$1
    local number=$2
    local title=$3
    local days=$4

    if [[ "$type" == "issue" ]]; then
        echo -e "  ${GREEN}#$number${NC} ($days days) - $title"
    else
        echo -e "  ${YELLOW}PR #$number${NC} ($days days) - $title"
    fi
}

get_days_since_update() {
    local updated_at=$1
    local now=$(date +%s)
    local updated=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$updated_at" +%s 2>/dev/null || date -d "$updated_at" +%s)
    echo $(( (now - updated) / 86400 ))
}

# Find issues with 15-60 days of inactivity
find_stale_issues() {
    print_header "Issues with $MIN_DAYS-$MAX_DAYS days of inactivity"

    local count=0
    local issues=$(gh issue list --state open --json number,title,updatedAt --limit 200)

    echo "$issues" | jq -c '.[]' | while read -r issue; do
        local number=$(echo "$issue" | jq -r '.number')
        local title=$(echo "$issue" | jq -r '.title')
        local updated_at=$(echo "$issue" | jq -r '.updatedAt')
        local days=$(get_days_since_update "$updated_at")

        if [[ $days -ge $MIN_DAYS && $days -le $MAX_DAYS ]]; then
            print_item "issue" "$number" "$title" "$days"
            ((count++)) || true
        fi
    done

    echo ""
    echo -e "${BLUE}Total issues in range: Check output above${NC}"
}

# Find PRs with 15-60 days of inactivity
find_stale_prs() {
    print_header "PRs with $MIN_DAYS-$MAX_DAYS days of inactivity"

    local count=0
    local prs=$(gh pr list --state open --json number,title,updatedAt --limit 200)

    echo "$prs" | jq -c '.[]' | while read -r pr; do
        local number=$(echo "$pr" | jq -r '.number')
        local title=$(echo "$pr" | jq -r '.title')
        local updated_at=$(echo "$pr" | jq -r '.updatedAt')
        local days=$(get_days_since_update "$updated_at")

        if [[ $days -ge $MIN_DAYS && $days -le $MAX_DAYS ]]; then
            print_item "pr" "$number" "$title" "$days"
            ((count++)) || true
        fi
    done

    echo ""
    echo -e "${BLUE}Total PRs in range: Check output above${NC}"
}

# Post comment to an issue
comment_issue() {
    local number=$1

    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN]${NC} Would comment on issue #$number"
    else
        echo -e "${GREEN}Commenting on issue #$number...${NC}"
        gh issue comment "$number" --body "$ISSUE_MESSAGE"
    fi
}

# Post comment to a PR
comment_pr() {
    local number=$1

    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN]${NC} Would comment on PR #$number"
    else
        echo -e "${GREEN}Commenting on PR #$number...${NC}"
        gh pr comment "$number" --body "$PR_MESSAGE"
    fi
}

# Comment on all issues in range
comment_all_issues() {
    print_header "Commenting on issues with $MIN_DAYS-$MAX_DAYS days of inactivity"

    local issues=$(gh issue list --state open --json number,title,updatedAt --limit 200)

    echo "$issues" | jq -c '.[]' | while read -r issue; do
        local number=$(echo "$issue" | jq -r '.number')
        local updated_at=$(echo "$issue" | jq -r '.updatedAt')
        local days=$(get_days_since_update "$updated_at")

        if [[ $days -ge $MIN_DAYS && $days -le $MAX_DAYS ]]; then
            comment_issue "$number"
        fi
    done
}

# Comment on all PRs in range
comment_all_prs() {
    print_header "Commenting on PRs with $MIN_DAYS-$MAX_DAYS days of inactivity"

    local prs=$(gh pr list --state open --json number,title,updatedAt --limit 200)

    echo "$prs" | jq -c '.[]' | while read -r pr; do
        local number=$(echo "$pr" | jq -r '.number')
        local updated_at=$(echo "$pr" | jq -r '.updatedAt')
        local days=$(get_days_since_update "$updated_at")

        if [[ $days -ge $MIN_DAYS && $days -le $MAX_DAYS ]]; then
            comment_pr "$number"
        fi
    done
}

# Main menu
show_usage() {
    echo ""
    echo -e "${BLUE}Stale Bot Phase 2 - Communication Script${NC}"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  list-issues     List all issues with $MIN_DAYS-$MAX_DAYS days of inactivity"
    echo "  list-prs        List all PRs with $MIN_DAYS-$MAX_DAYS days of inactivity"
    echo "  list-all        List both issues and PRs"
    echo "  comment-issues  Post notification comments on all qualifying issues"
    echo "  comment-prs     Post notification comments on all qualifying PRs"
    echo "  comment-all     Post notification comments on all qualifying items"
    echo "  comment-issue   Post notification on a specific issue (requires issue number)"
    echo "  comment-pr      Post notification on a specific PR (requires PR number)"
    echo ""
    echo "Environment variables:"
    echo "  DRY_RUN=false   Actually post comments (default: true = dry run)"
    echo "  MIN_DAYS=N      Minimum days of inactivity (default: 15)"
    echo "  MAX_DAYS=N      Maximum days of inactivity (default: 60)"
    echo ""
    echo "Examples:"
    echo "  $0 list-all                    # Preview what would be affected"
    echo "  DRY_RUN=false $0 comment-all   # Actually post all comments"
    echo "  $0 comment-issue 123           # Dry run comment on issue #123"
    echo ""
}

# Main
case "${1:-}" in
    list-issues)
        find_stale_issues
        ;;
    list-prs)
        find_stale_prs
        ;;
    list-all)
        find_stale_issues
        find_stale_prs
        ;;
    comment-issues)
        comment_all_issues
        ;;
    comment-prs)
        comment_all_prs
        ;;
    comment-all)
        comment_all_issues
        comment_all_prs
        ;;
    comment-issue)
        if [[ -z "${2:-}" ]]; then
            echo -e "${RED}Error: Issue number required${NC}"
            exit 1
        fi
        comment_issue "$2"
        ;;
    comment-pr)
        if [[ -z "${2:-}" ]]; then
            echo -e "${RED}Error: PR number required${NC}"
            exit 1
        fi
        comment_pr "$2"
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
