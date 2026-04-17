#!/bin/sh
# Reverse scripts/install-local-domain.sh.
#
# Usage:  sudo sh scripts/uninstall-local-domain.sh [domain]
# Default: domain=agentlytics.local
set -e

DOMAIN="${1:-agentlytics.local}"
ANCHOR_FILE="/etc/pf.anchors/${DOMAIN}"
PLIST="/Library/LaunchDaemons/local.agentlytics.domain.plist"

if [ "$(id -u)" != "0" ]; then
  echo "Run as root: sudo sh $0 [domain]"
  exit 1
fi

echo "Uninstalling ${DOMAIN}"

# 1) Remove hosts entry
if grep -qE "[[:space:]]${DOMAIN}([[:space:]]|\$)" /etc/hosts; then
  # Remove the line that points to this domain
  sed -i.bak "/[[:space:]]${DOMAIN}$/d; /[[:space:]]${DOMAIN}[[:space:]]/d" /etc/hosts
  echo "  removed ${DOMAIN} from /etc/hosts (backup at /etc/hosts.bak)"
else
  echo "  ${DOMAIN} not in /etc/hosts"
fi

# 2) Unload LaunchDaemon
launchctl bootout system/local.agentlytics.domain 2>/dev/null && echo "  unloaded LaunchDaemon" || echo "  LaunchDaemon not loaded"

# 3) Remove plist + anchor files
[ -f "$PLIST" ] && rm -f "$PLIST" && echo "  removed ${PLIST}"
[ -f "$ANCHOR_FILE" ] && rm -f "$ANCHOR_FILE" && echo "  removed ${ANCHOR_FILE}"

# 4) Flush pf rules (reverts to default)
pfctl -F all 2>/dev/null || true
echo "  pf rules flushed"

# 5) Flush DNS
dscacheutil -flushcache
killall -HUP mDNSResponder 2>/dev/null || true
echo "  DNS cache flushed"

echo ""
echo "done."
