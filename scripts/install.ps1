# QNSC MCP Toolkit - Windows Installation Script
# Usage: irm https://raw.githubusercontent.com/quynhonsemiconductor/mcp-tools/main/scripts/install.ps1 | iex

param(
    [string]$Version = "latest",
    [string]$InstallDir = "$env:ProgramFiles\QNSC-MCP",
    [string]$GitHubToken = $env:GITHUB_TOKEN
)

$ErrorActionPreference = "Stop"

# Configuration
$RepoOwner = "quynhonsemiconductor"
$RepoName = "mcp-tools"
$ApiBaseUrl = "https://api.github.com"
$ConfigDir = "$env:USERPROFILE\.qnscmcp"
$ConfigFile = "$ConfigDir\config.yaml"
$isRunningAsAdmin = $false

# Colors for output
function Write-Header {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
    Write-Host "  🧰 QNSC MCP Toolkit Installation" -ForegroundColor Blue
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host $Message -ForegroundColor White
}

# Check if running as administrator
function Test-Administrator {
    $currentUser = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Detect platform (Windows x64 only for now)
function Get-Platform {
    $arch = $env:PROCESSOR_ARCHITECTURE
    
    if ($arch -eq "AMD64" -or $arch -eq "x86_64") {
        return "win-x64"
    }
    else {
        Write-Error-Custom "Unsupported architecture: $arch"
        Write-Info "Supported architectures: x64"
        exit 1
    }
}

# Get latest release version
function Get-LatestVersion {
    param([string]$Token)
    
    Write-Step "🔍 Fetching latest release version..."
    
    try {
        $headers = @{
            "Authorization" = "token $Token"
            "Accept"        = "application/vnd.github.v3+json"
        }
        
        $releaseUrl = "$ApiBaseUrl/repos/$RepoOwner/$RepoName/releases/latest"
        $response = Invoke-RestMethod -Uri $releaseUrl -Headers $headers -UseBasicParsing
        
        if ($response.tag_name) {
            Write-Success "Latest version: $($response.tag_name)"
            return $response.tag_name
        }
        else {
            Write-Warning-Custom "Failed to fetch latest version"
            Write-Info "Using default version: v2.17.0"
            return "v2.17.0"
        }
    }
    catch {
        Write-Warning-Custom "Failed to fetch latest version: $($_.Exception.Message)"
        Write-Info "Using default version: v2.17.0"
        return "v2.17.0"
    }
}

# Download binary
function Get-Binary {
    param(
        [string]$Platform,
        [string]$Version,
        [string]$Token
    )
    
    $assetName = "qnsc-mcp-$Platform.exe"
    $tempFile = "$env:TEMP\qnsc-mcp-$Platform-$(Get-Random).exe"
    
    Write-Step "📥 Downloading qnsc-mcp $Version for $Platform..."
    
    try {
        $headers = @{}
        if ($Token) {
            $headers["Authorization"] = "token $Token"
            $headers["Accept"] = "application/vnd.github.v3+json"
            Write-Info "Using GitHub token for authentication"
        }
        else {
            Write-Warning-Custom "No GitHub token provided. Download may fail for private repositories."
            Write-Info "Set GITHUB_TOKEN environment variable or pass -GitHubToken parameter."
        }
        
        # Determine the release endpoint
        if ($Version -eq "latest") {
            $releaseUrl = "$ApiBaseUrl/repos/$RepoOwner/$RepoName/releases/latest"
        }
        else {
            $releaseUrl = "$ApiBaseUrl/repos/$RepoOwner/$RepoName/releases/tags/$Version"
        }
        
        # Get release information to find asset ID
        Write-Info "Fetching release information..."
        $releaseInfo = Invoke-RestMethod -Uri $releaseUrl -Headers $headers -UseBasicParsing
        
        # Find the asset for this platform
        $asset = $releaseInfo.assets | Where-Object { $_.name -eq $assetName }
        
        if (-not $asset) {
            Write-Error-Custom "Could not find asset '$assetName' in release $Version"
            Write-Info "Available assets:"
            $releaseInfo.assets | ForEach-Object { Write-Host "  - $($_.name)" }
            throw "Asset not found"
        }
        
        $assetId = $asset.id
        Write-Info "Found asset ID: $assetId"
        Write-Info "Downloading binary..."
        
        # Download the asset using the API endpoint with asset ID
        $downloadUrl = "$ApiBaseUrl/repos/$RepoOwner/$RepoName/releases/assets/$assetId"
        $downloadHeaders = @{
            "Authorization" = "token $Token"
            "Accept"        = "application/octet-stream"
        }
        
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempFile -Headers $downloadHeaders -UseBasicParsing
        
        # Verify download completed and file has content
        if (-not (Test-Path $tempFile)) {
            throw "Downloaded file not found: $tempFile"
        }
        
        $fileInfo = Get-Item $tempFile
        if ($fileInfo.Length -eq 0) {
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            throw "Downloaded file is empty"
        }
        
        # Check if file is HTML (authentication redirect page)
        # If the first line contains <!DOCTYPE html> or <html>, it's likely an HTML page
        # Since -Raw and -TotalCount does not play well together (heck, Powershell doesn't even allow it)
        # this is a workaround for that
        $fileContent = Get-Content $tempFile -TotalCount 1 -ErrorAction SilentlyContinue
        if ($fileContent -match "<!DOCTYPE html>|<html") {
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            throw "Download failed: received HTML page instead of binary. This usually means authentication failed."
        }
        
        $fileSizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
        Write-Success "Downloaded successfully ($fileSizeMB MB)"
        return $tempFile
    }
    catch {
        Write-Error-Custom "Failed to download binary"
        if (-not $Token) {
            Write-Info "This is a private repository. Please provide a GitHub token."
        }
        else {
            Write-Info "Make sure your GitHub token has 'repo' access to private repositories"
        }
        Write-Error-Custom $_.Exception.Message
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        exit 1
    }
}

# Install binary
function Install-Binary {
    param(
        [string]$TempFile,
        [string]$InstallDir
    )
    
    Write-Step "📦 Installing binary..."
    
    # Verify temp file exists and has content
    if (-not (Test-Path $TempFile)) {
        Write-Error-Custom "Downloaded file not found: $TempFile"
        exit 1
    }
    
    $fileInfo = Get-Item $TempFile
    if ($fileInfo.Length -eq 0) {
        Write-Error-Custom "Downloaded file is empty: $TempFile"
        Remove-Item $TempFile -Force -ErrorAction SilentlyContinue
        exit 1
    }
    
    # Create installation directory if it doesn't exist
    if (-not (Test-Path $InstallDir)) {
        try {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
            Write-Success "Created directory: $InstallDir"
        }
        catch {
            Write-Error-Custom "Failed to create directory: $InstallDir"
            Write-Error-Custom $_.Exception.Message
            exit 1
        }
    }
    
    $installPath = Join-Path $InstallDir "qnsc-mcp.exe"
    
    # Move binary to installation directory
    try {
        Move-Item -Path $TempFile -Destination $installPath -Force
        Write-Success "Binary installed to $installPath"
    }
    catch {
        Write-Error-Custom "Failed to install binary"
        Write-Error-Custom $_.Exception.Message
        exit 1
    }
    
    return $installPath
}

# Add to PATH
function Add-ToPath {
    param([string]$Directory)
    
    Write-Step "🔧 Adding to system PATH..."
    
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    
    if ($currentPath -like "*$Directory*") {
        Write-Warning-Custom "$Directory is already in PATH"
        return
    }
    
    try {
        $newPath = "$currentPath;$Directory"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        
        # Update PATH for current session
        $env:Path = "$env:Path;$Directory"
        
        Write-Success "Added $Directory to user PATH"
    }
    catch {
        Write-Error-Custom "Failed to add to PATH"
        Write-Error-Custom $_.Exception.Message
        Write-Info "You may need to add $Directory to PATH manually"
    }
}

# Verify installation
function Test-Installation {
    Write-Step "🔍 Verifying installation..."
    
    # Refresh PATH for current session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    try {
        $versionOutput = & qnsc-mcp --version 2>&1
        Write-Success "qnsc-mcp is accessible in PATH"
        Write-Info "Version: $versionOutput"
        return $true
    }
    catch {
        Write-Warning-Custom "qnsc-mcp not found in PATH"
        Write-Info "You may need to restart your terminal or PowerShell session"
        return $false
    }
}

# Prompt for GitHub token
function Get-GitHubToken {
    param([string]$ExistingToken)
    
    # If token already provided, use it
    if ($ExistingToken) {
        Write-Info "Using GitHub token from parameter/environment variable"
        return $ExistingToken
    }
    
    Write-Step "🔑 GitHub Token Setup"
    Write-Host ""
    Write-Host "A GitHub token is required for many QNSC MCP tools."
    Write-Host "You can generate one at: https://github.com/settings/tokens"
    Write-Host ""
    
    $token = Read-Host "Enter your GitHub token (or press Enter to skip)"
    Write-Host ""
    
    if ([string]::IsNullOrWhiteSpace($token)) {
        Write-Warning-Custom "Skipped GitHub token setup"
        Write-Host ""
        return $null
    }
    
    return $token
}

# Setup environment variables
function Set-EnvironmentVariables {
    param([string]$GitHubToken)
    
    Write-Step "⚙️ Setting up environment variables..."
    
    # Ask if user wants to use the same token for tools
    Write-Host ""
    Write-Host "The GitHub token can be saved for use by the qnsc-mcp tools."
    $useToken = Read-Host "Use the same GitHub token for qnsc-mcp tools? (Y/n)"
    Write-Host ""
    
    if ($useToken -eq "n" -or $useToken -eq "N") {
        Write-Host "Enter a GitHub token for the tools (or press Enter to skip):"
        $secureToken = Read-Host "GitHub token" -AsSecureString
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
        $toolToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
        Write-Host ""
        
        if ([string]::IsNullOrWhiteSpace($toolToken)) {
            Write-Warning-Custom "Skipping environment setup"
            Write-Info "You'll need to set GITHUB_TOKEN manually for the tools to work"
            Write-Info "Set it with: [Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'your-token', 'User')"
            return
        }
        
        $GitHubToken = $toolToken
    }
    
    # Check if GITHUB_TOKEN already exists
    $existingToken = [Environment]::GetEnvironmentVariable("GITHUB_TOKEN", "User")
    
    if ($existingToken) {
        Write-Warning-Custom "GITHUB_TOKEN already exists"
        $overwrite = Read-Host "Overwrite? (y/N)"
        if ($overwrite -ne "y" -and $overwrite -ne "Y") {
            Write-Info "Skipped updating GITHUB_TOKEN"
            return
        }
    }
    
    try {
        [Environment]::SetEnvironmentVariable("GITHUB_TOKEN", $GitHubToken, "User")
        
        # Update for current session
        $env:GITHUB_TOKEN = $GitHubToken
        
        Write-Success "Added GITHUB_TOKEN to user environment variables"
        Write-Info "Restart your terminal or PowerShell to apply changes"
    }
    catch {
        Write-Error-Custom "Failed to set environment variable"
        Write-Error-Custom $_.Exception.Message
        Write-Info "Please manually add GITHUB_TOKEN to your environment variables"
    }
}

# Generate configuration file
function New-Configuration {
    Write-Step "📝 Generating configuration file..."
    
    # Create config directory if it doesn't exist
    if (-not (Test-Path $ConfigDir)) {
        New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
    }
    
    if (Test-Path $ConfigFile) {
        Write-Warning-Custom "Configuration file already exists at $ConfigFile"
        $regenerate = Read-Host "Regenerate? (y/N)"
        if ($regenerate -ne "y" -and $regenerate -ne "Y") {
            Write-Info "Skipped configuration generation"
            return
        }
        # Backup existing config
        $backupFile = "$ConfigFile.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
        Copy-Item $ConfigFile $backupFile
        Write-Info "Backed up existing config to $backupFile"
    }
    
    # Generate config using qnsc-mcp command
    try {
        $output = & qnsc-mcp generate-config --force $ConfigFile 2>&1
        Write-Success "Configuration file generated at $ConfigFile"
    }
    catch {
        Write-Warning-Custom "Could not generate config automatically"
        Write-Info "Run 'qnsc-mcp generate-config' manually after installation"
    }
}

# Print next steps
function Write-NextSteps {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  ✅ Installation Complete!" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor White
    Write-Host ""
    
    Write-Host "1. Restart your terminal or PowerShell to apply PATH changes"
    Write-Host ""
    
    Write-Host "2. Verify installation:"
    Write-Host "   qnsc-mcp --version" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "3. Start the web interface and update configuration:"
    Write-Host "   qnsc-mcp web" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "4. Configure VS Code MCP extension:"
    Write-Host "   - Install the MCP extension in VS Code"
    Write-Host "   - Click 'Configure in VS Code' button from README"
    Write-Host ""
    
    Write-Host "Documentation:" -ForegroundColor White
    Write-Host "  📚 https://github.com/quynhonsemiconductor/mcp-tools"
    Write-Host ""
    
    Write-Host "Need help?" -ForegroundColor White
    Write-Host "  💬 Slack: #mcp-tools"
    Write-Host "  🐛 Issues: https://github.com/quynhonsemiconductor/mcp-tools/issues"
    Write-Host ""
}

# Main installation flow
function Main {
    Write-Header
    
    # Check if GitHub token is provided, if not prompt for it
    if (-not $GitHubToken) {
        Write-Step "🔑 GitHub Token Required"
        Write-Host ""
        Write-Host "A GitHub token is required to download from our private repository."
        Write-Host "Generate one at: https://github.com/settings/tokens"
        Write-Host "Required scopes: 'repo' (Full control of private repositories)"
        Write-Host ""
        
        $secureToken = Read-Host "Enter your GitHub token" -AsSecureString
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
        $GitHubToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
        Write-Host ""
        
        if ([string]::IsNullOrWhiteSpace($GitHubToken)) {
            Write-Error-Custom "GitHub token is required to proceed"
            Write-Info "Please provide a valid GitHub token and try again"
            exit 1
        }
        
        Write-Success "GitHub token provided"
    }
    else {
        Write-Info "Using GitHub token from parameter/environment variable"
    }
    
    # Check for administrator privileges
    Write-Step "🔍 Checking privileges..."
    $isRunningAsAdmin = Test-Administrator
    if (-not $isRunningAsAdmin) {
        Write-Warning-Custom "Not running as administrator"
        Write-Info "Installation will proceed with user-level permissions"
        Write-Info "Some features may require administrator privileges"
        Write-Host ""
        # If not running as admin, might as well install to the user directory
        $InstallDir = "$env:USERPROFILE\QNSC-MCP"
    }
    else {
        Write-Success "Running as administrator"
    }
    
    # Detect platform
    Write-Step "🔍 Detecting platform..."
    $platform = Get-Platform
    Write-Success "Detected platform: $platform"
    
    # Get version to install
    if ($Version -eq "latest") {
        $Version = Get-LatestVersion -Token $GitHubToken
    }
    else {
        Write-Info "Using specified version: $Version"
    }
    
    # Check for existing installation
    $existingPath = Get-Command qnsc-mcp -ErrorAction SilentlyContinue
    if ($existingPath) {
        try {
            $currentVersion = & qnsc-mcp --version 2>&1
            Write-Warning-Custom "qnsc-mcp is already installed (version: $currentVersion)"
        }
        catch {
            Write-Warning-Custom "qnsc-mcp is already installed"
        }
        
        $reinstall = Read-Host "Reinstall/update? (y/N)"
        if ($reinstall -ne "y" -and $reinstall -ne "Y") {
            Write-Info "Installation cancelled"
            exit 0
        }
    }
    
    # Download binary
    $tempFile = Get-Binary -Platform $platform -Version $Version -Token $GitHubToken
    
    # Install binary
    $installPath = Install-Binary -TempFile $tempFile -InstallDir $InstallDir
    
    # Add to PATH
    Add-ToPath -Directory $InstallDir
    
    # Verify installation
    $verified = Test-Installation
    
    # Prompt for GitHub token (if not already provided)
    if (-not $GitHubToken) {
        $GitHubToken = Get-GitHubToken -ExistingToken $GitHubToken
    }
    else {
        Write-Info "Using GitHub token from parameter/environment variable"
    }
    
    # Setup environment variables
    if ($GitHubToken) {
        Set-EnvironmentVariables -GitHubToken $GitHubToken
    }
    
    # Generate configuration
    if ($verified) {
        New-Configuration
    }
    else {
        Write-Warning-Custom "Skipping configuration generation (qnsc-mcp not in PATH yet)"
        Write-Info "Run 'qnsc-mcp generate-config' after restarting your terminal"
    }
    
    # Print next steps
    Write-NextSteps
}

# Run main installation
try {
    Main
}
catch {
    Write-Host ""
    Write-Error-Custom "Installation failed"
    Write-Error-Custom $_.Exception.Message
    Write-Host ""
    Write-Info "Please report this issue at:"
    Write-Info "https://github.com/quynhonsemiconductor/mcp-tools/issues"
    exit 1
}
