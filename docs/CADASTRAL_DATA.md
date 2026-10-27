# Puttur Cadastral Dataset Documentation

**Project:** LandTrack — AI/ML-Based GIS Land Acquisition Management System  
**Dataset File:** `datasets/cadastral/Puttur_Cadastral_Final.gpkg`  
**Study Area:** Puttur Taluk, Dakshina Kannada District, Karnataka, India  
**Inspection Date:** September 2026  

---

## 1. Dataset Overview

The dataset provides official Karnataka GIS (KGIS) cadastral parcel boundaries covering Puttur Taluk and surrounding revenue boundaries.

| Property | Value / Specification |
| :--- | :--- |
| **File Path** | `datasets/cadastral/Puttur_Cadastral_Final.gpkg` |
| **Layer Name** | `Puttur_Parcels` |
| **Data Format** | OGC GeoPackage (SQLite 3.x spatial container) |
| **Coordinate Reference System (CRS)** | **EPSG:4326** (`WGS 84 geodetic` - Latitude/Longitude in decimal degrees) |
| **Geometry Type** | `MULTIPOLYGON` |
| **Total Parcel Count** | **54,577** cadastral parcels |
| **Spatial Indexing** | Built-in RTree spatial index (`rtree_Puttur_Parcels_geom`) |
| **Spatial Extent (Bounding Box)** | **Min Longitude (X):** 74.925889° E<br>**Min Latitude (Y):** 12.425010° N<br>**Max Longitude (X):** 75.454960° E<br>**Max Latitude (Y):** 13.069613° N |
| **Taluk Center Approx.** | Lat: `12.7681° N`, Lon: `75.2071° E` |

---

## 2. Complete Attribute Schema

Every record in the `Puttur_Parcels` layer contains the following 22 attributes:

| Column Name | Data Type | Non-Null Count | Sample Values | Description |
| :--- | :--- | :--- | :--- | :--- |
| `fid` | INTEGER | 54,577 / 54,577 | `1`, `2`, `3` | Unique Feature Identifier (Primary Key in GPKG) |
| `geom` | MULTIPOLYGON | 54,577 / 54,577 | *WKB MultiPolygon* | Standard OGC MultiPolygon geometry in EPSG:4326 |
| `OBJECTID` | INTEGER | 54,577 / 54,577 | `3782475`, `3782272` | KGIS System Object ID |
| `KGISCadastralID` | INTEGER | 54,577 / 54,577 | `1626694`, `1548008` | Unique cadastral parcel identifier in Karnataka GIS |
| `KGISVillageID` | INTEGER | 54,577 / 54,577 | `26110`, `26125` | Internal administrative village ID |
| `surveynumberi` | INTEGER | 54,577 / 54,577 | `17`, `287`, `149`, `281` | **Primary Survey Number** (Integer format) |
| `KGISVillageCode` | TEXT | 54,577 / 54,577 | `'2406060012'`, `'2406060010'` | 10-digit Karnataka GIS Village Code |
| `UniqueVillageCode`| TEXT | 54,577 / 54,577 | `'2406060012_1'` | Composite Unique Village Code |
| `bhucode` | TEXT | 54,577 / 54,577 | `'240101003009'` | Bhoomi land records integration code |
| `Category` | TEXT | 54,577 / 54,577 | `'Parcel'` | Land classification category |
| `SHAPE.STArea()` | REAL | 54,577 / 54,577 | `1159439.99`, `21316.76` | Exact calculated parcel polygon area in square metres ($m^2$) |
| `SHAPE.STLength()` | REAL | 54,577 / 54,577 | `12702.68`, `646.66` | Parcel boundary perimeter in linear metres ($m$) |
| `Kharab` | TEXT | 1,270 / 54,577 | `'XX'`, `'X'`, `''` | Government uncultivable/wasteland classification |
| `Label` | TEXT | 53,307 / 54,577 | `'17'`, `'287'`, `'149'` | Display survey number label |
| `Surveynumber_Old` | TEXT | 54,577 / 54,577 | `'17'`, `'287'`, `'149'` | Prior historical survey number reference |
| `last_edited_user` | TEXT | 54,577 / 54,577 | `'TARADEVI'`, `'SURESHBV1'` | Survey / GIS operator who last updated the record |
| `last_edited_date` | INTEGER | 54,577 / 54,577 | `1579875731000` | Epoch timestamp (milliseconds) of last modification |
| `LGD_VillageCode` | INTEGER | 54,577 / 54,577 | `617452`, `617460` | Local Government Directory (LGD) national village code |
| `ULPIN` | TEXT | 34,369 / 54,577 | `'752YP4D7SZ49'` | Unique Land Parcel Identification Number (Bhu-Aadhaar) |
| `Surnoc` | TEXT | 0 / 54,577 | `NULL` | Sub-division / Surnoc (Not populated in this extraction) |
| `HissaNo` | TEXT | 0 / 54,577 | `NULL` | Sub-division / Hissa number (Not populated in this extraction) |
| `created_user` | TEXT | 20,751 / 54,577 | `'SURESHBV1'`, `'TARADEVI'` | Initial creation operator ID |
| `created_date` | REAL | 20,751 / 54,577 | `1666863484000.0` | Initial creation timestamp |

---

## 3. Key Observations on Specific Fields

1. **Survey Number Field:**
   - **`surveynumberi`** is 100% populated (54,577 records) and provides the integer survey number.
   - **`Label`** is 97.7% populated and provides the formatted text label for map cartography.
   - **`Surveynumber_Old`** is 100% populated.

2. **Village Name Field:**
   - The dataset provides explicit administrative village code identifiers: `KGISVillageCode`, `UniqueVillageCode`, `bhucode`, `LGD_VillageCode`, and `KGISVillageID`.
   - A descriptive textual village name column (e.g., `"Puttur Kasaba"`, `"Kabaka"`) is **not present** as a text attribute column in this GPKG extraction.
   - In accordance with system specifications:
     > When Survey Number or Village is not available in the dataset, the system displays: **"Not Available"** (while continuing to display the official Village Code and LGD Code).

3. **Spatial Reference and Projection:**
   - Geometries are stored natively in **WGS 84 (EPSG:4326)** coordinates.
   - Parcel polygons map directly to standard web mapping tile layers (such as OpenStreetMap) without on-the-fly reprojection distortion.
