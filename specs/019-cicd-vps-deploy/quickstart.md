# Quickstart: Setting up automatic deploys (Slice 19)

This is the one-time setup — both on GitHub and on the VPS — required
before the `deploy.yml` GitHub Actions workflow can deploy PatchPlanner
automatically. It assumes the VPS is already set up per
`specs/018-deployment/quickstart.md` (nginx/Certbot, the `patchplanner`
systemd service, `/opt/patchplanner` populated by hand at least once).

## 1. Generate a deploy-only SSH key

On your own machine (not the VPS, not a shared personal key):

```bash
ssh-keygen -t ed25519 -f ./patchplanner-deploy-key -C "patchplanner-ci-deploy" -N ""
```

This produces `patchplanner-deploy-key` (private) and
`patchplanner-deploy-key.pub` (public). The private key will become a
GitHub secret; never commit either file.

## 2. Create the `deploy` user on the VPS

As root/sudo on the VPS:

```bash
useradd --system --create-home --shell /bin/bash deploy
mkdir -p /home/deploy/.ssh
cat patchplanner-deploy-key.pub >> /home/deploy/.ssh/authorized_keys   # paste the .pub contents
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# The deploy user needs to own the app directory to write new binaries
# without elevated privilege:
chown -R deploy:deploy /opt/patchplanner
```

## 3. Grant the narrow `sudo` rule

```bash
visudo -f /etc/sudoers.d/patchplanner-deploy
```

Contents (exactly this, nothing broader):

```
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart patchplanner, /usr/bin/systemctl status patchplanner
```

## 4. Install the deploy script on the VPS

From the repository, copy `deploy/remote-deploy.sh` to the server and
make it executable:

```bash
scp deploy/remote-deploy.sh deploy@your-server:/opt/patchplanner/deploy.sh
ssh deploy@your-server chmod +x /opt/patchplanner/deploy.sh
```

Re-run this step any time `deploy/remote-deploy.sh` changes in the repo —
it is not copied automatically by the pipeline itself (see
`contracts/remote-deploy-script.md` for why: the pipeline may only ever
invoke a script the operator already vetted and placed there, not push
arbitrary new shell to run as the deploy user).

## 5. Capture and pin the VPS's host key

From your own machine:

```bash
ssh-keyscan -H your-server >> known_hosts_capture
cat known_hosts_capture
```

Copy the full output — you'll paste it into a GitHub secret in step 7.
(See `research.md`'s "SSH credentials and host verification" section for
why this is captured once by hand rather than trusted automatically from
the CI runner.)

## 6. Confirm the health endpoint is reachable locally on the VPS

```bash
ssh deploy@your-server curl -sf http://127.0.0.1:7331/health
```

Should return a `200`. If this doesn't work, fix it before wiring up CI —
the deploy script's automatic self-heal depends on this endpoint
responding correctly on a healthy process.

## 7. Add GitHub repository secrets

In the GitHub repo: **Settings → Secrets and variables → Actions → New
repository secret**. Add all of:

| Secret | Value |
|--------|-------|
| `DEPLOY_SSH_HOST` | The VPS's hostname or IP address. |
| `DEPLOY_SSH_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | The full contents of `patchplanner-deploy-key` (the private key from step 1). |
| `DEPLOY_KNOWN_HOSTS` | The full output captured in step 5. |

Delete the local private key file (`patchplanner-deploy-key`) once it's
saved as a secret — you don't need a copy lying around after this.

## 8. Try it

1. Push a small, easily-verifiable change to `main` (or open the repo's
   **Actions** tab and manually run the `Deploy` workflow via **Run
   workflow**).
2. Watch the run in the **Actions** tab — it should go green through
   build, test, and deploy.
3. Visit the production address and confirm the change is live.

## What's not covered here

The very first deploy — getting the initial binary, `migrations/`, env
file, and systemd unit onto a freshly provisioned VPS — is
`specs/018-deployment/quickstart.md`'s job, not this one. This quickstart
only wires up *automatic* deploys onto a VPS that's already serving the
application at least once.
