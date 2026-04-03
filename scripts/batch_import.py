#!/usr/bin/env python3
"""
Batch import Sumeria CSV files into Sure.

Usage:
  python3 batch_import.py current 2025  # imports all current_2025_*.csv
  python3 batch_import.py savings 2025  # imports all savings_2025_*.csv
  python3 batch_import.py all 2025      # imports both accounts

Environment variables:
  SURE_API_KEY   Sure API key (or place in ~/.sure-api-key)
  SURE_BASE_URL  Base URL of Sure instance (default: http://127.0.0.1:13334)
  SUMERIA_DIR    Directory containing Sumeria CSV files
  SURE_ACCOUNTS  JSON mapping of account kind to [id, name] (overrides defaults)
"""
import json, urllib.request, subprocess, sys, os, glob, shutil
sys.path.insert(0, os.path.dirname(__file__))
import lydia_csv_to_sure as conv
import importlib; importlib.reload(conv)

def _require_env(name, fallback_file=None):
    val = os.environ.get(name)
    if val:
        return val
    if fallback_file and os.path.exists(os.path.expanduser(fallback_file)):
        return open(os.path.expanduser(fallback_file)).read().strip()
    raise SystemExit(f"Error: {name} not set and {fallback_file or 'no fallback'} not found")

TOKEN = _require_env("SURE_API_KEY", "~/.sure-api-key")
BASE = os.environ.get("SURE_BASE_URL", "http://127.0.0.1:13334")
DIR = _require_env("SUMERIA_DIR")
ENV_CMD = "set -a; . /run/agenix/sure-app-env; set +a; export DATABASE_URL=postgresql://sure_user@127.0.0.1/sure_production HOME=/var/lib/sure RAILS_ENV=production REDIS_URL=redis://127.0.0.1:6379/2"
PUB_SCRIPT = os.path.join(os.path.dirname(__file__), "import_and_publish.rb")

def _find_sure_rails():
    # Prefer explicit env var, then PATH, then fail
    runner = os.environ.get("SURE_RAILS")
    if runner:
        return runner
    runner = shutil.which("sure-rails")
    if runner:
        return runner
    raise SystemExit("Error: sure-rails not found. Set SURE_RAILS env var or add it to PATH.")

RUNNER = _find_sure_rails()

_default_accounts = {
    "current": (os.environ.get("SURE_ACCOUNT_CURRENT_ID", ""), "Sumeria - Current"),
    "savings": (os.environ.get("SURE_ACCOUNT_SAVINGS_ID", ""), "Sumeria - Savings"),
}
ACCOUNTS = json.loads(os.environ["SURE_ACCOUNTS"]) if "SURE_ACCOUNTS" in os.environ else _default_accounts

def create_and_publish(account_id, account_name, csv_path, tag_name):
    csv_content = open(csv_path).read()
    payload = json.dumps({
        "account_id": account_id,
        "type": "TransactionImport",
        "date_col_label": "date",
        "amount_col_label": "amount",
        "name_col_label": "name",
        "tags_col_label": "tags",
        "date_format": "%Y-%m-%d",
        "number_format": "1,234.56",
        "signage_convention": "inflows_positive",
        "amount_type_strategy": "signed_amount",
        "raw_file_content": csv_content
    }).encode()
    req = urllib.request.Request(f"{BASE}/api/v1/imports", data=payload,
        headers={"X-Api-Key": TOKEN, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        d = json.loads(r.read())["data"]
        import_id = d["id"]

    # Ensure tag exists
    try:
        req2 = urllib.request.Request(f"{BASE}/api/v1/tags",
            data=json.dumps({"name": tag_name, "color": "#e99537"}).encode(),
            headers={"X-Api-Key": TOKEN, "Content-Type": "application/json"}, method="POST")
        urllib.request.urlopen(req2)
    except: pass

    r = subprocess.run(["sudo", "sh", "-lc",
        f"{ENV_CMD}; {RUNNER} runner {PUB_SCRIPT} '{import_id}' '{account_name}'"],
        capture_output=True, text=True)
    status = "complete" if "OK=complete" in r.stdout or "STATUS=complete" in r.stdout else f"FAILED"
    return import_id, status

if __name__ == "__main__":
    kind_filter = sys.argv[1] if len(sys.argv) > 1 else "all"
    year_filter = sys.argv[2] if len(sys.argv) > 2 else "2025"

    kinds = ["current", "savings"] if kind_filter == "all" else [kind_filter]
    for kind in kinds:
        account_id, account_name = ACCOUNTS[kind]
        if not account_id:
            raise SystemExit(f"Error: account ID for '{kind}' not set. Use SURE_ACCOUNTS or SURE_ACCOUNT_{kind.upper()}_ID env var.")
        files = sorted(glob.glob(f"{DIR}/{kind}_{year_filter}_*.csv"))
        for fpath in files:
            out_path = fpath.replace(".csv", "_sure.csv").replace(DIR, "/tmp")
            conv.convert(fpath, out_path)
            lines = open(fpath).readlines()
            tag_name = conv.build_tag(lines)
            import_id, status = create_and_publish(account_id, account_name, out_path, tag_name)
            icon = "✅" if status == "complete" else "❌"
            print(f"{icon} {os.path.basename(fpath)} tag={tag_name} id={import_id} status={status}")
