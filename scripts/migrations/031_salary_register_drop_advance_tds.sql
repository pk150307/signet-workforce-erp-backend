-- Remove Advance and TDS from salary register (existing installs of 030)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'salary_register_employees' AND column_name = 'advance'
  ) THEN
    UPDATE salary_register_employees
    SET
      total_deduction = GREATEST(0, total_deduction - COALESCE(advance, 0) - COALESCE(tds, 0)),
      net_pay = net_pay + COALESCE(advance, 0) + COALESCE(tds, 0);

    UPDATE salary_registers
    SET
      total_deductions = GREATEST(0, total_deductions - COALESCE(total_advance, 0) - COALESCE(total_tds, 0)),
      total_net_pay = total_net_pay + COALESCE(total_advance, 0) + COALESCE(total_tds, 0);
  END IF;
END $$;

ALTER TABLE salary_register_employees
  DROP COLUMN IF EXISTS advance,
  DROP COLUMN IF EXISTS tds;

ALTER TABLE salary_registers
  DROP COLUMN IF EXISTS total_advance,
  DROP COLUMN IF EXISTS total_tds;
