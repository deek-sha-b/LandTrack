import json
from database import get_engine
from sqlalchemy import text

def test():
    engine = get_engine()
    with engine.connect() as conn:
        road = conn.execute(text("SELECT id, osm_id, name, ref, highway, ST_AsGeoJSON(geom) FROM puttur_roads WHERE ref = 'NH275' LIMIT 1")).fetchone()
        print('Selected test road:', road[0], road[1], road[2], road[3], road[4])
        buf_res = conn.execute(text("SELECT ST_AsGeoJSON(ST_Transform(ST_Buffer(ST_Transform(geom, 32643), 15.0), 4326)) FROM puttur_roads WHERE id = :id"), {'id': road[0]}).scalar()
        corridor_geom_json = buf_res
        print('Corridor GeoJSON length:', len(corridor_geom_json))

        query = text("""
            SELECT 
                p.id, p.gpkg_fid, p.survey_number, p.survey_number_label, p.lgd_village_code, p.area_sqm,
                ST_Area(ST_Transform(p.geom, 32643)) as calc_total_sqm,
                ST_Area(ST_Transform(ST_Intersection(p.geom, ST_SetSRID(ST_GeomFromGeoJSON(:corridor_json), 4326)), 32643)) as calc_affected_sqm
            FROM cadastral_parcels p
            WHERE ST_Intersects(p.geom, ST_SetSRID(ST_GeomFromGeoJSON(:corridor_json), 4326))
            ORDER BY calc_affected_sqm DESC;
        """)
        parcels = conn.execute(query, {'corridor_json': corridor_geom_json}).fetchall()
        print('Intersecting parcels found:', len(parcels))
        for p in parcels[:5]:
            total = float(p[5] or p[6])
            affected = float(p[7])
            pct = (affected / total) * 100
            impact = 'Full Impact' if pct >= 90.0 else 'Partial Impact'
            print(f'  Parcel FID {p[1]}, Survey: {p[2] or p[3]}, Total: {total:.1f} m2, Affected: {affected:.1f} m2 ({pct:.2f}%) -> {impact}')

if __name__ == "__main__":
    test()
