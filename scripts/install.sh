#!/bin/bash
set -e

# QNSC MCP Toolkit - Universal Installation Script
# Supports: macOS (x64, arm64), Linux (x64, arm64)
# Usage: curl -fsSL -H "Authorization: token YOUR_TOKEN" https://raw.githubusercontent.com/quynhonsemiconductor/mcp-tools/main/scripts/install.sh | bash

VERSION="${QNSC_MCP_VERSION:-latest}"
REPO_OWNER="quynhonsemiconductor"
REPO_NAME="mcp-tools"
API_BASE_URL="https://api.github.com"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="$HOME/.qnscmcp"
CONFIG_FILE="$CONFIG_DIR/config.yaml"

# GitHub token for authentication (can be passed via environment variable)
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Utility functions
print_header() {
    echo ""
    echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}${BOLD}  🧰 QNSC MCP Toolkit Installation${NC}"
    echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_step() {
    echo ""
    echo -e "${BOLD}$1${NC}"
}

# Detect platform and architecture
detect_platform() {
    local os=""
    local arch=""
    
    # Detect OS
    case "$(uname -s)" in
        Darwin*)
            os="macos"
            ;;
        Linux*)
            os="linux"
            ;;
        *)
            print_error "Unsupported operating system: $(uname -s)" >&2
            print_info "Supported platforms: macOS, Linux" >&2
            exit 1
            ;;
    esac
    
    # Detect architecture
    case "$(uname -m)" in
        x86_64|amd64)
            arch="x64"
            ;;
        arm64|aarch64)
            arch="arm64"
            ;;
        *)
            print_error "Unsupported architecture: $(uname -m)" >&2
            print_info "Supported architectures: x64, arm64" >&2
            exit 1
            ;;
    esac
    
    echo "${os}-${arch}"
}

# Check if running with sudo for system-wide installation
check_sudo() {
    if [ "$EUID" -eq 0 ]; then
        print_warning "Running as root/sudo. Installation will be system-wide."
        return 0
    fi
    return 1
}

# Get latest release version
get_latest_version() {
    print_step "🔍 Fetching latest release version..." >&2
    
    local release_url="${API_BASE_URL}/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest"
    
    if command -v curl &> /dev/null; then
        local response=$(curl -fsSL -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github.v3+json" "$release_url" 2>&1)
        local version=$(echo "$response" | grep '"tag_name"' | sed 's/.*"tag_name": "\(.*\)".*/\1/')
        
        if [ -z "$version" ]; then
            print_error "Failed to fetch latest version" >&2
            print_info "Using default version: v2.17.0" >&2
            echo "v2.17.0"
        else
            print_success "Latest version: $version" >&2
            echo "$version"
        fi
    else
        print_warning "curl not found, using default version: v2.17.0" >&2
        echo "v2.17.0"
    fi
}

# Download binary
download_binary() {
    local platform=$1
    local version=$2
    local asset_name="qnsc-mcp-${platform}"
    local temp_file="/tmp/qnsc-mcp-${platform}-$$"
    
    print_step "📥 Downloading qnsc-mcp ${version} for ${platform}..." >&2
    
    # Determine the release endpoint
    local release_url
    if [ "$version" = "latest" ]; then
        release_url="${API_BASE_URL}/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest"
    else
        release_url="${API_BASE_URL}/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${version}"
    fi
    
    if command -v curl &> /dev/null; then
        # Get release information to find asset ID
        print_info "Fetching release information..." >&2
        local release_info=$(curl -fsSL -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github.v3+json" "$release_url" 2>&1)
        
        if [ $? -ne 0 ]; then
            print_error "Failed to fetch release information" >&2
            print_info "Make sure your GitHub token has 'repo' access to private repositories" >&2
            exit 1
        fi
        
        # Extract asset ID for the specific platform binary
        local asset_id=$(echo "$release_info" | grep -B 3 "\"name\": \"${asset_name}\"" | grep '"id"' | head -1 | sed 's/.*: \([0-9]*\).*/\1/')
        
        if [ -z "$asset_id" ]; then
            print_error "Could not find asset '${asset_name}' in release ${version}" >&2
            print_info "Available assets:" >&2
            echo "$release_info" | grep '"name":' | sed 's/.*"name": "\(.*\)".*/  - \1/' >&2
            exit 1
        fi
        
        print_info "Found asset ID: ${asset_id}" >&2
        print_info "Downloading binary..." >&2
        
        # Download the asset using the API endpoint with asset ID
        local download_url="${API_BASE_URL}/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${asset_id}"
        if curl -fsSL -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/octet-stream" -o "$temp_file" "$download_url"; then
            # Verify download completed and file has content
            if [ ! -f "$temp_file" ] || [ ! -s "$temp_file" ]; then
                print_error "Downloaded file is empty or missing" >&2
                rm -f "$temp_file"
                exit 1
            fi
            
            # Check if file is HTML (authentication redirect page)
            if file "$temp_file" 2>/dev/null | grep -q "HTML"; then
                print_error "Download failed: received HTML page instead of binary" >&2
                print_info "This usually means authentication failed" >&2
                print_info "Make sure your GitHub token has 'repo' access to private repositories" >&2
                rm -f "$temp_file"
                exit 1
            fi
            
            print_success "Downloaded successfully ($(du -h "$temp_file" | cut -f1))" >&2
            echo "$temp_file"
        else
            print_error "Failed to download from $download_url" >&2
            print_info "Make sure your GitHub token has 'repo' access to private repositories" >&2
            rm -f "$temp_file"
            exit 1
        fi
    elif command -v wget &> /dev/null; then
        # Get release information to find asset ID
        print_info "Fetching release information..." >&2
        local release_info=$(wget --header="Authorization: token $GITHUB_TOKEN" --header="Accept: application/vnd.github.v3+json" -qO- "$release_url" 2>&1)
        
        if [ $? -ne 0 ]; then
            print_error "Failed to fetch release information" >&2
            print_info "Make sure your GitHub token has 'repo' access to private repositories" >&2
            exit 1
        fi
        
        # Extract asset ID for the specific platform binary
        local asset_id=$(echo "$release_info" | grep -B 3 "\"name\": \"${asset_name}\"" | grep '"id"' | head -1 | sed 's/.*: \([0-9]*\).*/\1/')
        
        if [ -z "$asset_id" ]; then
            print_error "Could not find asset '${asset_name}' in release ${version}" >&2
            print_info "Available assets:" >&2
            echo "$release_info" | grep '"name":' | sed 's/.*"name": "\(.*\)".*/  - \1/' >&2
            exit 1
        fi
        
        print_info "Found asset ID: ${asset_id}" >&2
        print_info "Downloading binary..." >&2
        
        # Download the asset using the API endpoint with asset ID
        local download_url="${API_BASE_URL}/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${asset_id}"
        if wget --header="Authorization: token $GITHUB_TOKEN" --header="Accept: application/octet-stream" -q -O "$temp_file" "$download_url"; then
            # Verify download completed and file has content
            if [ ! -f "$temp_file" ] || [ ! -s "$temp_file" ]; then
                print_error "Downloaded file is empty or missing" >&2
                rm -f "$temp_file"
                exit 1
            fi
            
            # Check if file is HTML (authentication redirect page)
            if file "$temp_file" 2>/dev/null | grep -q "HTML"; then
                print_error "Download failed: received HTML page instead of binary" >&2
                print_info "This usually means authentication failed" >&2
                print_info "Make sure your GitHub token has 'repo' access to private repositories" >&2
                rm -f "$temp_file"
                exit 1
            fi
            
            print_success "Downloaded successfully ($(du -h "$temp_file" | cut -f1))" >&2
            echo "$temp_file"
        else
            print_error "Failed to download from $download_url" >&2
            print_info "Make sure your GitHub token has 'repo' access to private repositories" >&2
            rm -f "$temp_file"
            exit 1
        fi
    else
        print_error "Neither curl nor wget found. Please install one of them." >&2
        exit 1
    fi
}

# Install binary
install_binary() {
    local temp_file=$1
    local install_path="${INSTALL_DIR}/qnsc-mcp"
    
    print_step "📦 Installing binary..."
    
    # Verify temp file exists and has content
    if [ ! -f "$temp_file" ]; then
        print_error "Downloaded file not found: $temp_file"
        exit 1
    fi
    
    if [ ! -s "$temp_file" ]; then
        print_error "Downloaded file is empty: $temp_file"
        rm -f "$temp_file"
        exit 1
    fi
    
    # Check if we need sudo
    if [ -w "$INSTALL_DIR" ]; then
        mv "$temp_file" "$install_path"
        chmod +x "$install_path"
    else
        print_info "Installation requires sudo privileges for $INSTALL_DIR"
        sudo mv "$temp_file" "$install_path"
        sudo chmod +x "$install_path"
    fi
    
    # Remove macOS quarantine attribute if on macOS
    if [[ "$(uname -s)" == "Darwin" ]]; then
        if [ -w "$install_path" ]; then
            xattr -d com.apple.quarantine "$install_path" 2>/dev/null || true
        else
            sudo xattr -d com.apple.quarantine "$install_path" 2>/dev/null || true
        fi
    fi
    
    print_success "Binary installed to $install_path"
}

# Verify installation
verify_installation() {
    print_step "🔍 Verifying installation..."
    
    if command -v qnsc-mcp &> /dev/null; then
        local version=$(qnsc-mcp --version 2>&1 || echo "unknown")
        print_success "qnsc-mcp is accessible in PATH"
        print_info "Version: $version"
    else
        print_error "qnsc-mcp not found in PATH"
        print_info "You may need to restart your terminal or add $INSTALL_DIR to your PATH"
        exit 1
    fi
}

# Setup environment variables
setup_environment() {
    local github_token=$1
    
    if [ -z "$github_token" ]; then
        return 0
    fi
    
    print_step "⚙️ Setting up environment variables..."
    
    # Determine shell config file
    local shell_config=""
    if [ -n "$BASH_VERSION" ]; then
        shell_config="$HOME/.bashrc"
        [ -f "$HOME/.bash_profile" ] && shell_config="$HOME/.bash_profile"
    elif [ -n "$ZSH_VERSION" ]; then
        shell_config="$HOME/.zshrc"
    else
        # Try to detect shell
        case "$SHELL" in
            */zsh)
                shell_config="$HOME/.zshrc"
                ;;
            */bash)
                shell_config="$HOME/.bashrc"
                [ -f "$HOME/.bash_profile" ] && shell_config="$HOME/.bash_profile"
                ;;
            *)
                print_warning "Could not detect shell type. Skipping automatic environment setup."
                print_info "Please manually add: export GITHUB_TOKEN=\"your-token\""
                return 1
                ;;
        esac
    fi
    
    # Check if GITHUB_TOKEN already exists in config
    if grep -q "GITHUB_TOKEN" "$shell_config" 2>/dev/null; then
        print_warning "GITHUB_TOKEN already exists in $shell_config"
        echo -n "Overwrite? (y/N): "
        read -r overwrite < /dev/tty
        if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
            print_info "Skipped updating GITHUB_TOKEN"
            return 0
        fi
        # Remove old entry
        sed -i.bak '/export GITHUB_TOKEN=/d' "$shell_config"
    fi
    
    # Add GITHUB_TOKEN to shell config
    echo "" >> "$shell_config"
    echo "# QNSC MCP Toolkit - Added by installer on $(date)" >> "$shell_config"
    echo "export GITHUB_TOKEN=\"$github_token\"" >> "$shell_config"
    
    print_success "Added GITHUB_TOKEN to $shell_config"
    print_info "Run 'source $shell_config' or restart your terminal to apply changes"
}

# Generate configuration file
generate_config() {
    print_step "📝 Generating configuration file..."
    
    # Create config directory if it doesn't exist
    mkdir -p "$CONFIG_DIR"
    
    if [ -f "$CONFIG_FILE" ]; then
        print_warning "Configuration file already exists at $CONFIG_FILE"
        echo -n "Regenerate? (y/N): "
        read -r regenerate < /dev/tty
        if [[ ! "$regenerate" =~ ^[Yy]$ ]]; then
            print_info "Skipped configuration generation"
            return 0
        fi
        # Backup existing config
        cp "$CONFIG_FILE" "${CONFIG_FILE}.backup.$(date +%s)"
        print_info "Backed up existing config"
    fi
    
    # Generate config using qnsc-mcp command
    if qnsc-mcp generate-config --force "$CONFIG_FILE" &> /dev/null; then
        print_success "Configuration file generated at $CONFIG_FILE"
    else
        print_warning "Could not generate config automatically"
        print_info "Run 'qnsc-mcp generate-config' manually after installation"
    fi
}

# Print next steps
print_next_steps() {
    local shell_config=$1
    
    echo ""
    echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}${BOLD}  ✅ Installation Complete!${NC}"
    echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo ""
    
    if [ -n "$shell_config" ]; then
        echo "1. Restart your terminal or run:"
        echo -e "   ${BLUE}source $shell_config${NC}"
        echo ""
    fi
    
    echo "2. Verify installation:"
    echo -e "   ${BLUE}qnsc-mcp --version${NC}"
    echo ""
    
    echo "3. Start the web interface and update configuration:"
    echo -e "   ${BLUE}qnsc-mcp web${NC}"
    echo ""
    
    echo "4. Configure VS Code MCP extension:"
    echo "   - Install the MCP extension in VS Code"
    echo "   - Click 'Configure in VS Code' button from README"
    echo ""
    
    echo -e "${BOLD}Documentation:${NC}"
    echo "  📚 https://github.com/quynhonsemiconductor/mcp-tools"
    echo ""
    
    echo -e "${BOLD}Need help?${NC}"
    echo "  💬 Slack: #mcp-tools"
    echo "  🐛 Issues: https://github.com/quynhonsemiconductor/mcp-tools/issues"
    echo ""
}

# Main installation flow
main() {
    print_header
    
    # Check if GitHub token is provided, if not prompt for it
    if [ -z "$GITHUB_TOKEN" ]; then
        print_step "🔑 GitHub Token Required"
        echo ""
        echo "A GitHub token is required to download from our private repository."
        echo "Generate one at: https://github.com/settings/tokens"
        echo "Required scopes: 'repo' (Full control of private repositories)"
        echo ""
        printf "Enter your GitHub token: " && read -s GITHUB_TOKEN < /dev/tty && echo
        echo ""
        
        if [ -z "$GITHUB_TOKEN" ]; then
            print_error "GitHub token is required to proceed"
            print_info "Please provide a valid GitHub token and try again"
            exit 1
        fi
        
        print_success "GitHub token provided"
    else
        print_info "Using GitHub token from environment variable"
    fi
    
    # Detect platform
    print_step "🔍 Detecting platform..."
    PLATFORM=$(detect_platform)
    print_success "Detected platform: $PLATFORM"
    
    # Get version to install
    if [ "$VERSION" = "latest" ]; then
        VERSION=$(get_latest_version)
    else
        print_info "Using specified version: $VERSION"
    fi
    
    # Check for existing installation
    if command -v qnsc-mcp &> /dev/null; then
        local current_version=$(qnsc-mcp --version 2>&1 || echo "unknown")
        print_warning "qnsc-mcp is already installed (version: $current_version)"
        echo -n "Reinstall/update? (y/N): "
        read -r reinstall < /dev/tty
        if [[ ! "$reinstall" =~ ^[Yy]$ ]]; then
            print_info "Installation cancelled"
            exit 0
        fi
    fi
    
    # Download binary
    TEMP_FILE=$(download_binary "$PLATFORM" "$VERSION")
    
    # Install binary
    install_binary "$TEMP_FILE"
    
    # Verify installation
    verify_installation
    
    # Prompt for GitHub token if not already in environment
    # (The token used for download may be different from the one for tools)
    TOOL_TOKEN=""
    if [ -n "$GITHUB_TOKEN" ]; then
        print_step "🔑 GitHub Token for Tool Configuration"
        echo ""
        echo "Use the same token for QNSC MCP tools? (Y/n): "
        read -r use_same < /dev/tty
        echo ""
        
        if [[ "$use_same" =~ ^[Nn]$ ]]; then
            echo -n "Enter a different GitHub token (or press Enter to skip): "
            read -r TOOL_TOKEN < /dev/tty
            echo ""
            if [ -z "$TOOL_TOKEN" ]; then
                print_warning "Skipped GitHub token configuration for tools"
            fi
        else
            TOOL_TOKEN="$GITHUB_TOKEN"
            print_success "Will use the same token for tool configuration"
        fi
    fi
    
    # Setup environment variables
    SHELL_CONFIG=""
    if [ -n "$TOOL_TOKEN" ]; then
        setup_environment "$TOOL_TOKEN"
        
        # Determine shell config for next steps
        if [ -n "$ZSH_VERSION" ] || [[ "$SHELL" == */zsh ]]; then
            SHELL_CONFIG="$HOME/.zshrc"
        elif [ -n "$BASH_VERSION" ] || [[ "$SHELL" == */bash ]]; then
            SHELL_CONFIG="$HOME/.bashrc"
            [ -f "$HOME/.bash_profile" ] && SHELL_CONFIG="$HOME/.bash_profile"
        fi
    fi
    
    # Generate configuration
    generate_config
    
    # Print next steps
    print_next_steps "$SHELL_CONFIG"
}

# Run main installation
main
