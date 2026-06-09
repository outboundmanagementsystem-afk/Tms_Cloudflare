-- ============================================================
-- Sales Mobile App integration — Phase 1 (HRMS identity)
-- Migration: 0005_mobile_user_fields  (applies to outbound-tms)
--
-- The mobile app logs in with HRMS credentials (JWT) and reads its identity from
-- the TMS users mirror. Add the fields the app surfaces but that aren't stored yet:
-- designation (job title, distinct from access role) and the business sales number(s)
-- used to gate which calls are processed. Populated from HRMS sync; null until set.
-- ============================================================

ALTER TABLE users ADD COLUMN designation  TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN sales_number TEXT DEFAULT '';   -- E.164; comma-separated if multiple
