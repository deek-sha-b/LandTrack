import sqlite3

conn = sqlite3.connect('datasets/cadastral/Puttur_Taluk_Cadastral.gpkg')
c = conn.cursor()
c.execute("PRAGMA table_info('rtree_Puttur_Parcels_geom');")
cols = c.fetchall()
print("rtree columns:", cols)

c.execute("SELECT * FROM rtree_Puttur_Parcels_geom LIMIT 3;")
print("rtree sample:", c.fetchall())
