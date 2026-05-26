"""
Synthetic-data generator. Used for local development when there is no
PurpleAir API key available.

Models PM2.5 as the product of:
  • a per-neighborhood baseline driven by proximity to highways and major
    arterials, lifted down by parks and Charles-river-front green space, and
  • a citywide diurnal multiplier with two rush peaks (08:00, 18:00) that
    decays overnight.

The output schema matches what fetch_purpleair.py emits, so the browser code
is identical for both paths.

Usage:
  python preprocessing/generate_synthetic.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path

# Diurnal multiplier vs the per-neighborhood baseline.
HOUR_PROFILE = [
    0.70, 0.65, 0.62, 0.60, 0.62,
    0.75, 1.10, 1.65, 1.85, 1.55,
    1.20, 1.00, 0.95, 0.90, 0.88,
    0.95, 1.10, 1.45, 1.75, 1.60,
    1.25, 1.00, 0.85, 0.75,
]

# Hand-calibrated character scores. Higher traffic = more particulate input;
# higher green = more dispersion + less local source.
NHOOD_TRAFFIC = {
    "The Port": 0.85, "Neighborhood Nine": 0.45, "Wellington-Harrington": 0.75,
    "Mid-Cambridge": 0.60, "North Cambridge": 0.55, "Cambridge Highlands": 0.30,
    "Strawberry Hill": 0.25, "West Cambridge": 0.40, "Riverside": 0.65,
    "Cambridgeport": 0.70, "Area 2/MIT": 0.95, "East Cambridge": 0.90,
    "Baldwin": 0.50,
}
NHOOD_GREEN = {
    "The Port": 0.20, "Neighborhood Nine": 0.55, "Wellington-Harrington": 0.25,
    "Mid-Cambridge": 0.40, "North Cambridge": 0.45, "Cambridge Highlands": 0.85,
    "Strawberry Hill": 0.75, "West Cambridge": 0.60, "Riverside": 0.50,
    "Cambridgeport": 0.45, "Area 2/MIT": 0.30, "East Cambridge": 0.20,
    "Baldwin": 0.55,
}

REPO = Path(__file__).resolve().parents[1]
GEO_PATH = REPO / "data" / "cambridge_neighborhoods.geojson"
OUT_PATH = REPO / "data" / "air_quality_24h.json"


def centroid(feature: dict) -> list[float]:
    g = feature["geometry"]
    ring = g["coordinates"][0] if g["type"] == "Polygon" else max(g["coordinates"], key=lambda p: len(p[0]))[0]
    n = len(ring) - 1
    return [sum(c[0] for c in ring[:-1]) / n, sum(c[1] for c in ring[:-1]) / n]


def main() -> None:
    random.seed(42)
    geo = json.loads(GEO_PATH.read_text())

    nhoods = []
    for f in geo["features"]:
        name = f["properties"]["NAME"]
        nhoods.append({
            "id": f["properties"]["N_HOOD"],
            "name": name,
            "centroid": centroid(f),
            "traffic": NHOOD_TRAFFIC.get(name, 0.5),
            "green": NHOOD_GREEN.get(name, 0.4),
        })

    # 24h × N neighborhood matrix
    hourly = []
    for hour in range(24):
        profile = HOUR_PROFILE[hour]
        row = []
        for nh in nhoods:
            baseline = 7.0 + nh["traffic"] * 6.0 - nh["green"] * 3.0
            rush = 1 + (profile - 1) * (0.6 + nh["traffic"] * 0.8)
            val = max(2.5, baseline * rush + (random.random() - 0.5) * 1.5)
            row.append({"id": nh["id"], "name": nh["name"], "pm25": round(val, 2)})
        hourly.append(row)

    # One or two sensors per neighborhood, jittered around the centroid
    sensors = []
    sid = 0
    for nh in nhoods:
        for _ in range(1 if nh["traffic"] < 0.5 else 2):
            sid += 1
            lng = nh["centroid"][0] + (random.random() - 0.5) * 0.008
            lat = nh["centroid"][1] + (random.random() - 0.5) * 0.005
            series = []
            for hour in range(24):
                profile = HOUR_PROFILE[hour]
                baseline = 7.0 + nh["traffic"] * 6.0 - nh["green"] * 3.0
                rush = 1 + (profile - 1) * (0.6 + nh["traffic"] * 0.8)
                series.append(round(max(2.5, baseline * rush + (random.random() - 0.5) * 1.2), 2))
            sensors.append({
                "id": f"CAM-{sid:03d}",
                "lng": lng, "lat": lat,
                "neighborhood": nh["name"],
                "pm25_24h": series,
            })

    OUT_PATH.write_text(json.dumps({
        "meta": {
            "generated": "synthetic",
            "source": "Synthetic 30-day profile (matches PurpleAir schema)",
            "units": "µg/m³ PM2.5",
            "hours": 24,
            "neighborhoods": len(nhoods),
            "sensors": len(sensors),
        },
        "neighborhoods": [{"id": n["id"], "name": n["name"], "centroid": n["centroid"]} for n in nhoods],
        "hourly": hourly,
        "sensors": sensors,
    }, separators=(",", ":")))
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
