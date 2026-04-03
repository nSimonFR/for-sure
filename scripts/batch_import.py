#!/usr/bin/env python3
"""
Batch import Sumeria CSV files into Sure.

Usage:
  python3 batch_import.py current 2025  # imports all current_2025_*.csv
  python3 batch_import.py savings 2025  # imports all savings_2025_*.csv
  python3 batch_import.py all 2025      # imports both accounts
"""
import json, urllib.request, subprocess, sys, os, glob
sys.path.insert(0, os.path.dirname(__file__))
import lydia_csv_to_sure as conv
import importlib; importlib.reload(conv)

TOKEN = open(os.path.expanduser("~/.sure-api-key")).read().strip() if os.path.exists(os.path.expanduser("~/.sure-api-key")) else "70ccdab5ae24cd65942494c3c29e80c974285de780d24cbfc2a2157d6983e00e"
BASE = "http://127.0.0.1:13334"
DIR = "/mnt/cloud/Administrative/Sumeria"
RUNNER = "/nix/store/zawiykbh50lj54xqpc0j62im14rdzy12-sure-0.6.8/bin/sure-rails"
ENV_CMD = "set -a; . /run/agenix/sure-app-env; set +a; export DATABASE_URL=postgresql://sure_user@127.0.0.1/sure_production HOME=/var/lib/sure RAILS_ENV=production REDIS_URL=redis://127.0.0.1:6379/2"
PUB_SCRIPT = os.path.join(os.path.dirname(__file__), "import_and_publish.rb")

ACCOUNTS = {
    "current": ("9c40c6c3-24c9-42fb-9c45-15ca46a842f3", "Sumeria - Current"),
    "savings": ("6aa96f6d-de57-40a9-966b-7c719ca9366c", "Sumeria - Savings"),
}

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
        files = sorted(glob.glob(f"{DIR}/{kind}_{year_filter}_*.csv"))
        for fpath in files:
            out_path = fpath.replace(".csv", "_sure.csv").replace(DIR, "/tmp")
            conv.convert(fpath, out_path)
            lines = open(fpath).readlines()
            tag_name = conv.build_tag(lines)
            import_id, status = create_and_publish(account_id, account_name, out_path, tag_name)
            icon = "✅" if status == "complete" else "❌"
            print(f"{icon} {os.path.basename(fpath)} tag={tag_name} id={import_id} status={status}")
