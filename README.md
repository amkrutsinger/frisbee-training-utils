# Disc-patch

Tiny React app that calls out random commands from a list at random intervals — for solo drill practice.

## Setup (devcontainer)

This repo is configured for a VS Code dev container so you don't need Node on the host.

1. Open the folder in VS Code with the **Dev Containers** extension installed.
2. Run **Dev Containers: Reopen in Container** from the command palette.
3. First boot will install dependencies via `postCreateCommand`.
4. Run the dev server:
   ```bash
   npm run dev
   ```
5. Visit http://localhost:5173 — VS Code forwards port 5173 from the container.

## How it works

- **Setup**: enter commands (comma-separated), min/max seconds per command, and optionally avoid immediate repeats.
- **Go**: starts a stopwatch and announces a random command, both on screen and via the Web Speech API.
- **Pause/Resume**: freezes the clock and the cycling timer; resume re-announces the current command.
- **Stop**: returns to setup.

## iOS notes

- Speech requires a user gesture; the first command is spoken synchronously from the Go-button click.
- Wake Lock keeps the screen on during a session (silently no-ops where unsupported).
- Test on iPhone: visit `http://<your-laptop-LAN-ip>:5173` from Safari on the same Wi-Fi network.
