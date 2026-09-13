# 🏢 Enterprise Payroll Management System (ระบบบริหารจัดการเงินเดือน)

ระบบบริหารจัดการเงินเดือนและพนักงานองค์กรแบบคลาวด์ พัฒนาขึ้นเพื่อตอบสนองการคำนวณเงินเดือนอัตโนมัติตามข้อกำหนดทางกฎหมายแรงงานไทย การบริหารจัดการข้อมูลบุคลากร และระบบบริการตนเองของพนักงาน (Employee Self-Service)

🌐 **Live Production URL:** [https://luvkronis.github.io/payroll-management-system/](https://luvkronis.github.io/payroll-management-system/)

---

## 📌 บทสรุปภาพรวมโครงการ (Executive Summary)

โครงการนี้ถูกพัฒนาขึ้นเพื่อแก้ไขปัญหาความซ้ำซ้อนและความผิดพลาดในการคำนวณภาษีและกองทุนประกันสังคมในองค์กร โดยแบ่งการทำงานออกเป็น 2 มุมมองหลัก:
1. **HR Management Portal:** แผงควบคุมสำหรับฝ่ายบุคคล บริหารจัดการสถานะพนักงาน (Active/Probation/Resigned) คำนวณเงินเดือนประจำงวดแบบอัตโนมัติ (Batch Processing) และมอนิเตอร์ภาพรวมค่าใช้จ่ายองค์กร
2. **Employee Self-Service Portal:** หน้าต่างบริการตนเองของพนักงาน ตรวจสอบประวัติการรับเงินเดือนย้อนหลัง และออกใบแจ้งยอดเงินเดือน (Payslip) ในรูปแบบที่พร้อมสั่งพิมพ์ (Print-friendly PDF)

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack & Architecture)

- **Frontend Framework:** Next.js (App Router, Static HTML Export)
- **Styling:** Tailwind CSS (Modern Card/Modal Design, Responsive, Print Media Queries)
- **Backend & Database:** Supabase (PostgreSQL 15 + GoTrue Authentication)
- **Deployment & CI/CD:** GitHub Pages ผ่าน GitHub Actions CI/CD Pipeline
- **Language:** TypeScript

[ Next.js Client (Static SPA on GitHub Pages) ]
│
▼  (HTTPS / Supabase Client SDK)
[ Supabase Authentication & PostgreSQL Relational Database ]
├── auth.users (User Credentials)
├── public.departments
├── public.employees
├── public.payroll_periods
├── public.payroll_batches
└── public.payroll_records

---

## 🗄️ โครงสร้างฐานข้อมูล (Database Schema & Relationships)

ฐานข้อมูลได้รับการออกแบบตามมาตรฐาน Relational Database (3NF) เพื่อความถูกต้องของข้อมูล (Data Integrity):

### 1. `departments` (แผนกในองค์กร)
- `id` (UUID, Primary Key)
- `name` (TEXT)
- `code` (VARCHAR)

### 2. `employees` (ข้อมูลพนักงาน)
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key -> `auth.users.id`)
- `employee_code` (VARCHAR, Unique เช่น EMP001)
- `first_name`, `last_name` (TEXT)
- `email` (TEXT)
- `position` (TEXT)
- `department_id` (UUID, Foreign Key -> `departments.id`)
- `emp_type` (ENUM: `FULL_TIME`, `CONTRACT`)
- `status` (ENUM: `ACTIVE`, `PROBATION`, `RESIGNED`, `TERMINATED`)
- `base_salary` (NUMERIC)
- `bank_name`, `bank_account_no` (TEXT)
- `hire_date` (DATE)
- `is_hr_admin` (BOOLEAN)

### 3. `payroll_periods` (รอบบัญชีเงินเดือน)
- `id` (UUID, Primary Key)
- `period_name` (TEXT เช่น "งวดประจำเดือน มีนาคม 2026")
- `start_date`, `end_date`, `pay_date` (DATE, NOT NULL)

### 4. `payroll_batches` (ชุดข้อมูลการจ่ายเงินเดือนประจำงวด)
- `id` (UUID, Primary Key)
- `period_id` (UUID, Foreign Key -> `payroll_periods.id`)
- `batch_name` (TEXT, NOT NULL)
- `total_gross`, `total_deductions`, `total_net` (NUMERIC, NOT NULL)
- `status` (ENUM: `PAID`, `CLOSED`, `DRAFT`)

### 5. `payroll_records` (สลิปเงินเดือนรายบุคคล)
- `id` (UUID, Primary Key)
- `batch_id` (UUID, Foreign Key -> `payroll_batches.id`)
- `employee_id` (UUID, Foreign Key -> `employees.id`)
- `base_salary`, `gross_pay`, `net_pay` (NUMERIC, NOT NULL)
- `total_allowance`, `total_deduction` (NUMERIC, NOT NULL)
- `sso_amount` (NUMERIC, ประกันสังคม)
- `tax_amount` (NUMERIC, ภาษีหัก ณ ที่จ่าย)
- `is_locked` (BOOLEAN, ป้องกันการแก้ไขย้อนหลัง)

---

## 🧮 ตรรกะการคำนวณเงินเดือน (Business Logic Specification)

ระบบประมวลผลเงินเดือนถูกพัฒนาตามข้อกำหนดของกฎหมายภาษีและประกันสังคมของไทย:

1. **คัดกรองสถานะพนักงาน:** 
   ระบบคำนวณเฉพาะพนักงานที่มีสถานะ `ACTIVE` และเริ่มงานก่อนหรือภายในงวดบัญชีนั้น (`hire_date <= end_date`)
2. **กองทุนประกันสังคม (Social Security Fund - SSO):**
   - อัตราหัก: 5% ของฐานเงินเดือน
   - ฐานคำนวณ: ต่ำสุด 1,650 บาท และสูงสุดไม่เกิน 15,000 บาท
   - **เพดานหักสูงสุด:** ไม่เกิน 750 บาท/เดือน
   - สูตร: `ROUND(LEAST(GREATEST(base_salary, 1650), 15000) * 0.05)`
3. **ภาษีเงินได้บุคคลธรรมดาหัก ณ ที่จ่าย (Withholding Tax):**
   - ฐานเงินเดือนไม่เกิน 30,000 บาท: อัตราภาษี 0% (ยกเว้นภาษี)
   - ฐานเงินเดือน 30,001 – 50,000 บาท: อัตราภาษีประมาณการ 3%
   - ฐานเงินเดือนมากกว่า 50,000 บาท: อัตราภาษีประมาณการ 7%
4. **เงินได้สุทธิ (Net Payable Salary):**
   - `Net Salary = Base Salary + Allowances - SSO - Tax`

---

## 💻 หลักการออกแบบเชิงวัตถุและวิศวกรรมซอฟต์แวร์ (Software Engineering Principles)

- **Single Responsibility Principle (SRP):** แยกชั้นการทำงานชัดเจนระหว่างหน้าจอแสดงผล (Presentation Layer: UI/Modals), ระบบตรวจสอบสิทธิ์ (Auth Layer), และโมดูลตรรกะการคำนวณเงินเดือน (Calculation Engine)
- **Encapsulation:** ควบคุมการเข้าถึงและการกลั่นกรองข้อมูลของพนักงานผ่าน State Management ภายใน Component ป้องกันการรั่วไหลของข้อมูลข้าม Role
- **Data Integrity & Immutability:** สลิปเงินเดือนที่ถูกประมวลผลแล้วจะมีสถานะ `is_locked: true` และถูกบันทึกแบบ Transactional เพื่อเก็บเป็นหลักฐานการเงินย้อนหลัง ไม่สามารถถูกเขียนทับได้

---

## 🔑 ข้อมูลบัญชีสำหรับทดสอบระบบ (Test Credentials)

ระบบมีข้อมูลพนักงานจำลอง 30 ท่าน พร้อมประวัติเงินเดือนย้อนหลังครบ 9 งวด (มกราคม - กันยายน 2026):

| บทบาท (Role) | อีเมล (Email) | รหัสผ่าน (Password) | สิทธิ์และความสามารถ |
| :--- | :--- | :--- | :--- |
| **HR Admin** | `emp001@company.com` | `Password123!` | เข้าหน้า `/dashboard/hr` ได้, ค้นหา/กรองพนักงาน, ดู/แก้ไขเงินเดือน, ทำเรื่องพนักงานลาออก (Resign), เพิ่มพนักงานใหม่เข้าระบบ, สั่งคำนวณเงินเดือนประจำงวด (Run Payroll Batch) |
| **General Employee** | `emp005@company.com` | `Password123!` | เข้าหน้า `/dashboard/employee` ได้, ดูสลิปเงินเดือนตนเอง, ดูประวัติเงินเดือนย้อนหลัง 9 งวด, สั่งพิมพ์สลิปเงินเดือน (PDF Slip) |
| **General Employee** | `emp012@company.com` | `Password123!` | บัญชีพนักงานประจำทั่วไปสำหรับทดสอบการเข้าถึงสิทธิบริการตนเอง |

---

## 🚀 ขั้นตอนการติดตั้งและรันในเครื่อง (Local Setup)

```bash
# 1. Clone Repository
git clone [https://github.com/luvkronis/payroll-management-system.git](https://github.com/luvkronis/payroll-management-system.git)
cd payroll-management-system

# 2. ติดตั้ง Dependencies
npm install

# 3. กำหนดค่า Environment Variables (.env.local)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# 4. รันในโหมด Development
npm run dev

# 5. ทดสอบสร้าง Production Static Build
npm run build