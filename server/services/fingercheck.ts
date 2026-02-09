const FINGERCHECK_BASE_URL = "https://developer.fingercheck.com/api";

interface FingercheckEmployeeResponse {
  EmployeeID: number;
  EmployeeNumber: string;
  FirstName: string;
  LastName: string;
  MiddleInitial: string;
  Email: string;
  Phone: string;
  MobilePhone: string;
  JobTitle: string;
  Position: string;
  Location: string;
  HireDate: string;
  TerminationDate: string;
  DivisionEmployeeStatus: string;
  PayType: string;
  Address1: string;
  Address2: string;
  City: string;
  State: string;
  ZipCode: string;
  IsASupervisor: boolean;
  CostCenter1: string;
  CostCenter2: string;
  CostCenter3: string;
  Job: string;
}

function getHeaders() {
  const apiKey = process.env.FINGERCHECK_API_KEY;
  const clientSecret = process.env.FINGERCHECK_CLIENT_SECRET;

  if (!apiKey || !clientSecret) {
    throw new Error("Fingercheck API credentials not configured");
  }

  return {
    "Content-Type": "application/json",
    "APIKEY": apiKey,
    "ClientSecretKey": clientSecret,
  };
}

export async function fetchEmployeesFromFingercheck(): Promise<FingercheckEmployeeResponse[]> {
  const response = await fetch(`${FINGERCHECK_BASE_URL}/v1/Employees/GetAllEmployees`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Fingercheck API error:", response.status, errorText.substring(0, 500));
    if (response.status === 401) {
      throw new Error("Fingercheck API authentication failed. Please verify your API Key and Client Secret Key are correct and active.");
    }
    if (response.status === 403) {
      throw new Error("Fingercheck API access denied. Your API credentials may not have permission to access employee data.");
    }
    throw new Error(`Fingercheck API error: ${response.status}`);
  }

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("Fingercheck API returned non-JSON response:", text.substring(0, 500));
    throw new Error("Fingercheck API returned invalid response");
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data.Data)) {
    return data.Data;
  }

  if (data && Array.isArray(data.data)) {
    return data.data;
  }

  console.error("Unexpected Fingercheck response shape:", JSON.stringify(data).substring(0, 500));
  throw new Error("Unexpected response format from Fingercheck API");
}

// Time Card Raw Data types
interface FingercheckTimePunchResponse {
  EmployeeID: number;
  EmployeeNumber: string;
  FirstName: string;
  MiddleInitial: string;
  LastName: string;
  Date: string;
  ActualTime: string;
  RoundedTime: string;
  PunchType: number;
  JobPunch: string | null;
  JobDescriptionPunch: string | null;
  TaskPunch: string | null;
  TaskDescriptionPunch: string | null;
  Note: string | null;
  EntryDetails: string | null;
  EntryType: string | null;
  IsPunchEdit: boolean;
  TimeClockHistoryGuid: string;
}

export async function fetchTimeCardData(startDate: string, endDate: string): Promise<FingercheckTimePunchResponse[]> {
  const response = await fetch(
    `${FINGERCHECK_BASE_URL}/v1/Reports/GetAllTimeCardRawDataForDateRange?startDate=${startDate}&endDate=${endDate}`,
    { method: "GET", headers: getHeaders() }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Fingercheck time card API error:", response.status, errorText.substring(0, 500));
    if (response.status === 401) {
      throw new Error("Fingercheck API authentication failed. Please verify your API credentials.");
    }
    throw new Error(`Fingercheck API error: ${response.status}`);
  }

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Fingercheck API returned invalid response for time cards");
  }

  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.Data)) return data.Data;
  if (data && Array.isArray(data.data)) return data.data;

  throw new Error("Unexpected response format from Fingercheck time card API");
}

export function mapTimePunch(punch: FingercheckTimePunchResponse) {
  return {
    guid: punch.TimeClockHistoryGuid,
    employeeId: punch.EmployeeID,
    employeeNumber: punch.EmployeeNumber || null,
    firstName: punch.FirstName?.trim() || null,
    lastName: punch.LastName?.trim() || null,
    date: punch.Date,
    actualTime: punch.ActualTime,
    roundedTime: punch.RoundedTime || null,
    punchType: punch.PunchType,
    jobCode: punch.JobPunch || null,
    jobDescription: punch.JobDescriptionPunch?.trim() || null,
    taskCode: punch.TaskPunch || null,
    taskDescription: punch.TaskDescriptionPunch?.trim() || null,
    note: punch.Note || null,
    entryDetails: punch.EntryDetails || null,
    entryType: punch.EntryType || null,
    isPunchEdit: punch.IsPunchEdit || false,
  };
}

export function isValidTimePunch(punch: FingercheckTimePunchResponse): boolean {
  return !!punch.TimeClockHistoryGuid && !!punch.EmployeeID && !!punch.ActualTime;
}

// Utility: pair in/out punches into shifts for an employee on a given day
export interface TimeShift {
  punchIn: string;
  punchOut: string | null;
  hours: number | null;
  jobCode: string | null;
  jobDescription: string | null;
}

export interface DailyTimeSummary {
  date: string;
  employeeId: number;
  employeeName: string;
  shifts: TimeShift[];
  totalHours: number;
  jobCode: string | null;
  jobDescription: string | null;
}

export function buildDailyTimeSummaries(punches: Array<{
  employeeId: number;
  firstName: string | null;
  lastName: string | null;
  date: string;
  actualTime: string;
  punchType: number;
  jobCode: string | null;
  jobDescription: string | null;
}>): DailyTimeSummary[] {
  const byEmployeeDay = new Map<string, typeof punches>();

  for (const p of punches) {
    const dateOnly = p.date.split("T")[0];
    const key = `${p.employeeId}_${dateOnly}`;
    if (!byEmployeeDay.has(key)) byEmployeeDay.set(key, []);
    byEmployeeDay.get(key)!.push(p);
  }

  const summaries: DailyTimeSummary[] = [];

  for (const [, dayPunches] of byEmployeeDay) {
    const sorted = dayPunches.sort((a, b) => a.actualTime.localeCompare(b.actualTime));
    const emp = sorted[0];
    const dateOnly = emp.date.split("T")[0];

    const shifts: TimeShift[] = [];
    let i = 0;
    while (i < sorted.length) {
      const current = sorted[i];
      if (current.punchType === 0) {
        const next = sorted[i + 1];
        if (next && next.punchType === 1) {
          const inTime = new Date(current.actualTime);
          const outTime = new Date(next.actualTime);
          const hours = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
          shifts.push({
            punchIn: current.actualTime,
            punchOut: next.actualTime,
            hours: Math.round(hours * 100) / 100,
            jobCode: current.jobCode,
            jobDescription: current.jobDescription,
          });
          i += 2;
        } else {
          shifts.push({
            punchIn: current.actualTime,
            punchOut: null,
            hours: null,
            jobCode: current.jobCode,
            jobDescription: current.jobDescription,
          });
          i++;
        }
      } else {
        shifts.push({
          punchIn: current.actualTime,
          punchOut: null,
          hours: null,
          jobCode: current.jobCode,
          jobDescription: current.jobDescription,
        });
        i++;
      }
    }

    const totalHours = shifts.reduce((sum, s) => sum + (s.hours || 0), 0);
    const primaryJob = sorted.find(p => p.jobCode)?.jobCode || null;
    const primaryJobDesc = sorted.find(p => p.jobDescription)?.jobDescription || null;

    summaries.push({
      date: dateOnly,
      employeeId: emp.employeeId,
      employeeName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim(),
      shifts,
      totalHours: Math.round(totalHours * 100) / 100,
      jobCode: primaryJob,
      jobDescription: primaryJobDesc,
    });
  }

  return summaries.sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName));
}

export function isValidEmployee(emp: FingercheckEmployeeResponse): boolean {
  return !!emp.EmployeeID && !!(emp.FirstName || emp.LastName);
}

export function mapFingercheckEmployee(emp: FingercheckEmployeeResponse) {
  const statusStr = (emp.DivisionEmployeeStatus || "").trim().toUpperCase();
  const isTerminated = statusStr === "T" || statusStr === "TERMINATED" || !!emp.TerminationDate;
  
  const clean = (val: string | null | undefined): string | null => {
    if (!val) return null;
    const trimmed = val.trim();
    if (trimmed === "" || trimmed === "()-" || trimmed === "() -") return null;
    return trimmed;
  };

  return {
    employeeId: emp.EmployeeID,
    employeeNumber: clean(emp.EmployeeNumber),
    firstName: clean(emp.FirstName) || "Unknown",
    lastName: clean(emp.LastName) || "Unknown",
    middleInitial: clean(emp.MiddleInitial),
    email: clean(emp.Email),
    phone: clean(emp.Phone),
    mobilePhone: clean(emp.MobilePhone),
    jobTitle: clean(emp.JobTitle),
    position: clean(emp.Position),
    department: clean(emp.CostCenter1) || clean(emp.Job),
    location: clean(emp.Location),
    hireDate: emp.HireDate || null,
    terminationDate: emp.TerminationDate || null,
    status: isTerminated ? "terminated" : "active",
    payType: clean(emp.PayType),
    address1: clean(emp.Address1),
    address2: clean(emp.Address2),
    city: clean(emp.City),
    state: clean(emp.State),
    zipCode: clean(emp.ZipCode),
    isSupervisor: emp.IsASupervisor || false,
  };
}
