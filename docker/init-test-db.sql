-- Runs once on first container start (postgres image convention:
-- everything in /docker-entrypoint-initdb.d/ executes on an empty data dir).
-- Creates a second, isolated database for the integration test suite so
-- tests never touch dev data.
CREATE DATABASE document_vault_test;
