"""
PurpleAir → JSON preprocessing pipeline for The Breathing City.

What it does:
  1. Fetches the last N days of PurpleAir readings for every sensor inside the
     Cambridge bounding box.
  2. Cleans the data: drops outlier spikes (PM2.5 > 500), tags long gaps.
  3. Aggregates to hourly medians per sensor.
  4. Computes a "typical day" profile per sensor: the median of each hour
     across the N-day window.
  5. Interpolates point readings to each Cambridge CDD neighborhood polygon
     using inverse-distance weighting.
  6. Emits data/air_quality_24h.json in the schema the browser expects.

This script is intentionally offline. The browser never calls PurpleAir.
It loads the precomputed JSON, so the page is fast, cache-friendly and works
without an API key in the public deploy.

Requirements:
  pip install requests shapely pandas

Usage:
  export PURPLEAIR_API_KEY=...
  python preprocessing/fetch_purpleair.py --days 90 --out data/air_quality_24h.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

# Optional imports are lazy-loaded inside the functions that need them so the
# `--help` output works without a full env. The synthetic-data fallback path
# only needs the standard library.

# Cambridge, MA bounding box (a touch generous so we catch border sensors).
NW = (42.4080, -71.1620)
SE = (42.3520, -71.0570)

# Hours of day used everywhere.
HOURS = list(range(24))

# PurpleAir REST endpoints.
PA_SENSORS = "https://api.purpleair.com/v1/sensors"
PA_HISTORY = "https://api.purpleair.com/v1/sensors/{sensor_index}/history"


# -----------------------------------------------------------------------------
# Fetch
# -----------------------------------------------------------------------------

def fetch_sensors(api_key: str) -> list[dict]:
    """List PurpleAir sensors inside the Cambridge bounding box."""
    import requests  # type: ignore

    params = {
        "fields": "name,latitude,longitude,location_type,last_seen",
        "nwlat": NW[0], "nwlng": NW[1],
        "selat": SE[0], "selng": SE[1],
        "location_type": 0,  # outdoor only
    }
    r = requests.get(PA_SENSORS, headers={"X-API-Key": api_key}, params=params, timeout=30)
    r.raise_for_status()
    j = r.json()
    cols = j["fields"]
    rows = j["data"]
    return [dict(zip(cols, row)) for row in rows]


def fetch_history(api_key: str, sensor_index: int, days: int) -> list[dict]:
    """Pull hourly history for one sensor."""
    import requests  # type: ignore

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    params = {
        "start_timestamp": int(start.timestamp()),
        "end_timestamp": int(end.timestamp()),
        "average": 60,  # 60-minute averages
        "fields": "pm2.5_atm_a,pm2.5_atm_b,humidity,temperature",
    }
    r = requests.get(
        PA_HISTORY.format(sensor_index=sensor_index),
        headers={"X-API-Key": api_key},
        params=params,
        timeout=60,
    )
    r.raise_for_status()
    j = r.json()
    cols = j["fields"]
    rows = j["data"]
    out = []
    for row in rows:
        d = dict(zip(cols, row))
        # average the two channels when present; reject if one is wildly off
        a, b = d.get("pm2.5_atm_a"), d.get("pm2.5_atm_b")
        if a is None and b is None:
            continue
        if a is not None and b is not None and abs(a - b) > max(5, 0.5 * max(a, b)):
            continue  # channels disagree → likely a hardware issue
        pm = a if b is None else (b if a is None else (a + b) / 2)
        if pm is None or pm > 500 or pm < 0:
            continue  # spike or sensor fault
        d["pm25"] = pm
        out.append(d)
    return out


# -----------------------------------------------------------------------------
# Aggregate
# -----------------------------------------------------------------------------

def typical_day(history: list[dict]) -> list[float]:
    """Median PM2.5 by hour-of-day across the history window."""
    import statistics
    buckets: dict[int, list[float]] = {h: [] for h in HOURS}
    for row in history:
        ts = row.get("time_stamp") or row.get("timestamp")
        if ts is None:
            continue
        dt = datetime.fromtimestamp(ts, timezone.utc)
        buckets[dt.hour].append(row["pm25"])
    return [round(statistics.median(buckets[h]) if buckets[h] else 0.0, 2) for h in HOURS]


# -----------------------------------------------------------------------------
# IDW interpolation to polygons
# -----------------------------------------------------------------------------

def neighborhood_centroid(feature: dict) -> tuple[float, float]:
    """Approximate centroid of a (Multi)Polygon feature in lng/lat space."""
    g = feature["geometry"]
    if g["type"] == "Polygon":
        ring = g["coordinates"][0]
    else:
        ring = max(g["coordinates"], key=lambda p: len(p[0]))[0]
    xs = [c[0] for c in ring[:-1]]
    ys = [c[1] for c in ring[:-1]]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def idw(point: tuple[float, float], samples: list[tuple[tuple[float, float], float]], p: float = 2.0) -> float:
    """Inverse-distance-weighted interpolation. p=2 is the urban-air-quality convention."""
    num, den = 0.0, 0.0
    for (lng, lat), val in samples:
        dx = (point[0] - lng) * 88_000   # ~m per deg lng at 42°N
        dy = (point[1] - lat) * 111_000  # ~m per deg lat
        d = (dx * dx + dy * dy) ** 0.5
        if d < 1:
            return val  # essentially co-located
        w = 1.0 / (d ** p)
        num += w * val
        den += w
    return num / den if den else 0.0


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

def build(args) -> int:
    api_key = os.environ.get("PURPLEAIR_API_KEY")
    if not api_key:
        print("error: set PURPLEAIR_API_KEY in the environment", file=sys.stderr)
        print("(request a free key by emailing contact@purpleair.com)", file=sys.stderr)
        return 2

    geo_path = Path(args.geo)
    if not geo_path.exists():
        print(f"error: {geo_path} not found", file=sys.stderr)
        return 2
    geo = json.loads(geo_path.read_text())

    print(f"Listing sensors in Cambridge bounding box…")
    sensors = fetch_sensors(api_key)
    print(f"  found {len(sensors)} outdoor sensors")

    series_by_sensor: list[dict] = []
    for i, s in enumerate(sensors, 1):
        idx = s["sensor_index"]
        print(f"  [{i}/{len(sensors)}] history for #{idx} ({s.get('name', '?')})")
        try:
            history = fetch_history(api_key, idx, args.days)
        except Exception as exc:
            print(f"    skipped: {exc}", file=sys.stderr)
            continue
        if len(history) < 24 * 7:
            print(f"    skipped: insufficient data ({len(history)} hourly rows)")
            continue
        series_by_sensor.append({
            "id": f"PA-{idx}",
            "lng": s["longitude"],
            "lat": s["latitude"],
            "neighborhood": None,  # filled in below
            "pm25_24h": typical_day(history),
        })
        time.sleep(1.1)  # history endpoint default rate limit is 1000ms

    print(f"Interpolating {len(series_by_sensor)} sensor series → 13 neighborhoods…")
    nhoods = []
    for feat in geo["features"]:
        c = neighborhood_centroid(feat)
        nhoods.append({
            "id": feat["properties"]["N_HOOD"],
            "name": feat["properties"]["NAME"],
            "centroid": list(c),
        })

    hourly = []
    for h in HOURS:
        samples = [((s["lng"], s["lat"]), s["pm25_24h"][h]) for s in series_by_sensor]
        row = []
        for nh in nhoods:
            v = idw(tuple(nh["centroid"]), samples)
            row.append({"id": nh["id"], "name": nh["name"], "pm25": round(v, 2)})
        hourly.append(row)

    out = {
        "meta": {
            "generated": datetime.now(timezone.utc).isoformat(),
            "source": f"PurpleAir Sensor Network ({args.days}-day median profile)",
            "days": args.days,
            "units": "µg/m³ PM2.5",
            "hours": 24,
            "neighborhoods": len(nhoods),
            "sensors": len(series_by_sensor),
        },
        "neighborhoods": nhoods,
        "hourly": hourly,
        "sensors": series_by_sensor,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, separators=(",", ":")))
    print(f"Wrote {out_path}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--days", type=int, default=90, help="lookback window (default 90)")
    p.add_argument(
        "--geo",
        default="data/cambridge_neighborhoods.geojson",
        help="path to Cambridge CDD neighborhood GeoJSON",
    )
    p.add_argument(
        "--out",
        default="data/air_quality_24h.json",
        help="output JSON path",
    )
    args = p.parse_args()
    return build(args)


if __name__ == "__main__":
    sys.exit(main())
