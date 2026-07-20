# Contract: `deploy/remote-deploy.sh`

This is the one interface the GitHub Actions workflow is allowed to invoke
on the VPS. The workflow never runs arbitrary shell on the server — only
this fixed, version-controlled script, already installed at
`/opt/patchplanner/deploy.sh` during one-time setup.

## Invocation

```bash
ssh -i <deploy-key> deploy@<host> sudo -n /opt/patchplanner/deploy.sh <staging-dir>
```

- Run as the `deploy` system user (never `root` directly).
- `sudo -n` (non-interactive) is only actually required for the two
  `systemctl` calls the script makes internally — see "Privilege" below.

## Input

| Argument | Meaning |
|----------|---------|
| `$1` (`staging-dir`) | Absolute path on the VPS where the new binary (`patchplanner`) and new `migrations/` directory were already placed by the workflow's preceding `scp` step. Required. |

The script MUST fail fast (exit non-zero, no changes made) if:
- `$1` is missing or not a directory.
- `$1/patchplanner` does not exist or is not executable after `chmod +x`.
- `$1/migrations` does not exist.

## Behavior (in order)

1. **Back up** the currently live binary to `patchplanner.prev` (overwriting
   any previous backup) before touching anything else.
2. **Swap the binary atomically**: `mv` the staged binary into the live
   path. `mv` within the same filesystem is atomic, so there is never a
   moment where the live path is empty or a partial file.
3. **Replace `migrations/`** with the staged copy.
4. **Restart the service**: `sudo systemctl restart patchplanner`.
5. **Health-check**: poll `http://127.0.0.1:<port>/health` (port read from
   the same env file the service uses) up to N times with a short delay
   between attempts.
   - **On success** (a `200` response within the retry budget): clean up
     the staging directory, exit `0`.
   - **On failure** (no `200` within the retry budget): restore
     `patchplanner.prev` back to the live path, `sudo systemctl restart
     patchplanner` again, and exit non-zero — the workflow run is then
     reported as failed on GitHub even though the server has already
     self-healed back to the previous good version.

## Output / exit codes

| Exit code | Meaning |
|-----------|---------|
| `0` | New version deployed and confirmed healthy. |
| non-zero | Deploy did not complete successfully. The script's own stdout/stderr (visible in the GitHub Actions log) states which step failed. In every non-zero case, the previously-running version is left serving requests — either because the swap never happened, or because the automatic restore already ran. |

## Privilege (least privilege)

The `deploy` user's `sudoers` entry grants exactly:

```
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart patchplanner, /usr/bin/systemctl status patchplanner
```

No other command may be run as root through this account. All other steps
(writing to `/opt/patchplanner`, moving files, curling localhost) run as
the unprivileged `deploy` user, who owns that directory outright.

## What this contract deliberately does NOT cover

- Obtaining/renewing TLS certificates, nginx configuration, or DNS — all
  already handled by Slice 18's setup and untouched by this script.
- Database migrations themselves — the running binary applies pending
  migrations automatically on startup (existing behavior); this script's
  job is only to get the new binary and migration files in place and
  restart the process that runs them.
- Rolling back to any version other than the immediately-previous one —
  only one backup (`patchplanner.prev`) is kept by this script.
