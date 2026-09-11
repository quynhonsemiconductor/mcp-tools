#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time
import urllib.parse

import requests


def run_gh_command(command, retries=3, delay=2):
    """Run a GitHub CLI command with retry logic"""
    for attempt in range(retries + 1):
        try:
            result = subprocess.run(command, capture_output=True, text=True, check=True, encoding="utf-8")
            return json.loads(result.stdout)
        except subprocess.CalledProcessError as e:
            if attempt < retries and "rate limit exceeded" in e.stderr.lower():
                wait_time = delay * (2 ** attempt)
                print(f"Rate limited. Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
            else:
                print(f"Error running command: {' '.join(command)}", file=sys.stderr)
                print(f"Error output: {e.stderr}", file=sys.stderr)
                sys.exit(1)
        except json.JSONDecodeError:
            if attempt < retries:
                wait_time = delay * (2 ** attempt)
                print(f"Failed to parse JSON. Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
            else:
                print(f"Error parsing JSON from command: {' '.join(command)}", file=sys.stderr)
                sys.exit(1)


GH_HOST = os.environ.get("GH_HOST", "github.com")


def fetch_contributors():
    """Fetch all contributors to the repository"""
    print("Fetching contributors...")
    command = ["gh", "api", "--hostname", GH_HOST, "/repos/quynhonsemiconductor/mcp-tools/contributors?per_page=100"]
    return run_gh_command(command)


def fetch_user_details(username):
    """Fetch detailed information for a GitHub user"""
    print(f"Fetching details for user: {username}")
    command = ["gh", "api", "--hostname", GH_HOST, f"/users/{username}"]
    return run_gh_command(command)


def get_slack_avatar(email):
    """Get the profile picture URL for a Slack user using their email"""
    if not email:
        return None

    slack_token = os.environ.get("SLACK_TOKEN")
    if not slack_token:
        print("Warning: SLACK_TOKEN environment variable not set")
        return None

    try:
        print(f"Looking up Slack user by email: {email}")

        command = [
            "curl",
            "-s",
            "-X", "GET",
            "-H", f"Authorization: Bearer {slack_token}",
            f"https://slack.com/api/users.lookupByEmail?email={urllib.parse.quote(email)}"
        ]

        result = subprocess.run(command, capture_output=True, text=True, check=True, encoding="utf-8")
        response = json.loads(result.stdout)

        if response.get("ok", False):
            user = response.get("user", {})
            profile = user.get("profile", {})

            # Get highest resolution image available
            image_url = (
                profile.get("image_512") or
                profile.get("image_192") or
                profile.get("image_72") or
                profile.get("image_48")
            )

            if image_url:
                print(f"Found Slack avatar for {email}: {image_url}")
                return image_url

        print(f"No Slack user found for email: {email}")
        return None

    except Exception as e:
        print(f"Error looking up Slack user for {email}: {e}")
        return None


def fetch_okta_details(email):
    """Fetch title information from Okta API for a given email.

    upstream-specific (Okta domain, no QNSC equivalent) — QNSC's IdP is
    Entra ID, not Okta (see TECH_STACK.md ADR-16/27). Safe no-op here: without
    OKTA_API_KEY set (it won't be for QNSC), this returns None immediately.
    Port to Microsoft Graph if per-contributor title/location is wanted.
    """
    if not email:
        return None

    okta_domain = "login.microsoftonline.com"
    api_token = os.environ.get("OKTA_API_KEY")

    if not api_token:
        print("Warning: OKTA_API_KEY environment variable not set.")
        return None

    print(f"Fetching Okta details for: {email}")

    try:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"SSWS {api_token}",
        }

        email_encoded = urllib.parse.quote(email)

        response = requests.get(
            f"https://{okta_domain}/api/v1/users/{email_encoded}", headers=headers
        )

        response.raise_for_status()
        user = response.json()

        return {
            "title": user.get("profile", {}).get("title"),
            "location": user.get("zipcode"),
        }

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f"No Okta user found for email: {email}")
        else:
            print(f"Error fetching Okta details for {email}: {str(e)}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"Error fetching Okta details for {email}: {str(e)}")
        return None


def main():
    contributors = fetch_contributors()
    detailed_contributors = []

    print(f"Found {len(contributors)} contributors. Processing...")

    for i, contributor in enumerate(contributors):
        if i > 0:
            time.sleep(1)  # Avoid rate limiting

        username = contributor["login"]
        user_details = fetch_user_details(username)

        email = user_details.get("email")
        if not email:
            email = username.lower().replace("-", ".") + "@qnsc.vn"

        okta_details = fetch_okta_details(email)
        name = user_details.get("name") or username

        # Get Slack avatar URL, fall back to GitHub avatar
        slack_avatar_url = get_slack_avatar(email)
        github_avatar_url = user_details.get("avatar_url")

        detailed_contributor = {
            "username": username,
            "contributions": contributor["contributions"],
            "email": email,
            "name": name,
            "avatar_url": slack_avatar_url,
            "github_avatar_url": github_avatar_url,
            "github_location": user_details.get("location"),
            "okta_title": okta_details.get("title") if okta_details else None,
        }

        detailed_contributors.append(detailed_contributor)

    print("\nSummary:")
    print(f"{'Username':<15} {'Name':<20} {'Email':<25} {'Location':<15} {'Title':<20} {'Contributions'}")
    print("-" * 100)

    for contributor in detailed_contributors:
        print(
            f"{contributor['username']:<15} {(contributor['name'] or '')[:18]:<20} {(contributor['email'] or '')[:23]:<25} {(contributor['github_location'] or '')[:13]:<15} {(contributor['okta_title'] or '')[:18]:<20} {contributor['contributions']}"
        )

    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_file = os.path.join(current_dir, "contributors.json")

    with open(output_file, "w") as f:
        json.dump(detailed_contributors, f, indent=2)

    print(f"\nContributors data saved to {output_file}")


if __name__ == "__main__":
    main()