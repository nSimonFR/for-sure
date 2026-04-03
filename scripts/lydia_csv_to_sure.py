#!/usr/bin/env python3
"""
Convert Lydia/Sumeria bank statement CSV to Sure import format.

Input format (Lydia):
  - Metadata header rows (Firstname, Account name, IBAN, etc.)
  - Data section starting with: Date,Label,Debit,Credit,Balance
  - Date format: DD/MM/YYYY
  - Debit column: negative amounts
  - Credit column: positive amounts

Output format (Sure):
  date,amount,name,currency,category,tags,notes
  - Date format: YYYY-MM-DD
  - Amount: negative = expense, positive = income (signed_amount convention)
  - Tags: auto-generated from account name + period (e.g. sumeria_current_01_2026)

Usage:
  python3 lydia_csv_to_sure.py <input.csv> [output.csv]
  If output not specified, writes to <input>_sure.csv
"""

import csv
import re
import sys
from datetime import datetime
from pathlib import Path


def build_tag(lines: list[str]) -> str:
    """
    Build a tag from the metadata header of the Lydia CSV.
    e.g. Account name=Current, Period=From 01/01/2026 to 31/01/2026
    -> sumeria_current_01_2026
    """
    account_name = "account"
    period_month = None
    period_year = None

    for line in lines:
        if line.startswith("Account name,"):
            account_name = line.split(",", 1)[1].strip().lower().replace(" ", "_")
        if line.startswith("Period,"):
            # Format can be MM/DD/YYYY (US) or DD/MM/YYYY (EU)
            m = re.search(r"From (\d{2})/(\d{2})/(\d{4})", line)
            if m:
                a, b, year = m.group(1), m.group(2), m.group(3)
                m2 = re.search(r"to (\d{2})/(\d{2})/(\d{4})", line)
                if int(a) > 12:
                    period_month = b  # DD/MM: day > 12, month is second
                elif m2 and int(m2.group(2)) > 12:
                    period_month = a  # end date second part > 12 → MM/DD (02/28 → month=02)
                elif m2 and int(m2.group(1)) > 12:
                    period_month = b  # end date first part > 12 → DD/MM
                else:
                    period_month = b  # default: DD/MM
                period_year = year

    parts = ["sumeria", account_name]
    if period_month and period_year:
        parts += [period_month, period_year]
    return "_".join(parts)


def convert(input_path: str, output_path: str = None):
    input_file = Path(input_path)
    if output_path is None:
        output_path = str(input_file.with_stem(input_file.stem + "_sure"))

    with open(input_file, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Build tag from metadata
    tag = build_tag(lines)

    # Detect date format by scanning all data rows:
    # if any row has first part > 12 → DD/MM/YYYY
    # if any row has second part > 12 → MM/DD/YYYY
    _date_fmt = "%d/%m/%Y"  # default
    data_start_tmp = next((i for i, l in enumerate(lines) if l.startswith("Date,")), None)
    if data_start_tmp is not None:
        for row_line in lines[data_start_tmp + 1:]:
            parts = row_line.split(",", 1)
            if not parts or not parts[0].strip():
                continue
            dp = parts[0].strip().split("/")
            if len(dp) == 3:
                try:
                    a, b = int(dp[0]), int(dp[1])
                    if a > 12:
                        _date_fmt = "%d/%m/%Y"
                        break
                    if b > 12:
                        _date_fmt = "%m/%d/%Y"
                        break
                except ValueError:
                    pass

    # Find the start of the data section
    data_start = None
    for i, line in enumerate(lines):
        if line.startswith("Date,"):
            data_start = i
            break

    if data_start is None:
        raise ValueError("Could not find data section (looking for 'Date,' header)")

    rows = list(csv.DictReader(lines[data_start:]))

    output = []
    for row in rows:
        date_raw = row["Date"].strip()
        label = row["Label"].strip()
        debit = row.get("Debit", "").strip()
        credit = row.get("Credit", "").strip()

        # Parse date — detect MM/DD/YYYY (US) vs DD/MM/YYYY (EU)
        parts = date_raw.split("/")
        if len(parts) == 3 and int(parts[0]) > 12:
            fmt = "%d/%m/%Y"  # day > 12 → must be DD/MM
        elif len(parts) == 3 and int(parts[1]) > 12:
            fmt = "%m/%d/%Y"  # month > 12 → must be MM/DD
        else:
            # Ambiguous: use Period header hint or default to DD/MM
            fmt = _date_fmt
        d = datetime.strptime(date_raw, fmt)
        date_str = d.strftime("%Y-%m-%d")

        # Amount: debit already negative, credit positive
        if debit:
            amount = debit
        else:
            amount = credit

        # Clean label
        if label.startswith("Card transaction: "):
            name = label.replace("Card transaction: ", "").strip()
        elif label.startswith("Cancellation of the card transaction"):
            name = "Cancellation: " + label.split(": ", 2)[-1].strip()
        else:
            name = label

        output.append({
            "date": date_str,
            "amount": amount,
            "name": name,
            "currency": "EUR",
            "category": "",
            "tags": tag,
            "notes": ""
        })

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["date", "amount", "name", "currency", "category", "tags", "notes"]
        )
        writer.writeheader()
        writer.writerows(output)

    print(f"Converted {len(output)} rows")
    print(f"  Transfers (Savings): {sum(1 for r in output if 'Internal bank transfer' in r['name'])}")
    print(f"  Expenses: {sum(1 for r in output if float(r['amount']) < 0 and 'Internal bank transfer' not in r['name'])}")
    print(f"  Credits: {sum(1 for r in output if float(r['amount']) > 0 and 'Internal bank transfer' not in r['name'])}")
    print(f"Output: {output_path}")
    return output_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 lydia_csv_to_sure.py <input.csv> [output.csv]")
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
