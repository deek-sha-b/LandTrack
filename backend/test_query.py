import sqlite3

conn = sqlite3.connect('datasets/cadastral/Puttur_Taluk_Cadastral.gpkg')
c = conn.cursor()
query = '''
    SELECT 
        fid,
        geom,
        OBJECTID,
        KGISCadastralID,
        KGISVillageID,
        surveynumberi,
        Label,
        Surveynumber_Old,
        KGISVillageCode,
        UniqueVillageCode,
        bhucode,
        LGD_VillageCode,
        Category,
        "SHAPE.STArea()",
        "SHAPE.STLength()",
        Kharab,
        ULPIN,
        last_edited_user
    FROM Puttur_Parcels
    LIMIT 3;
'''
c.execute(query)
rows = c.fetchall()
print('Fetched successfully:', len(rows))
for r in rows:
    print('fid:', r[0], 'survey:', r[5], 'area:', r[13], 'geom_len:', len(r[1]) if r[1] else 0)
