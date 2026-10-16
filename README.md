# Human Resource Management System (HRMS)

## A Full-Stack Web Application for Employee, Attendance, Leave, and Payroll Management

## 1. Project Overview

The Human Resource Management System (HRMS) is a full-stack web application designed to simplify and organize common Human Resources operations within an organization.

The system provides a centralized platform for managing employee information, maintaining attendance records, handling leave applications, calculating payroll, managing salary components and allowances, and generating salary slip documents.

The application uses React for the user interface, Django REST Framework for backend APIs, MySQL for persistent data storage, and Docker Compose to run the application's services.

The project also implements JWT-based authentication, role-based API permissions, payroll status management, recurring salary components, simulated salary payment processing, CSV reporting, and PDF salary slip generation using ReportLab.

### Project objectives

- Centralize employee information in a structured database.
- Provide an interactive and responsive HR management interface.
- Manage attendance and employee leave requests.
- Calculate payroll using employee salary, attendance, approved leave, and applicable salary components.
- Support salary components such as HRA, travel allowance, and monthly bonus where configured and approved.
- Restrict sensitive HR operations through backend authentication and authorization.
- Generate downloadable salary slips and leave reports.
- Simplify development and application startup using Docker.
- Maintain persistent database records and support database backup and restoration.

## 2. Key Features

### 2.1 Authentication and Authorization

- JWT-based authentication for protected API requests.
- Authenticated user profile retrieval.
- Token-based communication between the frontend and backend.
- Backend permission checks for restricted HR operations.
- Role-based access for authorized administrators, HR users, and employees according to the configured permissions.
- Protection of employee and payroll information through authenticated endpoints.

The frontend sends an access token in the HTTP Authorization header when making protected requests.

```http
Authorization: Bearer <access_token>
```

The backend validates authentication and permissions before allowing protected operations.

### 2.2 Employee Management

The Employee Management module maintains employee information in a centralized database.

**Employee information includes:**

- Employee code.
- Department.
- Designation.
- Joining date.
- Monthly salary.
- Phone number.
- Address.
- Employee identification and database records.

**Implemented functionality:**

- Retrieve and display employee records.
- Add employee information through the management interface, where supported by the configured API.
- Edit employee details.
- Update employee salary.
- Send changes to the backend through API requests.
- Use the employee's saved salary when generating payroll.

The frontend supports a configurable API base URL and uses the Django REST API to retrieve and update employee information.

### 2.3 Attendance Management

The Attendance Management module records and manages employee attendance information.

**Key functionality:**

- Access attendance management through the HRMS dashboard.
- Manage attendance records through the application's attendance interface.
- Retrieve attendance information from the backend.
- Use attendance records as inputs for payroll calculations.
- Consider attendance records with checkout times in the current payroll implementation.

Accurate attendance data is important because missing or incomplete records can affect the calculation of loss-of-pay (LOP) days.

### 2.4 Leave Management

The Leave Management module handles employee leave applications and the HR review process.

**Supported leave categories:**

- Casual Leave.
- Sick Leave.
- Earned Leave.
- Unpaid Leave.

**Leave request statuses:**

- Pending.
- Approved.
- Rejected.

**Implemented functionality:**

- Submit a leave request.
- View personal leave requests.
- Retrieve leave requests for authorized HR users.
- Review pending leave requests.
- Approve or reject a leave request.
- Add a review comment.
- Track the reviewer and review status.
- Validate the leave date range.
- Prevent overlapping pending or approved requests according to backend validation.
- Reject edits to requests that are no longer pending.
- Validate paid leave against the applicable leave balance.
- Maintain leave balance records by employee, leave category, and year.
- Export leave information as a CSV report.

The backend prevents an HR user from approving their own leave request and checks the paid-leave balance before approving applicable paid leave. Unpaid leave does not consume the paid-leave balance.

### 2.5 Payroll Management

The Payroll Management module calculates and tracks employee payroll for completed months.

**Payroll information includes:**

- Employee.
- Payroll year.
- Payroll month.
- Base salary.
- Applicable salary earnings and allowances.
- Applicable salary deductions.
- Gross salary.
- Loss-of-pay days.
- Loss-of-pay deduction.
- Total deductions.
- Net salary.
- Payroll status.
- Salary component calculation snapshot.
- Record creation and update timestamps.
- User who generated the record.

**Payroll statuses:**

| Status | Meaning |
|---|---|
| Draft | Payroll has been generated and can be reviewed. |
| Locked | Payroll has been finalized against further draft recalculation. |
| Paid | Payroll has been marked paid after the payment simulation. |

**Implemented functionality:**

- Generate payroll for a selected employee and completed month.
- Calculate loss-of-pay days using attendance and approved leave data.
- Calculate salary deductions.
- Calculate gross salary and net salary using the configured payroll logic.
- Include applicable salary components when configured and effective for the payroll period.
- Save payroll records in MySQL.
- Prevent duplicate employee-period records through a database uniqueness constraint.
- Recalculate records only while they remain in Draft status and are eligible for recalculation.
- Lock a Draft payroll record.
- Simulate salary payment only for a Locked record.
- Store simulated payment information and a unique payment reference.
- Retrieve payroll records for authorized HR users.
- Retrieve the authenticated employee's payroll history.
- Generate downloadable PDF salary slips.
- Restrict salary slip access to the employee concerned or an authorized administrator/HR user, according to backend permissions.

**Important:** The payment functionality is simulated. It does not transfer money to a bank account or connect to a real banking or payment gateway.

### 2.6 Salary Components and Allowances

The payroll module supports recurring monthly salary components through the `EmployeeSalaryComponent` model.

Salary components allow the organization to configure additional earnings and deductions separately from an employee's base salary.

**Examples of earning components:**

- House Rent Allowance (HRA).
- Travel Allowance.
- Monthly Bonus.
- Other approved recurring earnings.

**Component information includes:**

- Employee reference.
- Component name.
- Component type, such as EARNING or DEDUCTION.
- Amount.
- Active/inactive status.
- Effective-from date.
- Optional effective-to date.

**Implemented functionality:**

- Associate salary components with an employee.
- Store component names, types, amounts, and effective dates.
- Retrieve salary components for payroll administration.
- Support component creation and detail-level updates through the configured salary component APIs.
- Select components applicable to a payroll period according to their active status and effective dates.
- Calculate applicable component amounts, including calendar-day proration for partial-month applicability where implemented.
- Store a snapshot of the salary components used when calculating payroll.
- Include applicable earning and deduction lines in the generated salary slip when those components exist in the saved payroll snapshot.

**Important payroll rule:** Adding or updating an employee's salary components does not automatically rewrite an existing Locked or Paid payroll record. The saved payroll record and its component snapshot are used to preserve the historical payroll calculation.

If a historical payroll record requires correction, it must be handled through an authorized payroll correction or revision process. A salary slip download should not silently recalculate an existing historical payroll record.

### 2.7 Salary Slip PDF Generation

The project uses **ReportLab** to generate PDF salary slips.

The salary slip feature can include:

- Employee identification.
- Payroll period.
- Base salary.
- Applicable earning components, such as HRA and allowances.
- Applicable deduction components.
- Gross salary.
- Loss-of-pay days.
- Loss-of-pay deduction.
- Total deductions.
- Net salary.
- Simulated payment reference and status, when applicable.

Salary slips are generated by the backend and delivered through the salary slip API as downloadable PDF documents.

The backend restricts downloads to eligible payroll statuses and checks whether the requester is authorized to access the record.

The PDF uses the saved payroll record and its salary component snapshot. If a payroll record was generated before the relevant components were configured, the saved snapshot may not contain those components.

### 2.8 CSV Reporting

The Leave Management module provides a CSV report endpoint for authorized HR users.

CSV files can be opened using spreadsheet software for further review, filtering, or reporting.

### 2.9 Dashboard and Module Navigation

The React dashboard integrates the main HRMS management modules.

The dashboard provides navigation to the available employee, attendance, leave, and payroll management interfaces.

Each module communicates with the backend API to read or update the relevant data, subject to the endpoint's authentication and permissions.

### 2.10 Dockerized Application

Docker Compose runs the frontend, backend, and database as separate services.

**Benefits:**

- Consistent development environment.
- Simplified service startup.
- Separation of application components.
- Easier container rebuilding and troubleshooting.
- Persistent MySQL data through configured Docker volumes.
- Reduced need to install backend and frontend dependencies directly on the host computer.

### 2.11 Database Backup

The project supports exporting the configured MySQL database to an SQL dump file.

The dump can be used for database migration, backup, or project submission through an approved channel.

The dump may include employee personal information, salaries, attendance, leave history, and payroll records, so it must be handled securely.

## 3. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React | Component-based user interface |
| Frontend tooling | Vite | Frontend development server and build tooling |
| Styling | Tailwind CSS | Utility-based interface styling |
| Backend language | Python | Backend implementation |
| Web framework | Django | Application framework and database integration |
| API framework | Django REST Framework | REST API endpoints and serializers |
| Authentication | JWT | Token-based API authentication |
| Database | MySQL 8.0 | Persistent application data |
| Containerization | Docker | Containerized services |
| Orchestration | Docker Compose | Service configuration and startup |
| PDF generation | ReportLab | Salary slip PDF documents |
| API testing | Postman or equivalent | API request and response testing |

The frontend communicates with the backend through HTTP APIs. Django processes requests, applies validation and permissions, and interacts with MySQL.

## 4. System Architecture

```text
+-----------------------------------+
|         User / Web Browser        |
+----------------+------------------+
                 |
                 v
+-----------------------------------+
|       React + Vite Frontend       |
|                                   |
| Employee | Attendance | Leave     |
|          | Payroll Dashboard      |
+----------------+------------------+
                 |
                 | HTTP / REST API
                 | JWT Authorization
                 v
+-----------------------------------+
|       Django REST Framework       |
|                                   |
| Accounts and Authentication       |
| Employee Management               |
| Attendance Management             |
| Leave Management and Validation  |
| Payroll Calculation               |
| Salary Components and Allowances  |
| CSV and PDF Reporting             |
+----------------+------------------+
                 |
                 | Django ORM / SQL
                 v
+-----------------------------------+
|            MySQL 8.0              |
|                                   |
| Employee and User Data            |
| Attendance and Leave Records      |
| Payroll and Payment Records       |
| Salary Component Records          |
+-----------------------------------+

       Docker Compose Environment
```

### Request flow

1. The user opens the HRMS frontend in a browser.
2. The frontend sends an API request to Django.
3. The backend validates authentication and permissions.
4. The relevant module processes the request.
5. Django reads or updates MySQL through the ORM.
6. The backend returns a response to the frontend.
7. The frontend displays the result.

For reporting operations, the backend can return generated CSV or PDF files instead of a normal JSON response.

## 5. Project Directory Structure

The following structure reflects the known organization of the project. Keep the actual filenames in your repository consistent with the current implementation.

```text
C:\HRMS-project
|
|-- docker-compose.yml
|-- .env
|-- .gitignore
|-- README.md
|-- hrms_database_dump.sql
|
|-- backend
|   |-- manage.py
|   |
|   |-- config
|   |   |-- settings.py
|   |   |-- urls.py
|   |
|   |-- accounts
|   |
|   |-- employees
|   |
|   |-- attendance
|   |
|   |-- leaves
|   |   |-- models.py
|   |   |-- serializers.py
|   |   |-- views.py
|   |   |-- urls.py
|   |
|   |-- payroll
|       |-- models.py
|       |-- views.py
|       |-- urls.py
|
|-- frontend
    |-- package.json
    |-- src
        |-- App.jsx
        |-- Dashboard.jsx
        |-- EmployeeManagement.jsx
        |-- AttendanceManagement.jsx
        |-- LeaveManagement.jsx
        |-- PayrollManagement.jsx
```

### Backend application responsibilities

- `accounts`: user authentication and account-related functionality.
- `employees`: employee records and salary information.
- `attendance`: employee attendance data.
- `leaves`: leave applications, reviews, balances, and CSV reporting.
- `payroll`: payroll calculation, salary components, status transitions, simulated payments, and PDF salary slips.
- `config`: Django settings and application URL routing.

The structure above is representative. Some frontend components, configuration files, or additional backend files may have different names in the actual repository.

## 6. System Requirements

- Windows 10/11 or another Docker-compatible operating system.
- Docker Desktop.
- Docker Compose.
- A modern web browser.
- Optional: Postman for API testing.
- Git for version control and submission.

The containerized workflow runs Python, Django, and frontend dependencies inside Docker images, so separate host installations may not be necessary.

## 7. Application Configuration

### Local application URLs

| Component | Address |
|---|---|
| React frontend | `http://localhost:5174` |
| Backend API base | `http://localhost:8002/api` |
| Django administration | `http://localhost:8002/admin/` |

These ports correspond to the current project configuration and may differ if Docker Compose is changed.

### Environment variables

The project uses environment configuration for database credentials and application settings.

Typical configuration values include:

- Django secret key.
- Debug setting.
- MySQL database name.
- MySQL username and password.
- MySQL service hostname and port.
- Authentication settings.
- Frontend API base URL.

The frontend employee management module supports `VITE_API_BASE_URL`, defaulting to `http://localhost:8002/api`.

Inside Docker, the backend should normally connect to MySQL using the Compose service name `mysql`, rather than `localhost`.

Never commit real credentials or production secrets. Provide a sanitized `.env.example` containing placeholders when preparing the repository for submission.

## 8. Installation and Setup

### Step 1: Open PowerShell

```powershell
cd C:\HRMS-project
```

### Step 2: Verify Docker

Start Docker Desktop and wait for the engine to become available.

```powershell
docker version
docker compose version
```

### Step 3: Build and start the application

```powershell
docker compose up -d --build
```

### Step 4: Check the containers

```powershell
docker compose ps
```

The expected service names are:

- `frontend`
- `backend`
- `mysql`

The service names shown by `docker compose ps` should match the actual service names defined in `docker-compose.yml`. In the current project, the containers have appeared as `hrms_frontend`, `hrms_backend`, and `hrms_mysql`.

### Step 5: Apply database migrations

```powershell
docker compose exec backend python manage.py migrate
```

### Step 6: Create an administrator if required

```powershell
docker compose exec backend python manage.py createsuperuser
```

Follow the prompts to configure the account. If the project already has a configured administrator, do not create an unnecessary duplicate.

### Step 7: Open the frontend

Visit:

`http://localhost:5174`

Use an account that has been configured for the application's authentication and role-management system.

### Step 8: Open Django administration

Visit:

`http://localhost:8002/admin/`

Sign in using an appropriate Django administrator account.

## 9. Docker Management Commands

### View running services

```powershell
docker compose ps
```

### View backend logs

```powershell
docker compose logs --tail=100 backend
```

### Follow backend logs

```powershell
docker compose logs -f backend
```

### View MySQL logs

```powershell
docker compose logs --tail=100 mysql
```

### Restart services

```powershell
docker compose restart
```

### Rebuild and restart the project

```powershell
docker compose up -d --build
```

### Stop the services

```powershell
docker compose down
```

**Warning:** Do not run `docker compose down -v` unless you intentionally want to remove the Compose volumes and understand the impact on persisted data. Removing volumes can permanently delete the database data stored in them.

## 10. Database Design

The project uses MySQL for persistent storage and Django models for application data management.

### Employee data

Stores employee identity and employment details, including employee code, department, designation, joining date, salary, contact information, and address.

### Attendance data

Stores attendance records used by the attendance module and payroll calculation.

### Leave request data

The `LeaveRequest` model includes fields such as:

- Employee reference.
- Leave type.
- Start and end dates.
- Reason.
- Request status.
- Reviewer.
- Review comment.
- Creation and update timestamps.

### Leave balance data

The `LeaveBalance` model tracks:

- Employee.
- Leave category.
- Year.
- Allocated leave days.
- Used leave days.

A uniqueness constraint prevents duplicate balance records for the same employee, leave type, and year.

### Salary component data

The `EmployeeSalaryComponent` model stores recurring salary components associated with employees.

The component information includes:

- Employee reference.
- Component name.
- Component type, such as EARNING or DEDUCTION.
- Amount.
- Active status.
- Effective-from date.
- Optional effective-to date.

The payroll calculation uses applicable component records for the selected payroll period and saves the calculation details in the payroll record's component snapshot.

The exact database table names are defined by Django's model configuration and migrations.

### Payroll data

The `PayrollRecord` model stores:

- Employee reference.
- Year and month.
- Base salary.
- LOP days.
- LOP deduction.
- Gross salary.
- Total deductions.
- Net salary.
- Salary component snapshot.
- Payroll status.
- User who generated the record.
- Creation and update timestamps.

A uniqueness constraint prevents multiple payroll records for the same employee and payroll period.

### Simulated salary payment data

The `SalaryPayment` model associates a payment record with a payroll record and stores information such as:

- Unique payment reference.
- Payment amount.
- Simulated payment status.
- Payment timestamp.
- User who processed the operation.

The one-to-one relationship prevents multiple payment records from being attached to the same payroll record through this model.

## 11. API Documentation

The backend exposes REST APIs under the `/api/` prefix.

### Authentication

Protected API requests use a JWT access token:

```http
Authorization: Bearer <access_token>
```

### 11.1 Accounts APIs

Base path: `/api/accounts/`

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/accounts/login/` | Authenticate a user |
| GET | `/api/accounts/me/` | Retrieve the current user's profile |
| POST | `/api/accounts/token/refresh/` | Refresh the access token, if configured |

Other authentication endpoints, including registration or logout, should be documented according to the routes actually configured in `accounts/urls.py`.

### 11.2 Employee APIs

Base path: `/api/employees/`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/employees/` | Retrieve employee records, subject to permissions |
| POST | `/api/employees/` | Create an employee if supported by the configured API |
| PATCH/PUT | `/api/employees/<id>/` | Update an employee, subject to permissions |

Confirm the exact HTTP methods, creation routes, and detail routes in the current employee URL configuration.

### 11.3 Attendance APIs

Base path: `/api/attendance/`

The attendance module provides attendance-management functionality. Refer to `backend/attendance/urls.py` for the exact endpoint paths and supported HTTP methods.

### 11.4 Leave APIs

Base path: `/api/leaves/`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/leaves/my/` | View personal leave requests |
| POST | `/api/leaves/my/` | Submit a leave request |
| GET | `/api/leaves/all/` | List leave requests for authorized HR users |
| POST | `/api/leaves/<id>/review/` | Review a pending leave request |
| GET | `/api/leaves/report/csv/` | Export a CSV leave report |

#### Leave request validation

The backend validates the date range, overlapping requests, request status, and the reviewer's permissions.

Paid leave approval requires an applicable leave balance with sufficient available days. Unpaid leave does not require a paid-leave balance.

### 11.5 Payroll APIs

Base path: `/api/payroll/`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/payroll/` | List payroll records for authorized HR users |
| POST | `/api/payroll/generate/` | Generate payroll for an employee and month |
| GET | `/api/payroll/my/` | View the authenticated employee's payroll history |
| POST | `/api/payroll/<id>/lock/` | Lock a Draft payroll record |
| POST | `/api/payroll/<id>/pay/` | Simulate payment for a Locked payroll record |
| GET | `/api/payroll/<id>/salary-slip/` | Download an eligible salary slip PDF |
| GET | `/api/payroll/salary-components/` | List salary components, subject to permissions |
| POST | `/api/payroll/salary-components/` | Create a salary component, subject to permissions |
| GET | `/api/payroll/salary-components/<id>/` | Retrieve a salary component, if supported by the configured detail view |
| PATCH/PUT | `/api/payroll/salary-components/<id>/` | Update a salary component, subject to permissions |

The salary component list endpoint can accept an employee filter, such as:

`/api/payroll/salary-components/?employee_id=<employee_id>`

Confirm supported HTTP methods and permissions in the actual payroll URL configuration and view classes before treating every listed method as available.

#### Example payroll generation request

```json
{
  "employee_id": 1,
  "year": 2026,
  "month": 9
}
```

Use the actual employee database ID. The backend accepts completed payroll months according to its validation rules.

#### Example salary component

An illustrative salary component request may resemble the following. Use the actual employee ID, approved amount, and effective dates.

```json
{
  "employee": 1,
  "name": "HRA",
  "component_type": "EARNING",
  "amount": "10000.00",
  "is_active": true,
  "effective_from": "2026-09-01",
  "effective_to": null
}
```

The exact accepted request fields depend on the serializer. Confirm whether the API expects `employee` or another employee identifier before sending the request.

#### API error handling

API requests may return errors when:

- The access token is missing or invalid.
- The user lacks the required permissions.
- Request data fails validation.
- A payroll record has an incompatible status.
- A requested employee or record does not exist.
- The requested payroll period is not allowed.
- A salary component has invalid dates or amounts.

Clients should handle the HTTP response status and response body rather than assuming every request succeeds.

## 12. Payroll Business Logic

The payroll module calculates employee salary for a selected completed month using the employee's base salary, attendance information, approved leave, applicable loss-of-pay rules, and configured salary components.

### Payroll calculation workflow

1. The authorized user selects an employee and completed month.
2. The backend validates the employee and payroll period.
3. The calculation retrieves the employee's base salary.
4. The calculation examines attendance and approved leave records.
5. Loss-of-pay days and the corresponding deduction are calculated.
6. Applicable earning and deduction components are retrieved using their active status and effective dates.
7. Applicable component amounts are calculated, including partial-month proration where implemented.
8. The calculation determines gross salary, total deductions, and net salary.
9. A Draft payroll record is created or an eligible existing Draft record is recalculated.
10. The salary component calculation details are saved as a snapshot.
11. An authorized HR user reviews and locks the payroll.
12. An authorized HR user can invoke the simulated payment operation.
13. The system stores the simulated payment reference and updates the payroll status.
14. An eligible salary slip can be downloaded.

### Gross salary

The calculation generally follows this relationship when salary components are included:

`Gross Salary = Base Salary + Applicable Earning Components`

### Total deductions

The calculation generally follows this relationship:

`Total Deductions = LOP Deduction + Applicable Deduction Components`

The exact treatment of each component must follow the implemented payroll rules and approved company policy.

### Net salary

The calculation generally follows this relationship:

`Net Salary = Gross Salary - Total Deductions`

The implemented calculation may apply a minimum of zero to the resulting net salary.

### Salary component effective dates

Salary components should be configured with their approved effective dates.

For example, a monthly HRA component with an effective-from date of September 1, 2026, is not applicable to June 2026 merely because it exists today. June payroll should use the components and amounts actually approved and effective for June.

When a component is applicable for only part of a month, the implemented calculation may prorate the amount based on the applicable calendar days. Confirm the configured rules before using the result for actual payroll.

### Payroll safeguards

- Only completed months can be generated.
- Payroll records are unique for an employee and period.
- Only eligible Draft records are recalculated by the generator.
- Only Draft records can be locked through the configured lock operation.
- Simulated payment requires a Locked record.
- Salary slip downloads are restricted by payroll status and access permissions.
- Changing the employee's salary or salary components does not automatically recalculate an existing Locked or Paid payroll record.

Before production use, verify that the backend rejects payroll periods that end before the employee's joining date and test the calculation against known attendance, leave, salary, and component scenarios.

## 13. Salary Slip PDF Generation

The project uses ReportLab to generate salary slips.

### Salary slip generation process

1. The client requests the salary slip endpoint for a payroll record.
2. The backend checks authentication.
3. The backend verifies whether the requester is the employee concerned or an authorized HR user.
4. The backend checks that the payroll status permits a salary slip.
5. ReportLab generates the PDF using the saved payroll data.
6. The PDF is returned as a downloadable response.

### PDF contents

The salary slip can include:

- Employee information.
- Payroll period.
- Base salary.
- Earning components such as HRA, travel allowance, and monthly bonus, when present in the saved snapshot.
- Applicable deduction components.
- Gross salary.
- LOP days.
- LOP deduction.
- Total deductions.
- Net salary.
- Simulated payment reference and status when applicable.

### Downloading a salary slip

The configured route is:

`GET /api/payroll/<payroll_id>/salary-slip/`

For the current local configuration, an example URL is:

`http://localhost:8002/api/payroll/1/salary-slip/`

Replace `1` with the actual payroll record ID.

The endpoint requires a valid JWT access token. Opening the URL directly in a browser without authentication can return `401 Unauthorized`.

In Postman:

1. Run the login request in the authentication folder.
2. Confirm that the login response contains an `access` token.
3. Ensure the collection's Bearer Token authentication uses `{{access_token}}`.
4. Set the request to `GET`.
5. Send the salary slip request.
6. Save the response as a PDF file if the request succeeds and the response is a valid PDF.

The generated document is based on the saved payroll record. A salary change or allowance added after a record has been locked or paid does not automatically alter that historical record.

If an existing payroll snapshot does not contain the required salary components, inspect its status before deciding how to correct it. Do not directly modify a Paid payroll record to force allowance lines into the PDF.

## 14. Leave CSV Reporting

The Leave Management module provides a CSV export endpoint for authorized HR users.

### Reporting workflow

1. An authorized user requests the leave report.
2. The backend checks the user's permissions.
3. The backend retrieves the applicable leave records.
4. The server generates CSV output.
5. The client downloads the report for review.

CSV files can be opened in spreadsheet applications for sorting, filtering, and analysis.

Access to exported reports should be restricted because they may contain personal and employment information.

## 15. Database Backup and Restore

### 15.1 Create the database dump

Run the following command in PowerShell:

```powershell
cd C:\HRMS-project

docker compose exec mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' > .\hrms_database_dump.sql
```

The expected file is:

`C:\HRMS-project\hrms_database_dump.sql`

The command exports the configured MySQL database to a local SQL file.

MySQL may display a warning about using a password on the command line. The warning alone does not mean that the export failed.

### 15.2 Verify the dump

```powershell
Get-Item .\hrms_database_dump.sql | Select-Object Name, Length
```

Inspect the beginning of the file:

```powershell
Get-Content .\hrms_database_dump.sql -TotalCount 20
```

Check that the file exists, has non-zero size, and contains SQL dump content. A stronger verification is to restore it into a separate test database and confirm that the expected tables and records are present.

### 15.3 Restore the dump

**Warning:** Restoring a dump can change existing data. Back up the current database first and verify the intended target database.

For a compatible dump and configured MySQL service:

```powershell
Get-Content .\hrms_database_dump.sql | docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
```

Verify the database name and credentials before restoring. This command should not be used against a database containing important data unless the consequences are understood.

### Backup security

The SQL dump may contain employee names, phone numbers, addresses, salaries, leave records, attendance, and payroll information. Store it securely and share it only through an approved submission channel.

Do not include real employee data in a public repository.

## 16. Testing and Quality Assurance

The application should be verified through functional testing, API testing, permission testing, and database checks.

### Authentication tests

- Valid login.
- Invalid login.
- Missing access token.
- Expired or invalid access token.
- Access to protected endpoints.
- Restricted operations attempted by unauthorized roles.

### Employee tests

- Retrieve employee records.
- Create employee records where supported.
- Update employee details.
- Update salary.
- Verify saved changes after refreshing the application.
- Confirm unauthorized users cannot perform restricted operations.

### Attendance tests

- Create or update attendance using the available interface.
- Verify attendance records are saved.
- Confirm payroll uses the expected attendance records.
- Check the behavior of records without checkout times.

### Leave tests

- Submit a valid leave request.
- Reject an invalid date range.
- Test overlapping requests.
- Approve and reject pending requests.
- Confirm that already reviewed requests cannot be reviewed again.
- Check paid leave balance validation.
- Verify unpaid leave behavior.
- Download and inspect the CSV report.

### Payroll tests

- Generate payroll for a completed month.
- Verify base salary.
- Verify attendance and leave inputs.
- Verify LOP days and deductions.
- Verify applicable earning and deduction components.
- Check salary component effective dates.
- Check partial-month component proration where applicable.
- Verify gross salary, total deductions, and net salary.
- Confirm duplicate employee-period records are not created.
- Verify Draft-to-Locked status transitions.
- Confirm payment simulation cannot run before locking.
- Confirm a simulated payment creates the expected payment record.
- Download and inspect the salary slip.
- Confirm expected salary components appear in the PDF when included in the saved snapshot.
- Confirm employees cannot download other employees' salary slips.
- Verify historical Locked and Paid records are not silently recalculated.

### Postman API tests

The Postman collection can be used to test authentication, employee management, attendance, leave, payroll, salary components, salary slip downloads, and security behavior.

Run login first so the collection can save the access token. Use valid employee and payroll IDs. Review state-changing operations before executing them.

A successful HTTP response alone does not prove that the business logic is correct. Verify the returned values and saved database records.

### Deployment and backup tests

- Build the containers.
- Start all services.
- Restart the application.
- Confirm database records persist.
- Create a SQL dump.
- Test restoration in a separate database.

Only mark a test as passed after executing it and verifying the actual result. Add automated test coverage figures only after measuring the test suite.

## 17. Troubleshooting

### Docker services are not running

```powershell
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 mysql
```

Check Docker Desktop and inspect the logs of the service that failed.

### Frontend cannot connect to the backend

- Verify that the backend is running.
- Confirm that port `8002` is published.
- Check the configured frontend API base URL.
- Inspect browser developer tools.
- Check CORS settings and backend logs.

### API returns 401 Unauthorized

- Log in again to obtain a valid access token.
- Send the token using the Authorization header.
- Check token expiry.
- Verify the backend authentication configuration.
- Confirm that the frontend or Postman collection is sending the expected token.

### API returns 403 Forbidden

The user may be authenticated but lack the required permission. Verify the account role and the endpoint's backend permission class.

### Payroll salary is zero

- Verify the employee's saved salary.
- Check whether the payroll record was generated before the salary was updated.
- Inspect attendance and approved leave data.
- Inspect the payroll status.
- Check whether applicable salary components were configured for that payroll period.
- Inspect the saved salary component snapshot.
- Remember that Locked and Paid records are not automatically recalculated.

### Allowances do not appear on the salary slip

- Confirm that the employee has the required salary component records.
- Verify each component's amount, type, active status, and effective dates.
- Confirm that the component was effective during the requested payroll month.
- Inspect the payroll record's saved `salary_components` snapshot.
- Confirm that the PDF generation code renders the earning and deduction entries from that snapshot.
- Check whether the payroll record is Draft, Locked, or Paid before attempting any correction.

The PDF download endpoint uses the saved payroll data. Adding an allowance today will not automatically insert it into a historical Locked or Paid record.

### Salary slip returns 401 Unauthorized

- Run the login request.
- Confirm that an access token was returned.
- Send the request with `Authorization: Bearer <access_token>`.
- Verify that the token belongs to a user allowed to access the payroll record.

### Database dump is empty or missing

- Confirm that MySQL is running.
- Verify the configured database name and credentials.
- Re-run the export.
- Check the SQL file size and contents.
- Test restoration into a separate database.

## 18. Security and Privacy

The project should follow these security practices:

- Use Django's password hashing and authentication mechanisms.
- Keep secret keys and database credentials out of source control.
- Enforce permissions on backend API endpoints.
- Restrict access to employee and payroll information.
- Do not expose private employee data in screenshots or public repositories.
- Do not commit the local `.env` file.
- Exclude database dumps containing real data from public Git repositories.
- Use HTTPS and production-safe Django settings before public deployment.
- Back up the database and periodically test recovery.
- Do not use production payroll data for experiments.
- Do not represent simulated salary payment as a real bank transaction.
- Validate salary component amounts and effective dates.
- Preserve historical payroll records and their component snapshots.
- Restrict salary component creation and updates to authorized users.
- Protect salary slips and payroll exports from unauthorized access.

Before deployment, review `DEBUG`, allowed hosts, CORS, secret management, database access, and token handling for the intended environment.

## 19. Git and GitHub Submission

Before submitting the project:

1. Verify the application starts successfully.
2. Confirm that employee, attendance, leave, and payroll workflows work.
3. Verify salary component configuration and salary slip generation.
4. Verify the database dump.
5. Include this README.
6. Include a sanitized `.env.example`.
7. Add relevant UI screenshots.
8. Include API documentation or a Postman collection if required.
9. Remove secrets, real credentials, and private employee information.
10. Confirm that the repository contains the required source files.
11. Add the actual GitHub repository URL below.

Example Git commands:

```powershell
cd C:\HRMS-project
git status
git add README.md
git commit -m "docs: update HRMS project documentation"
git push
```

These commands assume that Git is initialized, the repository has a configured remote, and the branch is ready to push. Add other project files only after checking that secrets and private data are excluded.

### Submission deliverables

- Source code repository.
- README documentation.
- Database dump, shared securely if required.
- API collection or API documentation, if requested.
- Screenshots of completed modules.
- Administrator credentials supplied through the reviewer's approved secure channel, if required.
- Setup and execution instructions.

Do not place administrator passwords in the public README.

## 20. Current Limitations

- Salary payment is simulated and does not transfer real funds.
- Payroll generation is limited to completed months.
- Payroll results depend on correct salary, attendance, approved leave, and salary component data.
- Salary components must be configured with the correct approved amounts and effective dates.
- Historical Locked and Paid payroll records are not automatically recalculated after salary or component changes.
- A salary slip uses the saved payroll record and its salary component snapshot.
- Exact account and attendance API routes should be confirmed against the repository's URL configuration.
- Production readiness requires additional security review, automated testing, deployment configuration, and backup verification.

## 21. Future Enhancements

Possible enhancements include:

- Automated email notifications for leave decisions.
- Additional attendance and payroll analytics.
- More detailed audit reporting.
- Automated test suites with measured coverage.
- Continuous integration and deployment.
- Production monitoring and error reporting.
- Additional employee self-service features.
- Payroll correction and revision workflows with authorization and audit trails.
- Configurable salary structures and organization-specific payroll policies.
- Detailed salary-slip templates with company information and itemized earnings and deductions.

These are proposed improvements, not claims that they are already implemented.

## 22. Conclusion

The HRMS project brings employee management, attendance, leave administration, and payroll processing into a single full-stack application.

React provides the user interface, Django REST Framework handles business logic and API requests, MySQL stores persistent records, and Docker Compose simplifies the development environment. JWT authentication and backend permission checks protect restricted operations, while ReportLab and CSV export support document generation and reporting.

The payroll module supports base salary calculations, applicable salary components, allowances, deductions, payroll status management, simulated payment processing, and salary slip generation using saved payroll data.

The project demonstrates full-stack development concepts, REST API integration, relational database management, authentication, business-rule validation, payroll workflows, salary component management, document generation, containerization, and database backup procedures.

## 23. Project Information

**Project Name:** Human Resource Management System (HRMS)

**Project Type:** Full-Stack Web Application

**Frontend:** React, Vite, Tailwind CSS

**Backend:** Django REST Framework

**Database:** MySQL 8.0

**Deployment Environment:** Docker Compose

**PDF Generation:** ReportLab

**API Testing:** Postman

**Author:** Ramkumar S.

---

**Important implementation note:** This README describes the intended and known project behavior. Confirm each endpoint, permission, UI feature, and calculation against the current repository and actual test results before presenting it as verified functionality. Use only approved salary component amounts and effective dates for real payroll calculations.