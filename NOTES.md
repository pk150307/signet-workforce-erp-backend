# Employee Master salary ownership — notes

## What changed

Employee Master now owns compensation and statutory applicability that previously lived on designation pay grades:

- **Basic Salary**, **HRA**, **Special Allowance**
- **PF / ESIC / LWF Applicable** plus contribution values:
  - Employee PF % (default 12) and PF max amount (default 1800)
  - Employee ESIC % (default 0.75) and ESIC max amount (default 0 = no cap)
  - Employee LWF % (default 0.2) and LWF max amount (default 35)
- **Client Soft Code** on Employment Details (optional)
- Auto employee ID format is **`SIG-000001`** (6-digit padded)

Gross is computed as `basic + HRA + special` on save.

## Assumptions / conventions followed

1. **Stack match** — Backend uses Express + raw `pg` SQL (not Sequelize/TypeORM) and `express-validator`. Frontend is the sibling Angular 18 app at `../signet-workforce-erp-frontend`.
2. **Wizard shape** — Kept the existing Material stepper (not a full accordion rebuild). Added a **Salary** step between Statutory & Bank and Documents.
3. **Employee ID format** — Existing repo uses `SS-XXXXX`, not `SIG-XXXXX`; left unchanged.
4. **Pay grades not hard-deleted** — `/api/designation-grades` and `designation_grades` remain because client billing (`client_designation_grade_rates`) still keys off grades. They are removed from Employee create/edit UI and Designation detail management UI. Payroll prefers employee-level compensation/flags.
5. **Migration** — `024_employee_salary_components.sql` adds `house_rent_allowance` / `special_allowance` on employees + employment details, and `is_lwf_applicable` (+ LWF %/max) on `employee_statutory_details`. Existing PF/ESI flags on statutory details are reused.
6. **Backfill** — Migration copies HRA/special/LWF from an assigned grade when employee values were still zero, so existing payroll data stays usable.
7. **Defaults** — PF / ESIC / LWF applicable default to `true` on new employees.

## Follow-ups (not in this change)

- Migrate billing rates off designation grades onto designation- or employee-level rates, then deprecate `/api/designation-grades`.
- Optionally regenerate OpenAPI (`npm run openapi:generate`) after deploy.
