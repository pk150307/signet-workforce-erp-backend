-- Overtime is captured on attendance register only; pay grade no longer stores OT/hr.
ALTER TABLE designation_grades
  DROP COLUMN IF EXISTS overtime_rate_per_hour;
