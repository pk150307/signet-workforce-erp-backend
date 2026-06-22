/**
 * Central OpenAPI path definitions for Swagger UI.
 * Keep in sync when adding or changing API routes.
 */

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: Authentication and session management
 *   - name: Employees
 *     description: Employee master data
 *   - name: Departments
 *     description: Department lookup
 *   - name: Designations
 *     description: Designation lookup
 *   - name: Attendance
 *     description: Attendance tracking
 *   - name: Leave
 *     description: Leave requests and approvals
 *   - name: Payroll
 *     description: Payroll processing
 *   - name: Salary Slips
 *     description: Salary slip generation and print
 *   - name: Statutory
 *     description: PF and ESIC statutory details
 *   - name: Billing
 *     description: Client and site invoicing
 *   - name: Dashboard
 *     description: Dashboard statistics
 *   - name: Clients
 *     description: Client management
 *   - name: Sites
 *     description: Site management
 *   - name: Documents
 *     description: Document upload
 *   - name: Shifts
 *     description: Shift management
 *   - name: Holidays
 *     description: Holiday calendar
 *   - name: Notifications
 *     description: User notifications
 *   - name: Reports
 *     description: Business reports
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     PaginatedResponse:
 *       type: object
 *       properties:
 *         items: { type: array, items: {} }
 *         totalCount: { type: integer }
 *         page: { type: integer }
 *         pageSize: { type: integer }
 *         totalPages: { type: integer }
 *     MonthYearBody:
 *       type: object
 *       required: [month, year]
 *       properties:
 *         month: { type: integer, minimum: 1, maximum: 12, example: 6 }
 *         year: { type: integer, minimum: 2000, maximum: 2100, example: 2026 }
 *     InvoiceLineItem:
 *       type: object
 *       required: [description, quantity, unitRate]
 *       properties:
 *         description: { type: string }
 *         quantity: { type: integer, minimum: 1 }
 *         unitRate: { type: number, minimum: 0 }
 *         hsnSacCode: { type: string, example: "998519" }
 *     FamilyMember:
 *       type: object
 *       properties:
 *         name: { type: string }
 *         relation: { type: string }
 *         dateOfBirth: { type: string, format: date }
 *         aadhaarNumber: { type: string }
 *     PfEsicUpsertBody:
 *       type: object
 *       properties:
 *         uanNumber: { type: string }
 *         pfNumber: { type: string }
 *         pfJoiningDate: { type: string, format: date }
 *         pfExitDate: { type: string, format: date }
 *         pfNomineeName: { type: string }
 *         pfNomineeRelation: { type: string }
 *         pfAccountNumber: { type: string }
 *         employerPfPercentage: { type: number }
 *         employeePfPercentage: { type: number }
 *         isPfApplicable: { type: boolean }
 *         pfRemarks: { type: string }
 *         esiNumber: { type: string }
 *         esiDispensary: { type: string }
 *         esiJoiningDate: { type: string, format: date }
 *         esiExitDate: { type: string, format: date }
 *         isEsiApplicable: { type: boolean }
 *         employerEsiPercentage: { type: number }
 *         employeeEsiPercentage: { type: number }
 *         familyMembers:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FamilyMember'
 *         esiRemarks: { type: string }
 *         panNumber: { type: string }
 *         aadhaarNumber: { type: string }
 *     CreateClientBody:
 *       type: object
 *       required: [companyName, contactPerson, email, phone, address, city, state]
 *       properties:
 *         companyName: { type: string, example: "Brigade Enterprises Ltd." }
 *         contactPerson: { type: string, example: "Rajesh Kumar" }
 *         email: { type: string, format: email, example: "rajesh@brigade.com" }
 *         phone: { type: string, example: "9876543210" }
 *         alternatePhone: { type: string, nullable: true }
 *         website: { type: string, nullable: true }
 *         address: { type: string, example: "135 Brigade Road" }
 *         city: { type: string, example: "Bengaluru" }
 *         state: { type: string, example: "Karnataka" }
 *         pinCode: { type: string, example: "560025" }
 *         gstNumber: { type: string, nullable: true }
 *         panNumber: { type: string, nullable: true }
 *         notes: { type: string, nullable: true }
 *         isActive: { type: boolean, default: true }
 *     CreateSiteBody:
 *       type: object
 *       required: [clientId, siteName, address, city, state]
 *       properties:
 *         clientId: { type: string, format: uuid }
 *         siteName: { type: string, example: "Brigade Tech Park" }
 *         description: { type: string, nullable: true }
 *         address: { type: string, example: "135 Brigade Road" }
 *         city: { type: string, example: "Bengaluru" }
 *         state: { type: string, example: "Karnataka" }
 *         pinCode: { type: string, example: "560025" }
 *         contactPerson: { type: string, nullable: true }
 *         contactPhone: { type: string, nullable: true }
 *         contactEmail: { type: string, format: email, nullable: true }
 *         requiredHeadcount: { type: integer, minimum: 0, example: 45 }
 *         billingRatePerDay: { type: number, nullable: true }
 *         billingRatePerMonth: { type: number, nullable: true }
 *         isActive: { type: boolean, default: true }
 */

/**
 * @openapi
 * /api/auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     security: []
 *     summary: Refresh access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: New tokens issued }
 */
/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout current session
 *     responses:
 *       204: { description: Logged out }
 */
/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change password for authenticated user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string }
 *     responses:
 *       204: { description: Password changed }
 */
/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     security: []
 *     summary: Request password reset
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       204: { description: Reset email sent if account exists }
 */

/**
 * @openapi
 * /api/employees/dashboard:
 *   get:
 *     tags: [Employees]
 *     summary: Employee dashboard KPIs and charts data
 *     responses:
 *       200: { description: Dashboard stats }
 */
/**
 * @openapi
 * /api/employees/recent:
 *   get:
 *     tags: [Employees]
 *     summary: Recently added employees
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 5, maximum: 50 }
 *     responses:
 *       200: { description: Recent employee list }
 */
/**
 * @openapi
 * /api/employees/activities:
 *   get:
 *     tags: [Employees]
 *     summary: Recent employee activity feed
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *     responses:
 *       200: { description: Activity list }
 */
/**
 * @openapi
 * /api/employees/generate-code:
 *   get:
 *     tags: [Employees]
 *     summary: Generate next employee code
 *     responses:
 *       200:
 *         description: Generated code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: string, example: "SS-00001" }
 */
/**
 * @openapi
 * /api/employees/export:
 *   get:
 *     tags: [Employees]
 *     summary: Export employees as CSV
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv: {}
 */
/**
 * @openapi
 * /api/employees/bulk/import:
 *   post:
 *     tags: [Employees]
 *     summary: Bulk import employees from JSON rows
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rows]
 *             properties:
 *               rows:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200: { description: Import summary with imported/skipped/errors }
 */
/**
 * @openapi
 * /api/employees/draft:
 *   post:
 *     tags: [Employees]
 *     summary: Create employee draft (multi-step wizard)
 *     responses:
 *       201: { description: Returns id and employeeCode }
 */
/**
 * @openapi
 * /api/employees:
 *   get:
 *     tags: [Employees]
 *     summary: List employees (paginated, searchable)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: departmentId
 *         schema: { type: string }
 *       - in: query
 *         name: designationId
 *         schema: { type: string }
 *       - in: query
 *         name: siteId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: integer, description: "0=Draft, 1=Active, 2=Left, 3=Rejoined" }
 *       - in: query
 *         name: employmentType
 *         schema: { type: integer }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [name, code, joiningdate, createdat] }
 *       - in: query
 *         name: sortDir
 *         schema: { type: string, enum: [asc, desc] }
 *     responses:
 *       200: { description: Paginated employee list }
 *   post:
 *     tags: [Employees]
 *     summary: Create active employee
 *     responses:
 *       201: { description: Returns id and employeeCode }
 */
/**
 * @openapi
 * /api/employees/{id}/draft:
 *   put:
 *     tags: [Employees]
 *     summary: Update employee draft
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated draft id and employeeCode }
 */
/**
 * @openapi
 * /api/employees/{id}/submit:
 *   post:
 *     tags: [Employees]
 *     summary: Submit draft and activate employee
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Submit result with status Active }
 */
/**
 * @openapi
 * /api/employees/{id}/profile:
 *   get:
 *     tags: [Employees]
 *     summary: Full employee profile with attendance, payroll, leave summaries
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Complete profile object }
 */
/**
 * @openapi
 * /api/employees/{id}/timeline:
 *   get:
 *     tags: [Employees]
 *     summary: Chronological employee timeline
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Timeline events }
 */
/**
 * @openapi
 * /api/employees/{id}/history:
 *   get:
 *     tags: [Employees]
 *     summary: Employee audit history
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: History events }
 */
/**
 * @openapi
 * /api/employees/{id}/documents:
 *   get:
 *     tags: [Employees]
 *     summary: List employee documents
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Document list }
 *   post:
 *     tags: [Employees]
 *     summary: Upload employee document
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, type]
 *             properties:
 *               file: { type: string, format: binary }
 *               type: { type: string, example: aadhaar }
 *               label: { type: string }
 *     responses:
 *       201: { description: Uploaded document metadata }
 */
/**
 * @openapi
 * /api/employees/{id}/documents/{documentId}:
 *   delete:
 *     tags: [Employees]
 *     summary: Soft-delete employee document
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 */
/**
 * @openapi
 * /api/employees/{id}/documents/{documentId}/download:
 *   get:
 *     tags: [Employees]
 *     summary: Download employee document file
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: File stream }
 */
/**
 * @openapi
 * /api/employees/{id}/mark-left:
 *   post:
 *     tags: [Employees]
 *     summary: Mark employee as left (does not delete records)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lastWorkingDate, reason]
 *             properties:
 *               lastWorkingDate: { type: string, format: date }
 *               reason: { type: string }
 *               remarks: { type: string }
 *     responses:
 *       204: { description: Marked left }
 */
/**
 * @openapi
 * /api/employees/{id}/rejoin:
 *   post:
 *     tags: [Employees]
 *     summary: Rejoin a former employee
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [joiningDate, departmentId, designationId]
 *             properties:
 *               joiningDate: { type: string, format: date }
 *               departmentId: { type: string }
 *               designationId: { type: string }
 *               siteId: { type: string, format: uuid }
 *               reportingManagerId: { type: string, format: uuid }
 *               reuseEmployeeCode: { type: boolean, default: true }
 *               basicSalary: { type: number }
 *               grossSalary: { type: number }
 *     responses:
 *       204: { description: Rejoined }
 */
/**
 * @openapi
 * /api/employees/{id}:
 *   get:
 *     tags: [Employees]
 *     summary: Get employee by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Employee detail }
 *   put:
 *     tags: [Employees]
 *     summary: Update employee
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Updated }
 *   delete:
 *     tags: [Employees]
 *     summary: Soft-delete employee
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Archived }
 */
/**
 * @openapi
 * /api/employees/{id}/photo:
 *   post:
 *     tags: [Employees]
 *     summary: Upload employee profile photo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [photo]
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200: { description: Photo URL updated }
 */

/**
 * @openapi
 * /api/departments:
 *   get:
 *     tags: [Departments]
 *     summary: List all departments
 *     responses:
 *       200: { description: Department list }
 */
/**
 * @openapi
 * /api/designations:
 *   get:
 *     tags: [Designations]
 *     summary: List all designations
 *     responses:
 *       200: { description: Designation list }
 */

/**
 * @openapi
 * /api/attendance/registers/employees:
 *   get:
 *     tags: [Attendance]
 *     summary: Client-wise employee attendance list for a month
 *     parameters:
 *       - in: query
 *         name: clientId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Register metadata and per-employee P/A/L counts }
 */
/**
 * @openapi
 * /api/attendance/registers/grid:
 *   get:
 *     tags: [Attendance]
 *     summary: Spreadsheet register grid (employees × dates)
 *     parameters:
 *       - in: query
 *         name: clientId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Register grid with cell statuses }
 */
/**
 * @openapi
 * /api/attendance/registers/cells:
 *   put:
 *     tags: [Attendance]
 *     summary: Batch update register cells
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, month, year, updates]
 *             properties:
 *               clientId: { type: string, format: uuid }
 *               month: { type: integer }
 *               year: { type: integer }
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [employeeId, date, status]
 *                   properties:
 *                     employeeId: { type: string, format: uuid }
 *                     date: { type: string, format: date }
 *                     status: { type: integer, nullable: true }
 *     responses:
 *       200: { description: Updated register grid }
 */
/**
 * @openapi
 * /api/attendance/registers/employees/{employeeId}/cells:
 *   put:
 *     tags: [Attendance]
 *     summary: Submit all attendance cells for one employee row
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, month, year, cells]
 *             properties:
 *               clientId: { type: string, format: uuid }
 *               month: { type: integer }
 *               year: { type: integer }
 *               cells:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [date, status]
 *                   properties:
 *                     date: { type: string, format: date }
 *                     status: { type: integer, nullable: true }
 *     responses:
 *       200: { description: Saved employee row and updated register metadata }
 */
/**
 * @openapi
 * /api/attendance/registers/bulk:
 *   post:
 *     tags: [Attendance]
 *     summary: Bulk mark register (Sundays, all present, clear unmarked)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, month, year, action]
 *             properties:
 *               clientId: { type: string, format: uuid }
 *               month: { type: integer }
 *               year: { type: integer }
 *               action:
 *                 type: string
 *                 enum: [mark_sundays, mark_all_present, clear_unmarked]
 *               status: { type: integer }
 *     responses:
 *       200: { description: Bulk update result with updated grid }
 */
/**
 * @openapi
 * /api/attendance/registers/import/template:
 *   get:
 *     tags: [Attendance]
 *     summary: Download CSV import template
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 */
/**
 * @openapi
 * /api/attendance/registers/import/preview:
 *   post:
 *     tags: [Attendance]
 *     summary: Preview CSV import without saving
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, month, year, content]
 *             properties:
 *               clientId: { type: string, format: uuid }
 *               month: { type: integer }
 *               year: { type: integer }
 *               content: { type: string }
 *     responses:
 *       200: { description: Valid rows, errors, and preview grid }
 */
/**
 * @openapi
 * /api/attendance/registers/import/apply:
 *   post:
 *     tags: [Attendance]
 *     summary: Apply CSV import to register
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, month, year, content]
 *             properties:
 *               clientId: { type: string, format: uuid }
 *               month: { type: integer }
 *               year: { type: integer }
 *               content: { type: string }
 *     responses:
 *       200: { description: Applied/skipped counts with updated grid }
 */
/**
 * @openapi
 * /api/attendance/registers/import/file-preview:
 *   post:
 *     tags: [Attendance]
 *     summary: Preview uploaded CSV file
 *     parameters:
 *       - in: query
 *         name: clientId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200: { description: Valid rows, errors, and preview grid }
 */
/**
 * @openapi
 * /api/attendance/registers/lock:
 *   post:
 *     tags: [Attendance]
 *     summary: Submit and lock register for the month
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, month, year, verified]
 *             properties:
 *               clientId: { type: string, format: uuid }
 *               month: { type: integer }
 *               year: { type: integer }
 *               verified: { type: boolean }
 *     responses:
 *       200: { description: Locked register employee list }
 */
/**
 * @openapi
 * /api/attendance/registers/unlock:
 *   post:
 *     tags: [Attendance]
 *     summary: Unlock register with audit reason
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, month, year, reason]
 *             properties:
 *               clientId: { type: string, format: uuid }
 *               month: { type: integer }
 *               year: { type: integer }
 *               reason: { type: string }
 *     responses:
 *       200: { description: Unlocked register employee list }
 */
/**
 * @openapi
 * /api/attendance/registers/unlock-history:
 *   get:
 *     tags: [Attendance]
 *     summary: Unlock audit log for a register
 *     parameters:
 *       - in: query
 *         name: clientId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Unlock log entries }
 */
/**
 * @openapi
 * /api/attendance/employees/{employeeId}/calendar:
 *   get:
 *     tags: [Attendance]
 *     summary: Employee month calendar with summary
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Day-wise calendar and month summary }
 */

/**
 * @openapi
 * /api/leave:
 *   get:
 *     tags: [Leave]
 *     summary: List leave requests
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated leave requests }
 */
/**
 * @openapi
 * /api/leave/request:
 *   post:
 *     tags: [Leave]
 *     summary: Submit leave request
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [employeeId, leaveType, fromDate, toDate, reason]
 *             properties:
 *               employeeId: { type: string, format: uuid }
 *               leaveType: { type: integer }
 *               fromDate: { type: string, format: date }
 *               toDate: { type: string, format: date }
 *               isHalfDay: { type: boolean }
 *               reason: { type: string }
 *     responses:
 *       201: { description: Leave request created }
 */
/**
 * @openapi
 * /api/leave/{id}/approve:
 *   put:
 *     tags: [Leave]
 *     summary: Approve or reject leave request
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [approve]
 *             properties:
 *               approve: { type: boolean }
 *               comments: { type: string }
 *     responses:
 *       204: { description: Leave status updated }
 */

/**
 * @openapi
 * /api/payroll:
 *   get:
 *     tags: [Payroll]
 *     summary: List payroll runs
 *     responses:
 *       200: { description: Payroll run history }
 */
/**
 * @openapi
 * /api/payroll/process:
 *   post:
 *     tags: [Payroll]
 *     summary: Process payroll for a month
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/MonthYearBody'
 *               - type: object
 *                 properties:
 *                   employeeIds:
 *                     type: array
 *                     items: { type: string, format: uuid }
 *     responses:
 *       201: { description: Payroll run id }
 */

/**
 * @openapi
 * /api/payroll/payslips:
 *   get:
 *     tags: [Salary Slips]
 *     summary: List salary slips
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: employeeId
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Paginated salary slips }
 */
/**
 * @openapi
 * /api/payroll/payslips/generate:
 *   post:
 *     tags: [Salary Slips]
 *     summary: Generate salary slips from processed payroll
 *     description: Run after payroll processing for the same month/year.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MonthYearBody'
 *     responses:
 *       200:
 *         description: Generation summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 generated: { type: integer }
 *                 month: { type: integer }
 *                 year: { type: integer }
 */
/**
 * @openapi
 * /api/payroll/payslips/{id}:
 *   get:
 *     tags: [Salary Slips]
 *     summary: Get salary slip detail
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Salary slip detail }
 */
/**
 * @openapi
 * /api/payroll/payslips/{id}/print:
 *   get:
 *     tags: [Salary Slips]
 *     summary: Get print-ready salary slip payload
 *     description: Returns company, employee, earnings, deductions, and attendance for PDF/print UI.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Print-ready salary slip data }
 */

/**
 * @openapi
 * /api/statutory/pf-esic:
 *   get:
 *     tags: [Statutory]
 *     summary: List PF/ESIC details for all employees
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: siteId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: pfApplicable
 *         schema: { type: boolean }
 *       - in: query
 *         name: esiApplicable
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: Paginated PF/ESIC records }
 */
/**
 * @openapi
 * /api/statutory/pf-esic/bulk:
 *   post:
 *     tags: [Statutory]
 *     summary: Bulk upsert PF/ESIC details
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   allOf:
 *                     - type: object
 *                       required: [employeeId]
 *                       properties:
 *                         employeeId: { type: string, format: uuid }
 *                     - $ref: '#/components/schemas/PfEsicUpsertBody'
 *     responses:
 *       200: { description: Bulk update result with updated count }
 */
/**
 * @openapi
 * /api/statutory/pf-esic/{employeeId}:
 *   get:
 *     tags: [Statutory]
 *     summary: Get PF/ESIC details for one employee
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: PF/ESIC detail }
 *   put:
 *     tags: [Statutory]
 *     summary: Create or update PF/ESIC details for an employee
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PfEsicUpsertBody'
 *     responses:
 *       200: { description: Updated PF/ESIC detail }
 */

/**
 * @openapi
 * /api/billing/invoices:
 *   get:
 *     tags: [Billing]
 *     summary: List invoices
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer }
 *       - in: query
 *         name: clientId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: integer }
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated invoices }
 *   post:
 *     tags: [Billing]
 *     summary: Create manual invoice
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, invoiceDate, dueDate, month, year, gstRate, lineItems]
 *             properties:
 *               clientId: { type: string, format: uuid }
 *               siteId: { type: string, format: uuid }
 *               invoiceDate: { type: string, format: date }
 *               dueDate: { type: string, format: date }
 *               month: { type: integer }
 *               year: { type: integer }
 *               gstRate: { type: number }
 *               notes: { type: string }
 *               termsAndConditions: { type: string }
 *               lineItems:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/InvoiceLineItem'
 *     responses:
 *       201: { description: Invoice id }
 */
/**
 * @openapi
 * /api/billing/invoices/suggested-line-items:
 *   get:
 *     tags: [Billing]
 *     summary: Suggested invoice line items from client department rates
 *     parameters:
 *       - in: query
 *         name: clientId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: siteId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Suggested line items with quantities and unit rates }
 */
/**
 * @openapi
 * /api/billing/invoices/generate-by-sites:
 *   post:
 *     tags: [Billing]
 *     summary: Auto-generate invoices for active sites
 *     description: Creates one invoice per site using headcount and site billing rates. Skips sites that already have an invoice for the period.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/MonthYearBody'
 *               - type: object
 *                 properties:
 *                   siteIds:
 *                     type: array
 *                     items: { type: string, format: uuid }
 *                   gstRate: { type: number, default: 18 }
 *                   dueDateDays: { type: integer, default: 30 }
 *                   notes: { type: string }
 *     responses:
 *       200:
 *         description: Generation summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 generated: { type: integer }
 *                 skipped: { type: integer }
 *                 invoices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       siteId: { type: string, format: uuid }
 *                       siteName: { type: string }
 *                       invoiceId: { type: string, format: uuid }
 *                       invoiceNumber: { type: string }
 *                       totalAmount: { type: number }
 */
/**
 * @openapi
 * /api/billing/invoices/by-site/{siteId}:
 *   get:
 *     tags: [Billing]
 *     summary: List invoices for a site
 *     parameters:
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer }
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated site invoices with line items }
 */
/**
 * @openapi
 * /api/billing/invoices/site/{siteId}:
 *   post:
 *     tags: [Billing]
 *     summary: Create manual invoice for a specific site
 *     parameters:
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invoiceDate, dueDate, month, year, gstRate, lineItems]
 *             properties:
 *               invoiceDate: { type: string, format: date }
 *               dueDate: { type: string, format: date }
 *               month: { type: integer }
 *               year: { type: integer }
 *               gstRate: { type: number }
 *               notes: { type: string }
 *               termsAndConditions: { type: string }
 *               lineItems:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/InvoiceLineItem'
 *     responses:
 *       200: { description: Created site invoice }
 */
/**
 * @openapi
 * /api/billing/invoices/{id}:
 *   get:
 *     tags: [Billing]
 *     summary: Get invoice detail for print/view
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Invoice with line items and client/site details }
 */

/**
 * @openapi
 * /api/dashboard/stats:
 *   get:
 *     tags: [Dashboard]
 *     summary: Dashboard KPI statistics
 *     responses:
 *       200: { description: Dashboard stats }
 */
/**
 * @openapi
 * /api/clients:
 *   get:
 *     tags: [Clients]
 *     summary: List clients
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Paginated clients
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, format: uuid }
 *                           clientCode: { type: string }
 *                           companyName: { type: string }
 *                           contactPerson: { type: string }
 *                           email: { type: string }
 *                           phone: { type: string }
 *                           city: { type: string }
 *                           state: { type: string }
 *                           isActive: { type: boolean }
 *                           totalSites: { type: integer }
 *   post:
 *     tags: [Clients]
 *     summary: Create client
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateClientBody'
 *     responses:
 *       201:
 *         description: Client created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 clientCode: { type: string }
 */
/**
 * @openapi
 * /api/clients/{id}:
 *   get:
 *     tags: [Clients]
 *     summary: Get client by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Client detail }
 *       404: { description: Client not found }
 *   put:
 *     tags: [Clients]
 *     summary: Update client
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateClientBody'
 *     responses:
 *       200: { description: Updated client }
 *       404: { description: Client not found }
 *   delete:
 *     tags: [Clients]
 *     summary: Delete client
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Client deleted }
 *       404: { description: Client not found }
 */
/**
 * @openapi
 * /api/clients/{id}/sites:
 *   get:
 *     tags: [Clients]
 *     summary: List sites for a client
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated sites for the client }
 *       404: { description: Client not found }
 */
/**
 * @openapi
 * /api/sites/summary:
 *   get:
 *     tags: [Sites]
 *     summary: Site dashboard summary
 *     responses:
 *       200:
 *         description: Aggregate site statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalSites: { type: integer }
 *                 activeSites: { type: integer }
 *                 totalHeadcountRequired: { type: integer }
 *                 totalDeployed: { type: integer }
 *                 understaffedSites: { type: integer }
 */
/**
 * @openapi
 * /api/sites:
 *   get:
 *     tags: [Sites]
 *     summary: List sites
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: clientId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Paginated site list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, format: uuid }
 *                           siteCode: { type: string }
 *                           siteName: { type: string }
 *                           clientId: { type: string, format: uuid }
 *                           clientCompanyName: { type: string }
 *                           city: { type: string }
 *                           state: { type: string }
 *                           requiredHeadcount: { type: integer }
 *                           deployedHeadcount: { type: integer }
 *                           isActive: { type: boolean }
 *   post:
 *     tags: [Sites]
 *     summary: Create site
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSiteBody'
 *     responses:
 *       201:
 *         description: Site created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 siteCode: { type: string }
 */
/**
 * @openapi
 * /api/sites/{id}:
 *   get:
 *     tags: [Sites]
 *     summary: Get site by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Site detail }
 *       404: { description: Site not found }
 *   put:
 *     tags: [Sites]
 *     summary: Update site
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSiteBody'
 *     responses:
 *       200: { description: Updated site }
 *       404: { description: Site not found }
 *   delete:
 *     tags: [Sites]
 *     summary: Delete site
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Site deleted }
 *       404: { description: Site not found }
 */
/**
 * @openapi
 * /api/documents/upload:
 *   post:
 *     tags: [Documents]
 *     summary: Upload a document
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               entityType: { type: string, example: employee }
 *               entityId: { type: string, format: uuid }
 *               documentType: { type: string }
 *     responses:
 *       201: { description: Document uploaded }
 */
/**
 * @openapi
 * /api/shifts:
 *   get:
 *     tags: [Shifts]
 *     summary: List shifts
 *     responses:
 *       200: { description: Shift list }
 *   post:
 *     tags: [Shifts]
 *     summary: Create shift
 *     responses:
 *       201: { description: Shift id }
 */
/**
 * @openapi
 * /api/shifts/{id}:
 *   put:
 *     tags: [Shifts]
 *     summary: Update shift
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated shift }
 */
/**
 * @openapi
 * /api/holidays:
 *   get:
 *     tags: [Holidays]
 *     summary: List holidays
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Holiday list }
 *   post:
 *     tags: [Holidays]
 *     summary: Create holiday
 *     responses:
 *       201: { description: Holiday id }
 */
/**
 * @openapi
 * /api/holidays/{id}:
 *   put:
 *     tags: [Holidays]
 *     summary: Update holiday
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated holiday }
 *   delete:
 *     tags: [Holidays]
 *     summary: Delete holiday
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 */
/**
 * @openapi
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List notifications for current user
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer }
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: Paginated notifications }
 */
/**
 * @openapi
 * /api/notifications/read-all:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     responses:
 *       204: { description: All marked read }
 */
/**
 * @openapi
 * /api/notifications/{id}/read:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark one notification as read
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Marked read }
 */
/**
 * @openapi
 * /api/reports/attendance:
 *   get:
 *     tags: [Reports]
 *     summary: Attendance summary report
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: Attendance report }
 */
/**
 * @openapi
 * /api/reports/payroll:
 *   get:
 *     tags: [Reports]
 *     summary: Payroll summary report
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Payroll report }
 */
/**
 * @openapi
 * /api/reports/billing:
 *   get:
 *     tags: [Reports]
 *     summary: Billing summary report
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Billing report }
 */

export {};
