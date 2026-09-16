-- Hot-path indexes for payroll generation, payslip lists, and reports.

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_period
  ON leave_requests (employee_id, status, from_date, to_date)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_attendances_employee_date
  ON attendances (employee_id, attendance_date)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_attendances_date
  ON attendances (attendance_date)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_payroll_entries_period
  ON payroll_entries (month, year)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_salary_slips_period
  ON salary_slips (month, year)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_sites_client
  ON sites (client_id)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_attendance_register_ot_employee
  ON attendance_register_employee_overtime (employee_id);
