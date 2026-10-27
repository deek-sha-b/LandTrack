import sqlite3
import json

conn = sqlite3.connect('datasets/roads/putturroadfinal.gpkg')
c = conn.cursor()
c.execute('SELECT fid, osm_id, name, ref FROM [puttur road]')
rows = c.fetchall()
print(f"Total rows in puttur road: {len(rows)}")

from collections import Counter
osm_ids = [r[1] for r in rows]
c_osm = Counter(osm_ids)
dups_osm = {k: v for k, v in c_osm.items() if v > 1}
print(f"Duplicate osm_ids: {len(dups_osm)}")
if dups_osm:
    print(f"Sample duplicate osm_ids: {list(dups_osm.items())[:10]}")

refs = [r[3] for r in rows if r[3]]
c_ref = Counter(refs)
dups_ref = {k: v for k, v in c_ref.items() if v > 1}
print(f"Duplicate refs: {len(dups_ref)}")
print(f"Sample duplicate refs: {list(dups_ref.items())[:10]}")

names = [r[2] for r in rows if r[2]]
c_name = Counter(names)
dups_name = {k: v for k, v in c_name.items() if v > 1}
print(f"Duplicate names: {len(dups_name)}")
print(f"Sample duplicate names: {list(dups_name.items())[:10]}")

fids = [r[0] for r in rows]
print(f"Total unique FIDs: {len(set(fids))}")
