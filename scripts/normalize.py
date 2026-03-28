#!/usr/bin/env python3
"""
Cannabis Fact Engine - Data Normalization Script
No external dependencies. Python standard library only.
"""
import json
import re
import sys
from copy import deepcopy

# State name -> 2-letter code mapping
STATE_NORMALIZE = {
    "Alaska": "AK", "Alabama": "AL", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
    "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY",
}

# Unit normalization mapping
UNIT_NORMALIZE = {
    "square feet": "sqft", "sq ft": "sqft", "square_feet": "sqft",
    "USD_millions": "USD", "None": None, "none": None, "null": None,
}

# Category display labels
CATEGORY_LABELS = {
    "market_size_revenue": "Market Size & Revenue",
    "licensing": "Licensing",
    "social_equity": "Social Equity",
    "compliance_enforcement": "Compliance & Enforcement",
    "pricing": "Pricing",
    "demand_consumption": "Demand & Consumption",
    "regulatory_structure": "Regulatory Structure",
    "public_health_safety": "Public Health & Safety",
    "supply_chain": "Supply Chain",
    "employment_economics": "Employment & Economics",
}

# Full state names for display
STATE_NAMES = {v: k for k, v in STATE_NORMALIZE.items()}
STATE_NAMES["US"] = "United States"
STATE_NAMES["DC"] = "District of Columbia"


def normalize_state(state):
    """Normalize state to 2-letter code."""
    if not state:
        return "US"
    state = state.strip()
    if state in STATE_NORMALIZE:
        return STATE_NORMALIZE[state]
    if len(state) == 2 and state.upper() == state:
        return state
    return state


def normalize_unit(unit):
    """Normalize unit strings."""
    if not unit or unit in ("None", "null", "none"):
        return None
    return UNIT_NORMALIZE.get(unit, unit)


def extract_years(date_range):
    """Extract year_start and year_end from date_range string."""
    if not date_range:
        return None, None

    years = re.findall(r'((?:19|20)\d{2})', str(date_range))
    if not years:
        return None, None

    int_years = [int(y) for y in years]
    return min(int_years), max(int_years)


def adjust_usd_millions(record):
    """If unit was USD_millions, multiply value by 1,000,000."""
    if record.get("unit") == "USD_millions" and record.get("value") is not None:
        try:
            val = float(record["value"])
            if val < 100000:  # likely in millions, not already converted
                record["value"] = val * 1_000_000
        except (ValueError, TypeError):
            pass
    return record


def normalize_record(record):
    """Apply all normalizations to a single record."""
    r = deepcopy(record)

    # State
    r["state"] = normalize_state(r.get("state", ""))

    # Years
    year_start, year_end = extract_years(r.get("date_range", ""))
    r["year_start"] = year_start
    r["year_end"] = year_end

    # Unit (before adjustment)
    original_unit = r.get("unit", "")
    r = adjust_usd_millions(r)
    r["unit"] = normalize_unit(original_unit)

    # Ensure all required fields exist
    for field in ["id", "claim", "value", "unit", "category", "subcategory",
                   "state", "date_range", "source_report", "page", "context",
                   "data_type", "table_data", "notes", "year_start", "year_end"]:
        if field not in r:
            r[field] = None

    return r


def normalize_database(input_path, output_path):
    """Load, normalize, and save the database."""
    with open(input_path, "r") as f:
        records = json.load(f)

    print(f"Loaded {len(records)} records from {input_path}")

    # Normalize
    normalized = [normalize_record(r) for r in records]

    # Stats
    states = set(r["state"] for r in normalized if r["state"])
    categories = set(r["category"] for r in normalized if r.get("category"))
    years = [r["year_start"] for r in normalized if r["year_start"]]
    year_range = f"{min(years)}-{max(years)}" if years else "unknown"

    print(f"States: {len(states)} ({', '.join(sorted(states))})")
    print(f"Categories: {len(categories)}")
    print(f"Year range: {year_range}")
    print(f"Records with year data: {len(years)}/{len(normalized)}")

    # Check for state normalization issues
    for r in normalized:
        if r["state"] and len(r["state"]) > 2 and r["state"] != "US":
            print(f"  WARNING: Un-normalized state '{r['state']}' in record {r.get('id', '?')}")

    # Write
    with open(output_path, "w") as f:
        json.dump(normalized, f, indent=2)

    print(f"Wrote {len(normalized)} normalized records to {output_path}")


if __name__ == "__main__":
    input_path = sys.argv[1] if len(sys.argv) > 1 else "data/cannabis_database.json"
    output_path = sys.argv[2] if len(sys.argv) > 2 else "data/cannabis_database.json"
    normalize_database(input_path, output_path)
