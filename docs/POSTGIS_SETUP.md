# PostgreSQL and PostGIS Setup Guide for LandTrack

This guide provides instructions for configuring PostgreSQL with the PostGIS spatial extension for the LandTrack application.

---

## 1. Prerequisites
- **PostgreSQL 14, 15, or 16** (recommended for Windows).
- **PostGIS 3.x** extension (available via the PostgreSQL Application Stack Builder or standalone installer).

---

## 2. Installation on Windows

### Step A: Download & Install PostgreSQL
1. Download the PostgreSQL Windows installer from the official site:
   [https://www.enterprisedb.com/downloads/postgres-postgresql-downloads](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)
2. Follow the installation wizard:
   - Default port: `5432`
   - Set a master password for user `postgres` (e.g., `postgres` or your preferred password).
3. At the end of the installation, check the box to launch **Stack Builder**.

### Step B: Install PostGIS via Stack Builder
1. In Stack Builder, select your PostgreSQL installation.
2. Under **Spatial Extensions**, check **PostGIS 3.x Bundle for PostgreSQL**.
3. Complete the installation wizard.

---

## 3. Database Creation and PostGIS Activation

### Using pgAdmin 4 (GUI)
1. Open **pgAdmin 4** from your Start menu and enter your master password.
2. Right-click on **Databases** > **Create** > **Database...**
3. Set the database name to: `landtrack_db` and click **Save**.
4. Click on `landtrack_db` in the left panel, then navigate to **Tools** > **Query Tool**.
5. Run the following command:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
6. Verify the installation by running:
   ```sql
   SELECT PostGIS_Full_Version();
   ```

### Using Command Line (psql)
```bash
# Connect to postgres server
psql -U postgres

# Create the database
CREATE DATABASE landtrack_db;

# Connect to the newly created database
\c landtrack_db

# Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

# Verify
SELECT PostGIS_Full_Version();
```

---

## 4. Configuring Backend `.env`
In `LandTrack/backend/.env`, ensure the credentials match your local setup:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=landtrack_db
DB_USER=postgres
DB_PASSWORD=your_actual_password
```

---

## 5. Verification via Backend Health Check
When you run the Flask backend (`python app.py`), visit:
[http://localhost:5000/api/health](http://localhost:5000/api/health)

You should see:
```json
{
  "database": {
    "connected": true,
    "database": "landtrack_db",
    "host": "localhost:5432",
    "message": "PostgreSQL database and PostGIS extension are active and connected.",
    "postgis_installed": true,
    "postgis_version": "..."
  },
  "service": "LandTrack",
  "status": "healthy",
  "study_area": "Puttur, Karnataka, India"
}
```

*Note: If PostgreSQL is not installed or running yet, the backend will still start normally and display a clear configuration advisory on the health endpoint and frontend dashboard.*
