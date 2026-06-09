FROM mcr.microsoft.com/devcontainers/typescript-node:20

# The base image ships with a `node` user (UID 1000, GID 1000). That stays
# as the primary interactive user — we don't touch it. The bind-mounted
# 1Password socket arrives owned by the host's UID/GID (typically 1000:1000
# on a single-user Linux desktop), which lines up with `node` naturally.

# Add a less-privileged sandbox user. It joins the `node` group as a
# supplementary group so that once post-start.sh widens the socket from
# 0600 to 0660, the-robot can connect to it via group-bit access.
RUN useradd -m -u 1001 -G node -s /bin/bash the-robot

# Pre-create the bind-mount target directory so the socket lands inside
# a `node`-owned dir (otherwise Docker would create the parent as root:root,
# and `node` couldn't traverse into it).
RUN mkdir -p /home/node/.1password \
 && chown node:node /home/node/.1password \
 && chmod 0755 /home/node/.1password

# Sudo is handy during dev; post-start.sh uses it to chmod the bind-mounted
# socket and write into /home/the-robot. The base image already grants
# passwordless sudo to `node`.
USER node
WORKDIR /workspaces/frisbee-app
