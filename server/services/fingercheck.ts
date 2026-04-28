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

// Utility: pair in/out punches into shifts for an employee on a given day.
// Each in/out pair is one shift. A job transfer (a new "in" arriving while a
// shift is still open) closes the previous shift at the transfer time and
// opens a new shift with the transfer time as its punch-in time.
export interface TimeShift {
  punchIn: string;
  punchOut: string | null;
  hours: number | null;
  jobCode: string | null;
  jobDescription: string | null;
  isTransferIn: boolean;
  isTransferOut: boolean;
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
    let current: {
      punchIn: string;
      jobCode: string | null;
      jobDescription: string | null;
      isTransferIn: boolean;
    } | null = null;

    const closeCurrent = (outTimeIso: string | null, isTransferOut: boolean) => {
      if (!current) return;
      let hours: number | null = null;
      if (outTimeIso) {
        const inT = new Date(current.punchIn).getTime();
        const outT = new Date(outTimeIso).getTime();
        if (!isNaN(inT) && !isNaN(outT) && outT >= inT) {
          hours = Math.round(((outT - inT) / (1000 * 60 * 60)) * 100) / 100;
        }
      }
      shifts.push({
        punchIn: current.punchIn,
        punchOut: outTimeIso,
        hours,
        jobCode: current.jobCode,
        jobDescription: current.jobDescription,
        isTransferIn: current.isTransferIn,
        isTransferOut,
      });
      current = null;
    };

    for (const p of sorted) {
      if (p.punchType === 1) {
        // Out punch
        if (current) {
          closeCurrent(p.actualTime, false);
        } else {
          // Orphan out — record it so it isn't silently dropped.
          shifts.push({
            punchIn: p.actualTime,
            punchOut: p.actualTime,
            hours: null,
            jobCode: p.jobCode,
            jobDescription: p.jobDescription,
            isTransferIn: false,
            isTransferOut: false,
          });
        }
      } else {
        // In (type 0) or any non-Out punch (e.g. explicit transfer types).
        if (current) {
          const sameJob = (current.jobCode || null) === (p.jobCode || null);
          const isExplicitTransferType = p.punchType !== 0;
          if (sameJob && !isExplicitTransferType) {
            // Duplicate / edited "In" on the same job — keep the original
            // open shift and skip this punch instead of falsely splitting.
            continue;
          }
          // Job transfer: close prior shift at the transfer time and start a
          // new one with the transfer time as its punch-in.
          closeCurrent(p.actualTime, true);
          current = {
            punchIn: p.actualTime,
            jobCode: p.jobCode,
            jobDescription: p.jobDescription,
            isTransferIn: true,
          };
        } else {
          current = {
            punchIn: p.actualTime,
            jobCode: p.jobCode,
            jobDescription: p.jobDescription,
            isTransferIn: false,
          };
        }
      }
    }

    // Any still-open shift means the employee never punched out (open shift).
    if (current) {
      closeCurrent(null, false);
    }

    // Detect implicit job transfers represented as an Out + In at the same
    // time on different jobs. The main loop already handles back-to-back In
    // punches; this pass also flags Out/In pairs as transfers so the UI shows
    // a "Transfer" badge consistently.
    for (let k = 0; k < shifts.length - 1; k++) {
      const a = shifts[k];
      const b = shifts[k + 1];
      if (
        a.punchOut &&
        b.punchIn &&
        a.punchOut === b.punchIn &&
        (a.jobCode || null) !== (b.jobCode || null)
      ) {
        a.isTransferOut = true;
        b.isTransferIn = true;
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

interface FingercheckJobResponse {
  Code: string;
  Description: string;
  MapCode?: string;
}

export async function fetchJobsFromFingercheck(): Promise<{ code: string; description: string }[]> {
  const response = await fetch(`${FINGERCHECK_BASE_URL}/v1/Sync/GetJobList`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Fingercheck jobs API error:", response.status, errorText.substring(0, 500));
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
    throw new Error("Fingercheck API returned invalid response for jobs");
  }

  let jobs: FingercheckJobResponse[];
  if (Array.isArray(data)) jobs = data;
  else if (data && Array.isArray(data.Data)) jobs = data.Data;
  else if (data && Array.isArray(data.data)) jobs = data.data;
  else throw new Error("Unexpected response format from Fingercheck jobs API");

  return jobs.map(j => ({
    code: j.Code,
    description: j.Description || j.Code,
  }));
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
