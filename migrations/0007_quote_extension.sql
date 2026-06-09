-- ============================================================
-- Outbound One — CRM: Pending-Quote SLA extension
-- Migration: 0007_quote_extension  (applies to outbound-tms)
--
-- Additive only. When a quote SLA is fully breached the owner may extend it
-- once by +30m or +1h. `quote_extra_min` holds the granted extra working
-- minutes (added on top of QUOTE_SLA); `quote_extended` counts extensions used.
-- If the lead breaches AGAIN after an extension, the team leader is alerted
-- (an escalation row, reason 'quote_missed_after_extension').
-- ============================================================

ALTER TABLE leads ADD COLUMN quote_extra_min INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN quote_extended  INTEGER DEFAULT 0;
