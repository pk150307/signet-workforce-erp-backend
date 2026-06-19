export enum EmployeeStatus {
  Active = 1,
  Inactive = 2,
  OnLeave = 3,
  Terminated = 4,
  Suspended = 5,
  Probation = 6,
}

export enum Gender {
  Male = 1,
  Female = 2,
  Other = 3,
  PreferNotToSay = 4,
}

export enum EmploymentType {
  FullTime = 1,
  PartTime = 2,
  Contract = 3,
  Freelance = 4,
  Internship = 5,
  Temporary = 6,
}

export enum AttendanceStatus {
  Present = 1,
  Absent = 2,
  HalfDay = 3,
  OnLeave = 4,
  Holiday = 5,
  WeekOff = 6,
  Late = 7,
  EarlyOut = 8,
}

export enum LeaveType {
  Annual = 1,
  Sick = 2,
  Casual = 3,
  Maternity = 4,
  Paternity = 5,
  Unpaid = 6,
  Compensatory = 7,
}

export enum LeaveStatus {
  Pending = 1,
  Approved = 2,
  Rejected = 3,
  Cancelled = 4,
}

export enum PayrollStatus {
  Draft = 1,
  Processing = 2,
  Processed = 3,
  Approved = 4,
  Paid = 5,
  OnHold = 6,
}

export enum InvoiceStatus {
  Draft = 1,
  Sent = 2,
  Viewed = 3,
  PartiallyPaid = 4,
  Paid = 5,
  Overdue = 6,
  Cancelled = 7,
}

export enum UserRole {
  SuperAdmin = 'Super Admin',
  Admin = 'Admin',
  HR = 'HR',
  Manager = 'Manager',
  Employee = 'Employee',
}
