-- Monthly present days + bonus on attendance register extras (replaces day-by-day marking for payroll/billing)
-- Also store bonus on payroll entries for payslip generation.

ALTER TABLE attendance_register_employee_overtime
  ADD COLUMN IF NOT EXISTS present_days NUMERIC(6, 2) NULL
    CHECK (present_days IS NULL OR present_days >= 0),
  ADD COLUMN IF NOT EXISTS bonus NUMERIC(18, 2) NOT NULL DEFAULT 0
    CHECK (bonus >= 0);

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS bonus NUMERIC(18, 2) NOT NULL DEFAULT 0;

-- Backfill present_days from historical day marks (Present/Late/EarlyOut = 1, HalfDay = 0.5)
UPDATE attendance_register_employee_overtime aro
SET present_days = sub.present_days
FROM (
  SELECT
    aro2.register_id,
    aro2.employee_id,
    COALESCE(SUM(
      CASE
        WHEN a.status IN (1, 7, 8) THEN 1
        WHEN a.status = 3 THEN 0.5
        ELSE 0
      END
    ), 0)::numeric(6, 2) AS present_days
  FROM attendance_register_employee_overtime aro2
  INNER JOIN attendance_registers ar ON ar.id = aro2.register_id
  LEFT JOIN attendances a
    ON a.employee_id = aro2.employee_id
   AND NOT a.is_deleted
   AND a.attendance_date >= make_date(ar.year, ar.month, 1)
   AND a.attendance_date < (make_date(ar.year, ar.month, 1) + INTERVAL '1 month')
  WHERE aro2.present_days IS NULL
  GROUP BY aro2.register_id, aro2.employee_id
) sub
WHERE aro.register_id = sub.register_id
  AND aro.employee_id = sub.employee_id
  AND aro.present_days IS NULL;

-- Create extras rows for employees who have day attendance but no extras row yet
INSERT INTO attendance_register_employee_overtime (
  register_id, employee_id, present_days, overtime_hours, night_allowance, punctuality_award, bonus, created_by
)
SELECT
  ar.id,
  a.employee_id,
  COALESCE(SUM(
    CASE
      WHEN a.status IN (1, 7, 8) THEN 1
      WHEN a.status = 3 THEN 0.5
      ELSE 0
    END
  ), 0)::numeric(6, 2),
  0,
  0,
  0,
  0,
  'migration_028'
FROM attendance_registers ar
INNER JOIN sites s ON s.client_id = ar.client_id AND NOT s.is_deleted
INNER JOIN employees e ON e.site_id = s.id AND NOT e.is_deleted
INNER JOIN attendances a
  ON a.employee_id = e.id
 AND NOT a.is_deleted
 AND a.attendance_date >= make_date(ar.year, ar.month, 1)
 AND a.attendance_date < (make_date(ar.year, ar.month, 1) + INTERVAL '1 month')
WHERE NOT EXISTS (
  SELECT 1
  FROM attendance_register_employee_overtime existing
  WHERE existing.register_id = ar.id
    AND existing.employee_id = a.employee_id
)
GROUP BY ar.id, a.employee_id
ON CONFLICT (register_id, employee_id) DO NOTHING;
