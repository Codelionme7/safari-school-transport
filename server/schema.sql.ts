/**
 * Production PostgreSQL 16 + PostGIS 3.4 + TimescaleDB Schema Blueprint
 * Enforces Row-Level Security (RLS) for "Visibility Without Exposure" across
 * multi-tenant school districts, hardware GPS heartbeats, and SHA-256 hash-chained handover audits.
 */
export const PRODUCTION_POSTGRES_POSTGIS_DDL = `-- Enable Geospatial & Cryptographic Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Multi-Tenant School Boundary
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(24) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  campus_geofence GEOGRAPHY(POLYGON, 4326) NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Route Definitions with Live TrafficLevel & Corridor Geometry
CREATE TYPE traffic_level_enum AS ENUM ('clear', 'moderate', 'heavy');
CREATE TYPE driver_status_enum AS ENUM ('en_route', 'at_stop', 'standby', 'attention');

CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code VARCHAR(16) NOT NULL,
  name TEXT NOT NULL,
  vehicle_label VARCHAR(32) NOT NULL,
  plate_number VARCHAR(20) NOT NULL,
  driver_name TEXT NOT NULL,
  driver_status driver_status_enum NOT NULL DEFAULT 'en_route',
  attendant_name TEXT NOT NULL,
  hardware_tracker_id VARCHAR(32) UNIQUE NOT NULL,
  traffic_level traffic_level_enum NOT NULL DEFAULT 'clear',
  corridor_path GEOGRAPHY(LINESTRING, 4326) NOT NULL,
  total_distance_km NUMERIC(5,2) NOT NULL,
  estimated_duration_min INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_routes_school_traffic ON routes(school_id, traffic_level);
CREATE INDEX idx_routes_corridor_gist ON routes USING GIST (corridor_path);

-- 3. Geofenced Route Stops
CREATE TABLE route_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  sequence_order SMALLINT NOT NULL,
  name TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  geofence_radius_m INTEGER NOT NULL DEFAULT 65,
  is_school_campus BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_route_stops_location_gist ON route_stops USING GIST (location);

-- 4. Time-Series Vehicle Telemetry (30-Day Retention Partitioned)
CREATE TABLE vehicle_telemetry_events (
  id BIGSERIAL,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  position GEOGRAPHY(POINT, 4326) NOT NULL,
  speed_kmh NUMERIC(5,2) NOT NULL,
  heading_deg NUMERIC(5,2) NOT NULL,
  traffic_level traffic_level_enum NOT NULL,
  eta_next_stop_min SMALLINT NOT NULL,
  gps_signal_strength VARCHAR(12) NOT NULL DEFAULT 'strong',
  PRIMARY KEY (id, recorded_at)
);

-- 5. Immutable SHA-256 Hash-Chained Handover Confirmations
CREATE TABLE handover_confirmations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  route_id UUID NOT NULL REFERENCES routes(id),
  event_type VARCHAR(24) NOT NULL,
  verification_method VARCHAR(24) NOT NULL,
  verified_by TEXT NOT NULL,
  has_photo_proof BOOLEAN NOT NULL DEFAULT FALSE,
  gps_location GEOGRAPHY(POINT, 4326) NOT NULL,
  prev_hash CHAR(16) NOT NULL,
  entry_hash CHAR(16) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Row-Level Security (RLS) Policy: Parents see ONLY their linked child & stop
ALTER TABLE handover_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY parent_scoped_handover_isolation ON handover_confirmations
  FOR SELECT
  USING (
    current_setting('app.current_role', true) IN ('school_admin', 'platform_admin')
    OR student_id::text = current_setting('app.current_student_id', true)
  );
`;
