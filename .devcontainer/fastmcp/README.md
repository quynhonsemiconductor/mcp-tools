# FastMCP Dev Container

This directory contains configuration and documentation for the FastMCP development container.

## Overview

The dev container provides a reproducible environment for developing and testing FastMCP tools and services. It ensures all dependencies and configurations are consistent across different development setups.

## Features

- Pre-configured environment for FastMCP server and tools
- TypeScript and Bun support for development and testing
- Isolated workspace for safe experimentation

## Volume Mount Configuration

The dev container is configured to mount your project directory from the host machine into the container. This ensures that any changes you make to your files locally are immediately reflected inside the container, and vice versa. This setup allows for seamless development and testing without the need to manually sync files.

By default, the workspace folder is mounted into the container at `/workspaces/mcp-tools`. All source code, configuration, and dependencies are accessible and editable from both the host and the container. Changes made in the container persist to your local filesystem.

Note: The `node_modules` directory is mounted to a Docker volume for improved performance on Windows hosts where bulk I/O operations on mounted folders can be slow.

## Usage

1. Open the project in Visual Studio Code.
2. When prompted, reopen the workspace in the dev container.
3. Use the integrated terminal to run commands such as `bun install`, `bun run dev`, or `bun test`.

## Structure

- `Dockerfile`: Defines the container image and installed dependencies.
- `devcontainer.json`: Configures the dev container features and settings, including volume mounts.
- `README.md`: This documentation file.

## Support

For issues or questions, please refer to the main project documentation or contact the maintainers.
