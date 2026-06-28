#!/usr/bin/env python3
"""
Deploy AIHub Collector to the production server via paramiko (password SSH/SFTP).

Usage (from aihub project root):
    DEPLOY_HOST=43.247.134.85 \
    DEPLOY_PORT=2222 \
    DEPLOY_PASSWORD=*** \
    DEEPSEEK_API_KEY=sk-... \
    python scripts/deploy-remote.py

All secrets come from environment variables; nothing is hardcoded.
The remote /opt/aihub .env / .env.local / .collector-state are preserved.
"""
import io
import os
import sys
import tarfile
import time

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "43.247.134.85")
PORT = int(os.environ.get("DEPLOY_PORT", "2222"))
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
REMOTE_APP = os.environ.get("DEPLOY_APP_DIR", "/opt/aihub")
REMOTE_DEPLOY = os.environ.get("DEPLOY_PKG_DIR", "/opt/aihub-deploy")
REMOTE_BACKUP = os.environ.get("DEPLOY_BACKUP_DIR", "/opt/aihub-backups")

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_API_URL = os.environ.get("DEEPSEEK_API_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-pro")

# Directories/files excluded from the upload tarball.
EXCLUDE_DIRS = {
    "node_modules", ".next", ".git", ".venv-scrapling", ".collector-state",
    "exports", "logs", "docs", "__pycache__",
}
EXCLUDE_SUFFIX = (".log", ".tar.gz", ".zip", ".tsbuildinfo", ".csv", ".docx", ".jsonl")
EXCLUDE_NAMES = {".env", ".env.local"}  # never ship local secrets; server keeps its own

STAMP = time.strftime("%Y%m%d-%H%M%S")
TARBALL = f"aihub-deploy-{STAMP}.tar.gz"


def safe_print(text):
    print(text.encode(sys.stdout.encoding or "utf-8", "replace").decode(sys.stdout.encoding or "utf-8"), flush=True)


def log(msg):
    print(f"[deploy] {msg}", flush=True)


def should_skip(rel_path):
    parts = rel_path.replace("\\", "/").split("/")
    if any(p in EXCLUDE_DIRS for p in parts):
        return True
    name = parts[-1]
    if name in EXCLUDE_NAMES:
        return True
    if name.endswith(EXCLUDE_SUFFIX):
        return True
    return False


def build_tarball(project_root):
    log(f"packing source -> {TARBALL}")
    count = 0
    with tarfile.open(TARBALL, "w:gz") as tar:
        for root, dirs, files in os.walk(project_root):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for f in files:
                abs_path = os.path.join(root, f)
                rel = os.path.relpath(abs_path, project_root)
                if should_skip(rel):
                    continue
                tar.add(abs_path, arcname=rel)
                count += 1
    size_mb = os.path.getsize(TARBALL) / 1024 / 1024
    log(f"packed {count} files, {size_mb:.1f} MB")


def run(client, cmd, check=True, timeout=900):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        safe_print(out.rstrip())
    if err.strip():
        safe_print(err.rstrip())
    if check and code != 0:
        raise RuntimeError(f"remote command failed (exit {code}): {cmd}")
    return code, out, err


def main():
    if not PASSWORD:
        log("ERROR: DEPLOY_PASSWORD env var is required.")
        sys.exit(1)

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    build_tarball(project_root)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    log(f"connecting {USER}@{HOST}:{PORT}")
    client.connect(
        HOST,
        PORT,
        USER,
        PASSWORD,
        timeout=30,
        banner_timeout=60,
        auth_timeout=60,
        allow_agent=False,
        look_for_keys=False,
    )

    try:
        run(client, f"mkdir -p {REMOTE_DEPLOY} {REMOTE_BACKUP}")

        # 1. Upload tarball via SFTP.
        remote_tar = f"{REMOTE_DEPLOY}/{TARBALL}"
        log(f"uploading -> {remote_tar}")
        sftp = client.open_sftp()
        sftp.put(TARBALL, remote_tar)
        sftp.close()

        # 2. Backup current app (code only; excludes node_modules/.next for speed).
        backup_dir = f"{REMOTE_BACKUP}/aihub-{STAMP}"
        log(f"backing up current app -> {backup_dir}")
        run(client,
            f"mkdir -p {backup_dir} && "
            f"cd {REMOTE_APP} && "
            f"tar czf {backup_dir}/code.tar.gz "
            f"--exclude=node_modules --exclude=.next --exclude=.git . 2>/dev/null || true")

        # 3. Extract new code over the app dir (env + collector-state preserved
        #    because they're excluded from the tarball, so existing files stay).
        log("extracting new code over app dir")
        run(client, f"cd {REMOTE_APP} && tar xzf {remote_tar}")

        # 4. Sync DeepSeek config into server .env.local (idempotent upsert).
        if DEEPSEEK_API_KEY:
            log("syncing DeepSeek config into server .env.local")
            upsert = (
                f"cd {REMOTE_APP} && touch .env.local && "
                + " && ".join(
                    f"(grep -q '^{k}=' .env.local "
                    f"&& sed -i 's#^{k}=.*#{k}={v}#' .env.local "
                    f"|| echo '{k}={v}' >> .env.local)"
                    for k, v in [
                        ("DEEPSEEK_API_KEY", DEEPSEEK_API_KEY),
                        ("DEEPSEEK_API_URL", DEEPSEEK_API_URL),
                        ("DEEPSEEK_MODEL", DEEPSEEK_MODEL),
                    ]
                )
            )
            run(client, upsert)
        else:
            log("DEEPSEEK_API_KEY not provided; leaving server .env.local untouched")

        # 5. Install deps + build + reload PM2.
        log("npm install (this can take a few minutes)")
        run(client, f"cd {REMOTE_APP} && npm install --no-audit --no-fund", timeout=1800)
        log("prisma db push (no schema change expected; safe)")
        run(client, f"cd {REMOTE_APP} && npx prisma db push --skip-generate", check=False, timeout=600)
        log("generating Prisma client")
        run(client, f"cd {REMOTE_APP} && npm run db:generate", timeout=600)
        log("building collector UI")
        run(client, f"cd {REMOTE_APP} && npm run collector:build-ui", timeout=1800)
        log("reloading PM2 services")
        run(client, f"cd {REMOTE_APP} && pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save", check=False)

        # 6. Verify.
        log("verifying services + endpoints")
        run(client, "pm2 ls", check=False)
        run(client,
            "sleep 3; curl -s -o /dev/null -w 'collector HTTP %{http_code}\\n' "
            "http://localhost:3001/collector || true", check=False)

        log("DEPLOY OK")
    finally:
        client.close()
        try:
            os.remove(TARBALL)
        except OSError:
            pass


if __name__ == "__main__":
    main()
