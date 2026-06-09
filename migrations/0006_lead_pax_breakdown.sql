-- ============================================================
-- Outbound One — CRM (SalesFlow): pax breakdown + travel duration
-- Migration: 0006_lead_pax_breakdown  (applies to outbound-tms)
--
-- Additive only. Splits the headcount into adults + children, stores each
-- child's age (age 0 = infant) as a JSON array, and records the trip length
-- as free text (e.g. 3D4N). `pax` is kept as the total for back-compat.
-- ============================================================

ALTER TABLE leads ADD COLUMN adults          INTEGER DEFAULT 1;
ALTER TABLE leads ADD COLUMN children        INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN children_ages   TEXT DEFAULT '';   -- JSON array of ages, e.g. [5,3,0]; age 0 = infant
ALTER TABLE leads ADD COLUMN travel_duration TEXT DEFAULT '';   -- e.g. 3D4N
