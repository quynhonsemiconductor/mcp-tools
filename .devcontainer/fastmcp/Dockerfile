# Dev Container for FastMCP Server
# See https://containers.dev/ for more info

FROM mcr.microsoft.com/devcontainers/typescript-node:20-bullseye

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Set Bun to PATH
ENV PATH="/root/.bun/bin:${PATH}"

# Install additional dependencies
RUN apt-get update && apt-get install -y git

# Set working directory
WORKDIR /workspace

# Copy dependency files
COPY package.json bun.lock bunfig.toml ./
COPY scripts/ scripts/

# Install dependencies
RUN bun install

# Create a reports directory for test output
RUN mkdir reports

# Copy the rest of the source code
COPY . .

# Expose default FastMCP port (adjust if needed)
EXPOSE 3000

# Default command
CMD ["bun", "run", "start"]
