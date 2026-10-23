-- Local development roles (runs once when the Postgres volume is created).
-- Production: provision the same roles with secrets from the vault.
CREATE ROLE rwaxi_app LOGIN PASSWORD 'rwaxi_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE rwaxi_platform LOGIN PASSWORD 'rwaxi_platform' NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE rwaxi TO rwaxi_app, rwaxi_platform;
