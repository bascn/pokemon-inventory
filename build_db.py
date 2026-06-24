import urllib.request
import json
import sys

BASE_URL = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master"

def fetch_json(path):
    url = f"{BASE_URL}/{path}"
    print(f"Fetching {url}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read())

print("Downloading sets list...")
all_sets = fetch_json("sets/en.json")

# Filter for SWSH, SV, and Mega Evolution eras
valid_series = {"Sword & Shield", "Scarlet & Violet", "Mega Evolution"}
target_sets = [s for s in all_sets if s.get("series") in valid_series]

print(f"Found {len(target_sets)} sets in SWSH and SV.")

db_sets = []
db_cards = []

for s in target_sets:
    db_sets.append({
        "id": s["id"],
        "name": s["name"],
        "series": s["series"],
        "printedTotal": s["printedTotal"],
        "total": s["total"],
        "releaseDate": s.get("releaseDate", ""),
        "images": {"symbol": s.get("images", {}).get("symbol", "")}
    })
    
    # Fetch cards for this set
    cards = fetch_json(f"cards/en/{s['id']}.json")
    for c in cards:
        db_cards.append({
            "id": c["id"],
            "name": c["name"],
            "number": c["number"],
            "setId": s["id"],
            "rarity": c.get("rarity", ""),
            "supertype": c.get("supertype", ""),
            "subtypes": c.get("subtypes", []),
            "types": c.get("types", []),
            "images": {"small": c.get("images", {}).get("small", "")}
        })

print(f"Total cards processed: {len(db_cards)}")

out_path = "c:/Users/bascn/Pictures/pokemon-app/database.js"
with open(out_path, "w", encoding="utf-8") as f:
    f.write("const TCG_DB = ")
    json.dump({"sets": db_sets, "cards": db_cards}, f, separators=(",", ":"))
    f.write(";\n")

print(f"Database successfully saved to {out_path}")
