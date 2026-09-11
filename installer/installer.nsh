; Custom NSIS script for QNSC-MCP installer
; The Electron installer app handles installation and PATH modifications.
; This script handles cleanup during uninstallation.

!include "MUI2.nsh"
!include "WordFunc.nsh"

!macro customInstall
  ; No custom install actions needed
  ; The Electron app handles binary installation and PATH
!macroend

!macro customUnInstall
  ; Read the actual install path from registry (set by the Electron installer)
  ; Falls back to default path if registry key doesn't exist
  ReadRegStr $1 HKLM "Software\QNSC-MCP" "InstallPath"
  StrCmp $1 "" 0 +2
    StrCpy $1 "$PROGRAMFILES\QNSC-MCP"

  ; Remove qnsc-mcp.exe from its installed location
  IfFileExists "$1\qnsc-mcp.exe" 0 +2
    Delete "$1\qnsc-mcp.exe"

  ; Remove the install directory if empty
  RMDir "$1"

  ; Clean up our registry key
  DeleteRegKey HKLM "Software\QNSC-MCP"

  ; Remove from system PATH
  ; Read current PATH
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"

  ; Remove our entry from PATH (handles both with and without trailing semicolon)
  ${WordReplace} $0 ";$1" "" "+" $0
  ${WordReplace} $0 "$1;" "" "+" $0
  ${WordReplace} $0 "$1" "" "+" $0

  ; Write updated PATH back
  WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path" $0

  ; Notify system of environment change
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
