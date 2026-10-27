-- ====================================================================
-- LANDTRACK: Database Initialization Script (PostgreSQL + PostGIS)
-- Project: AI/ML-Based GIS Land Acquisition Management System
-- Study Area: Puttur, Karnataka, India
-- ====================================================================

-- 1. Create database (Run this in psql or pgAdmin connected to postgres server):
-- CREATE DATABASE landtrack_db;

-- Connect to landtrack_db:
-- \c landtrack_db

-- 2. Enable PostGIS spatial extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 3. Verify PostGIS version
SELECT PostGIS_Full_Version();

-- 4. Informational note:
-- Tables for Cadastral Parcels, Roads, Acquisition Projects, and ML Results
-- will be defined in subsequent development stages.
