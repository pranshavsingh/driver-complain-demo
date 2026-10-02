

## 1. Access Matrix by Role & Category

| Category / Role | Allowed Pages | Complaints Queue Scope | Notes / Actions Allowed |
| :--- | :--- | :--- | :--- |
| **SUPER_ADMIN** | **All Pages**: Dashboard, Vehicles, Users & Approvals, Complaints, Loading & Detention, Trip Analytics, Vehicle Maintenance, Spare Parts, Support Chat, Vehicle Reports, Settings | All categories (unrestricted) | Full system administration and user/category management |
| **BREAKDOWN** | • Dashboard (`/dashboard`)<br>• Vehicles (`/vehicles`)<br>• Drivers & Approvals (`/users`)<br>• Complaints (`/complaints`, `/complaints/:id`) | Only `BREAKDOWN` complaints | Can view vehicles, approve drivers, and triage breakdown issues |
| **FUEL_DEF** | • Dashboard (`/dashboard`)<br>• Vehicles (`/vehicles`)<br>• Drivers & Approvals (`/users`)<br>• Vehicle Maintenance (`/maintenance?tab=fuel`)<br>• Complaints (`/complaints`) | Only `FUEL_DEF` complaints | Focus on fuel/DEF logs, fuel receipts, and related complaints |
| **TYRE_ISSUE** | • Dashboard (`/dashboard`)<br>• Vehicles (`/vehicles`)<br>• Drivers & Approvals (`/users`)<br>• Vehicle Maintenance (`/maintenance?tab=tyres`)<br>• Complaints (`/complaints`) | Only `TYRE_ISSUE` complaints | Focus on tyre replacement records, serial numbers, and tyre complaints |
| **SPARE_PARTS** | • Dashboard (`/dashboard`)<br>• Vehicles (`/vehicles`)<br>• Drivers & Approvals (`/users`)<br>• Spare Parts (`/spare-parts`)<br>| Relevant maintenance| Manages inventory requisition, part issuance, and driver exchange |
| **LOADING & UNLOADING** | • Dashboard (`/dashboard`)<br>• Vehicles (`/vehicles`)<br>• Drivers & Approvals (`/users`)<br> Loading & Detention (`/loading`)<br>• Trip Analytics & Logs (`/trips`)<br>•  || Tracks loading points, unloading arrival, detention duration, and trip phases |
| **ACCOUNTS** | • Dashboard (`/dashboard`)<br>• Complaints (`/complaints`) <br/>• Vehicles (`/vehicles`)<br>• Drivers & Approvals (`/users`)<br> Drivers & Approvals (`/users`)<br> | Only `ACCOUNTS` complaints | Financial reports, Excel exports, billing / penalty disputes |
