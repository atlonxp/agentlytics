#!/bin/sh
# Install a local hostname -> agentlytics daemon on macOS.
#
# Usage:  sudo sh scripts/install-local-domain.sh [domain] [port]
# Defaults: domain=agentlytics.local, port=4637
#
# What it does:
#   1. Adds <domain> -> 127.0.0.1 to /etc/hosts
#   2. Writes a pf rule that forwards :80 -> :<port> on the loopback interface
#   3. Installs a LaunchDaemon so the pf rule is reloaded after every reboot
#   4. Applies the pf rule and flushes DNS cache so it takes effect immediately
#
# After running, the dashboard is reachable at http://<domain> in Safari/Chrome.
# Note: curl on .local domains may time out on IPv6 resolution; use `curl -4`.
set -e

DOMAIN="${1:-agentlytics.local}"
PORT="${2:-4637}"
ANCHOR_FILE="/etc/pf.anchors/${DOMAIN}"
PLIST="/Library/LaunchDaemons/local.agentlytics.domain.plist"

if [ "$(id -u)" != "0" ]; then
  echo "Run as root: sudo sh $0 [domain] [port]"
  exit 1
fi

echo "Installing ${DOMAIN} -> 127.0.0.1:${PORT}"

# 1) /etc/hosts entry
if ! grep -qE "[[:space:]]${DOMAIN}([[:space:]]|\$)" /etc/hosts; then
  printf "\n127.0.0.1  %s\n" "$DOMAIN" >> /etc/hosts
  echo "  added ${DOMAIN} to /etc/hosts"
else
  echo "  ${DOMAIN} already in /etc/hosts"
fi

# 2) pf rule file
cat > "$ANCHOR_FILE" <<EOF
rdr pass on lo0 inet proto tcp from any to any port 80 -> 127.0.0.1 port ${PORT}
EOF
chmod 644 "$ANCHOR_FILE"
echo "  wrote ${ANCHOR_FILE}"

# 3) LaunchDaemon for boot persistence
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>local.agentlytics.domain</string>
  <key>ProgramArguments</key>
  <array>
    <string>/sbin/pfctl</string>
    <string>-E</string>
    <string>-f</string>
    <string>${ANCHOR_FILE}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>UserName</key>
  <string>root</string>
  <key>StandardOutPath</key>
  <string>/var/log/agentlytics-pf.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/agentlytics-pf.log</string>
</dict>
</plist>
EOF
chmod 644 "$PLIST"
echo "  wrote ${PLIST}"

# 4) Load daemon now
launchctl bootout system/local.agentlytics.domain 2>/dev/null || true
launchctl bootstrap system "$PLIST"
echo "  launchd bootstrapped"

# 5) Apply rule immediately (in case boot-time reload hasn't fired)
pfctl -E >/dev/null 2>&1 || true
pfctl -f "$ANCHOR_FILE" 2>/dev/null || pfctl -f "$ANCHOR_FILE"
echo "  pf rule active"

# 6) Flush DNS cache so .local resolves immediately
dscacheutil -flushcache
killall -HUP mDNSResponder 2>/dev/null || true
echo "  DNS cache flushed"

echo ""
echo "done. open http://${DOMAIN} in your browser."
