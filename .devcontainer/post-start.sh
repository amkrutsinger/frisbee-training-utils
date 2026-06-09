#!/usr/bin/env bash
# .devcontainer/post-start.sh
#
# Runs every time the container starts. Its job is to make the bind-mounted
# 1Password SSH agent socket usable by BOTH:
#   - `node`        — the primary interactive user (configured via env var
#                     in docker-compose.yml, no work needed here)
#   - `the-robot`   — a less-privileged sandbox user (configured here)
#
# Two notions worth disambiguating:
#
#   * SSH KEY FORWARDING (`ssh -A`) literally forwards your local agent
#     end-to-end to a remote host. Convenient but trust-extensive: anything
#     running as you on the remote can hijack signing for the duration of
#     the session. We do NOT do this.
#
#   * SSH SOCKET FORWARDING (what we do via the compose bind-mount) only
#     exposes the agent's Unix-domain socket to another security context
#     (here: this container). Signing requests cross the boundary;
#     private keys stay in 1Password's vault on the host, and 1Password
#     still gates each signing request behind biometric / system unlock.
#     Cheap, narrow blast radius.
#
# Why two different discovery mechanisms for two users on the same host?
#
#   * `node` gets SSH_AUTH_SOCK set in compose `environment:`. That env
#     var is the canonical OpenSSH discovery channel — ssh, git, and
#     ssh-add all read it with zero per-tool config.
#
#   * `the-robot` gets a static `IdentityAgent` line in ~/.ssh/config.
#     We can't lean on SSH_AUTH_SOCK for it because when VS Code's Remote
#     extensions attach to the container, they unconditionally overwrite
#     SSH_AUTH_SOCK with their own forwarding socket at
#     /tmp/vscode-ssh-auth-<uuid>.sock — and that UUID rotates on every
#     reconnect. Anything pinned to that env var silently breaks on
#     reload. A static file-based IdentityAgent path is immune.

set -euo pipefail

SOCK=/home/node/.1password/agent.sock

# Guard: only proceed when the bind-mount actually delivered a socket.
# If 1Password isn't running on the host (or the user hasn't enabled the
# SSH agent integration), the bind-mount target will either be missing or
# show up as an empty regular file. `test -S` correctly rejects both.
# This keeps the script safe to run on a host without 1Password configured.
if [ ! -S "$SOCK" ]; then
  echo "[post-start] No 1Password agent socket at $SOCK — skipping SSH setup."
  exit 0
fi

# Bind-mounted sockets carry the host's mode (typically 0600, owner-only).
# Relax to 0660 so members of the shared group (the-robot is a supplementary
# member of `node`'s group) can connect.
#
# IMPORTANT: this chmod mutates the file ON THE HOST too — bind-mounts share
# the inode. Widening from 0600 to 0660 on a socket that lives entirely
# inside the user's $HOME is safe (only other processes running as the same
# user could see it anyway), but be aware before chmod'ing other bind-mounts.
sudo chmod 0660 "$SOCK"

# --- node's ~/.ssh ---
#
# Even though compose sets SSH_AUTH_SOCK for `node`, VS Code's Remote-
# Containers extension overrides it inside any terminal it launches,
# pointing SSH at /tmp/vscode-ssh-auth-<uuid>.sock (which does NOT contain
# your 1Password keys). Symptom: `git push` from a VS Code terminal fails
# with "Permission denied (publickey)" while a non-VS-Code shell works.
#
# Belt-and-braces: write an IdentityAgent line into node's ~/.ssh/config.
# OpenSSH reads IdentityAgent from disk and ignores SSH_AUTH_SOCK when it's
# set, so the VS Code clobber becomes harmless.
NODE_SSH=/home/node/.ssh
install -d -m 0700 "$NODE_SSH"
cat > "$NODE_SSH/config" <<'EOF'
Host *
    IdentityAgent /home/node/.1password/agent.sock
EOF
chmod 0600 "$NODE_SSH/config"

# --- the-robot's ~/.ssh ---
ROBOT_HOME=/home/the-robot
ROBOT_SSH="$ROBOT_HOME/.ssh"

# 0700 on the directory, owned by the-robot. OpenSSH refuses to read configs
# from a world- or group-writable .ssh dir, so the modes here matter.
sudo install -d -m 0700 -o the-robot -g the-robot "$ROBOT_SSH"

# Static IdentityAgent path — survives VS Code reconnects (see header).
# Written via `tee` because the heredoc needs to land in a path the-robot
# owns, but we're invoking from `node`.
sudo tee "$ROBOT_SSH/config" >/dev/null <<'EOF'
Host *
    IdentityAgent /home/node/.1password/agent.sock
EOF
sudo chmod 0600 "$ROBOT_SSH/config"
sudo chown the-robot:the-robot "$ROBOT_SSH/config"

# Reuse the primary user's known_hosts so the-robot doesn't get an
# interactive host-key prompt on first push. `node`'s known_hosts is
# populated by postCreateCommand via ssh-keyscan.
NODE_KNOWN=/home/node/.ssh/known_hosts
if [ -f "$NODE_KNOWN" ]; then
  sudo install -m 0644 -o the-robot -g the-robot \
    "$NODE_KNOWN" "$ROBOT_SSH/known_hosts"
fi

echo "[post-start] SSH agent forwarding ready for node and the-robot."
