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
