'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function HrDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [batchSummary, setBatchSummary] = useState<any>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');

  // Modal States
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);

  // Status & Message
  const [saving, setSaving] = useState(false);
  const [modalMsg, setModalMsg] = useState({ type: '', text: '' });

  // Payroll Batch Form
  const [payrollPeriodName, setPayrollPeriodName] = useState('งวดประจำเดือน มีนาคม 2026');

  // Edit Form State
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    position: '',
    department_id: '',
    emp_type: 'FULL_TIME',
    status: 'ACTIVE',
    base_salary: 0,
    bank_name: '',
    bank_account_no: '',
    hire_date: '',
    is_hr_admin: false,
  });

  // Add Form State
  const initialNewEmpState = {
    employee_code: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    position: '',
    department_id: '',
    emp_type: 'FULL_TIME',
    status: 'ACTIVE',
    base_salary: 25000,
    bank_name: 'กสิกรไทย',
    bank_account_no: '',
    hire_date: new Date().toISOString().split('T')[0],
    is_hr_admin: false,
  };
  const [newEmpData, setNewEmpData] = useState(initialNewEmpState);

  useEffect(() => {
    fetchHrData();
  }, []);

  const fetchHrData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: currentEmp } = await supabase
        .from('employees')
        .select('is_hr_admin')
        .eq('user_id', user.id)
        .single();

      if (!currentEmp?.is_hr_admin) {
        alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
        router.push('/dashboard/employee');
        return;
      }

      const { data: depts } = await supabase.from('departments').select('*').order('name');
      setDepartments(depts || []);

      const { data: empList, error: empErr } = await supabase
        .from('employees')
        .select('*, departments(name, code)')
        .order('employee_code', { ascending: true });

      if (empErr) throw empErr;
      setEmployees(empList || []);

      const { data: batch } = await supabase
        .from('payroll_batches')
        .select('*, payroll_periods(period_name)')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      setBatchSummary(batch);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Filtered Employees List (Search & Department)
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchSearch =
        emp.employee_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.position?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchDept =
        selectedDeptFilter === 'ALL' || emp.department_id === selectedDeptFilter;

      return matchSearch && matchDept;
    });
  }, [employees, searchQuery, selectedDeptFilter]);

  // ===================== RUN PAYROLL BATCH CALCULATION =====================
  const handleRunPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalMsg({ type: '', text: '' });

    try {
      // 1. กรองเฉพาะพนักงานสถานะ ACTIVE
      const activeEmps = employees.filter((e) => e.status === 'ACTIVE');
      if (activeEmps.length === 0) {
        throw new Error('ไม่พบพนักงานที่มีสถานะ ACTIVE สำหรับคำนวณเงินเดือน');
      }

const todayStr = new Date().toISOString().split('T')[0];

      // 2. สร้าง Payroll Period ใหม่ พร้อมระบุ pay_date
      const { data: period, error: periodErr } = await supabase
        .from('payroll_periods')
        .insert({
          period_name: payrollPeriodName,
          start_date: todayStr,
          end_date: todayStr,
          pay_date: todayStr, // เพิ่มฟิลด์นี้เพื่อแก้ Not-Null Constraint
        })
        .select()
        .single();

      if (periodErr) throw periodErr;

      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;

      // 3. คำนวณเงินเดือนตามสูตรจริง
      const recordsToInsert = activeEmps.map((emp) => {
        const salary = Number(emp.base_salary) || 0;

        // สปส. 5% ฐานคำนวณสูงสุด 15,000 บาท (เพดาน 750 บาท)
        const ssoBase = Math.min(Math.max(salary, 1650), 15000);
        const sso = Math.round(ssoBase * 0.05);

        // ภาษีหัก ณ ที่จ่ายแบบขั้นบันไดประมาณการ
        let tax = 0;
        if (salary > 50000) {
          tax = Math.round(salary * 0.07);
        } else if (salary > 30000) {
          tax = Math.round(salary * 0.03);
        }

        const net = salary - sso - tax;

        totalGross += salary;
        totalDeductions += sso + tax;
        totalNet += net;

        return {
          employee_id: emp.id,
          gross_pay: salary,
          net_pay: net,
          sso_deduction: sso,
          tax_deduction: tax,
          status: 'PAID',
        };
      });

      // 4. บันทึก Payroll Batch
      const { data: batch, error: batchErr } = await supabase
        .from('payroll_batches')
        .insert({
          period_id: period.id,
          total_gross: totalGross,
          total_deductions: totalDeductions,
          total_net: totalNet,
          status: 'COMPLETED',
        })
        .select()
        .single();

      if (batchErr) throw batchErr;

      // 5. บันทึกรายละเอียดลง payroll_records
      const detailedRecords = recordsToInsert.map((r) => ({
        ...r,
        batch_id: batch.id,
      }));

      const { error: recErr } = await supabase
        .from('payroll_records')
        .insert(detailedRecords);

      if (recErr) throw recErr;

      alert(`ประมวลผลเงินเดือนรอบ "${payrollPeriodName}" สำหรับพนักงาน ${activeEmps.length} คน เรียบร้อยแล้ว!`);
      setIsPayrollModalOpen(false);
      fetchHrData();
    } catch (err: any) {
      setModalMsg({ type: 'error', text: err.message || 'การคำนวณเงินเดือนล้มเหลว' });
    } finally {
      setSaving(false);
    }
  };

  // ===================== EDIT EMPLOYEE =====================
  const openEditModal = (emp: any) => {
    setSelectedEmp(emp);
    setFormData({
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      position: emp.position || '',
      department_id: emp.department_id || '',
      emp_type: emp.emp_type || 'FULL_TIME',
      status: emp.status || 'ACTIVE',
      base_salary: Number(emp.base_salary) || 0,
      bank_name: emp.bank_name || '',
      bank_account_no: emp.bank_account_no || '',
      hire_date: emp.hire_date || '',
      is_hr_admin: emp.is_hr_admin || false,
    });
    setModalMsg({ type: '', text: '' });
    setIsEditModalOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('employees')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          position: formData.position,
          department_id: formData.department_id,
          emp_type: formData.emp_type,
          status: formData.status,
          base_salary: Number(formData.base_salary),
          bank_name: formData.bank_name,
          bank_account_no: formData.bank_account_no,
          hire_date: formData.hire_date,
          is_hr_admin: formData.is_hr_admin,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedEmp.id);

      if (error) throw error;
      setModalMsg({ type: 'success', text: 'บันทึกข้อมูลเรียบร้อยแล้ว!' });
      fetchHrData();
    } catch (err: any) {
      setModalMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkResigned = async () => {
    if (!selectedEmp) return;
    if (!window.confirm(`ยืนยันการเปลี่ยนสถานะเป็นลาออก (RESIGNED)?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('employees')
        .update({ status: 'RESIGNED', updated_at: new Date().toISOString() })
        .eq('id', selectedEmp.id);
      if (error) throw error;
      setFormData((prev) => ({ ...prev, status: 'RESIGNED' }));
      setModalMsg({ type: 'success', text: 'เปลี่ยนสถานะเป็นลาออกเรียบร้อยแล้ว' });
      fetchHrData();
    } catch (err: any) {
      setModalMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEmp) return;
    const confirmInput = window.prompt(`พิมพ์รหัส "${selectedEmp.employee_code}" เพื่อยืนยันการลบถาวร:`);
    if (confirmInput !== selectedEmp.employee_code) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('employees').delete().eq('id', selectedEmp.id);
      if (error) throw error;
      alert(`ลบพนักงานสำเร็จ`);
      setIsEditModalOpen(false);
      fetchHrData();
    } catch (err: any) {
      setModalMsg({ type: 'error', text: 'ไม่สามารถลบได้เนื่องจากมีประวัติสลิปเงินเดือน' });
      setSaving(false);
    }
  };

  // ===================== CREATE EMPLOYEE =====================
  const openAddModal = () => {
    const nextNum = employees.length + 1;
    const autoCode = `EMP${String(nextNum).padStart(3, '0')}`;
    setNewEmpData({
      ...initialNewEmpState,
      employee_code: autoCode,
      department_id: departments[0]?.id || '',
    });
    setModalMsg({ type: '', text: '' });
    setIsAddModalOpen(true);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalMsg({ type: '', text: '' });

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newEmpData.email,
        password: newEmpData.password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('ไม่สามารถสร้างบัญชีผู้ใช้ได้');

      const { error: insertError } = await supabase.from('employees').insert({
        user_id: authData.user.id,
        employee_code: newEmpData.employee_code,
        first_name: newEmpData.first_name,
        last_name: newEmpData.last_name,
        email: newEmpData.email,
        position: newEmpData.position,
        department_id: newEmpData.department_id,
        emp_type: newEmpData.emp_type,
        status: newEmpData.status,
        base_salary: Number(newEmpData.base_salary),
        bank_name: newEmpData.bank_name,
        bank_account_no: newEmpData.bank_account_no,
        hire_date: newEmpData.hire_date,
        is_hr_admin: newEmpData.is_hr_admin,
      });

      if (insertError) throw insertError;

      alert(`เพิ่มพนักงาน ${newEmpData.first_name} เรียบร้อยแล้ว!`);
      setIsAddModalOpen(false);
      fetchHrData();
    } catch (err: any) {
      setModalMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">กำลังโหลดข้อมูล HR...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ระบบบริหารจัดการเงินเดือน (HR Portal)</h1>
          <p className="text-xs text-slate-500">จัดการข้อมูลพนักงานและการประมวลผลเงินเดือน</p>
        </div>
        <div className="flex items-center gap-3">
          {/* ปุ่มคำนวณเงินเดือนประจำงวด */}
          <button
            onClick={() => {
              setModalMsg({ type: '', text: '' });
              setIsPayrollModalOpen(true);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span>คำนวณเงินเดือนประจำงวด</span>
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500">จำนวนพนักงานทั้งหมด</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{employees.length} คน</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500">งบประมาณเงินเดือนรวม (Gross)</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              ฿{Number(batchSummary?.total_gross || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500">ยอดหักรวม (ภาษี/ประกันสังคม)</div>
            <div className="text-2xl font-bold text-rose-600 mt-1">
              ฿{Number(batchSummary?.total_deductions || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500">ยอดจ่ายสุทธิรอบล่าสุด (Net)</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">
              ฿{Number(batchSummary?.total_net || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex-1 w-full md:w-auto flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="ค้นหาด้วยรหัส, ชื่อ-นามสกุล, หรือตำแหน่ง..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 pl-9 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
            </div>
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="ALL">ทุกแผนก (All Departments)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={openAddModal}
            className="w-full md:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5"
          >
            <span>+</span>
            <span>เพิ่มพนักงานใหม่</span>
          </button>
        </div>

        {/* Employee Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800 text-sm">
              รายชื่อพนักงาน ({filteredEmployees.length} จาก {employees.length} รายการ)
            </h2>
            <span className="text-xs text-slate-400">💡 คลิกชื่อพนักงานเพื่อเปิดดูรายละเอียดและแก้ไข</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3">รหัส</th>
                  <th className="p-3">ชื่อ-นามสกุล</th>
                  <th className="p-3">ตำแหน่ง</th>
                  <th className="p-3">แผนก</th>
                  <th className="p-3 text-center">ประเภท</th>
                  <th className="p-3 text-center">สถานะ</th>
                  <th className="p-3 text-right">เงินเดือนฐาน</th>
                  <th className="p-3 text-center">สิทธิ์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-400">
                      ไม่พบข้อมูลพนักงานที่ตรงกับเงื่อนไขการค้นหา
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="p-3 font-medium text-slate-900">{emp.employee_code}</td>
                      <td className="p-3">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="font-semibold text-blue-600 hover:text-blue-800 hover:underline text-left inline-flex items-center gap-1.5"
                        >
                          {emp.first_name} {emp.last_name}
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">ดู/แก้ไข</span>
                        </button>
                      </td>
                      <td className="p-3 text-slate-700">{emp.position}</td>
                      <td className="p-3 text-slate-600">{emp.departments?.name}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700">
                          {emp.emp_type}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            emp.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700'
                              : emp.status === 'RESIGNED'
                              ? 'bg-slate-200 text-slate-600'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {emp.status}
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium text-slate-800">
                        ฿{Number(emp.base_salary).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-center">
                        {emp.is_hr_admin ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 font-semibold">
                            HR Admin
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ===================== MODAL: RUN PAYROLL BATCH ===================== */}
      {isPayrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">ประมวลผลการจ่ายเงินเดือนประจำงวด (Run Payroll)</h3>
              <p className="text-xs text-slate-500 mt-0.5">ระบบจะคำนวณฐานเงินเดือน หัก ปกส. สูงสุด 750 บาท และภาษีอัตโนมัติ</p>
            </div>

            {modalMsg.text && (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-xs">{modalMsg.text}</div>
            )}

            <form onSubmit={handleRunPayroll} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">ชื่องวดการจ่ายเงินเดือน *</label>
                <input
                  type="text"
                  required
                  value={payrollPeriodName}
                  onChange={(e) => setPayrollPeriodName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-xs"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5 text-slate-600">
                <div className="font-semibold text-slate-800">เกณฑ์การคำนวณเงินเดือน:</div>
                <div>• พนักงานที่จะได้รับเงินเดือน: <strong>{employees.filter((e) => e.status === 'ACTIVE').length} คน (สถานะ ACTIVE)</strong></div>
                <div>• ประกันสังคม: <strong>หัก 5% ของเงินเดือนฐาน (เพดานไม่เกิน 750 บาท)</strong></div>
                <div>• ภาษีหัก ณ ที่จ่าย: <strong>คำนวณตามขั้นบันไดอัตโนมัติ</strong></div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPayrollModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {saving ? 'กำลังประมวลผล...' : 'ยืนยันและประมวลผลทันที'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: EDIT EMPLOYEE ===================== */}
      {isEditModalOpen && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col my-auto">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {formData.first_name} {formData.last_name} ({selectedEmp.employee_code})
                </h3>
                <p className="text-xs text-slate-500">อีเมลล็อกอิน: {selectedEmp.email}</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {modalMsg.text && (
                <div className={`p-3 rounded-lg text-xs font-medium ${modalMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {modalMsg.text}
                </div>
              )}

              <form id="editEmpForm" onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">ชื่อ</label>
                    <input type="text" required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">นามสกุล</label>
                    <input type="text" required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">ตำแหน่ง</label>
                    <input type="text" required value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">แผนก</label>
                    <select value={formData.department_id} onChange={(e) => setFormData({ ...formData, department_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs">
                      {departments.map((d) => (<option key={d.id} value={d.id}>{d.name} ({d.code})</option>))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">ประเภทการจ้างงาน</label>
                    <select value={formData.emp_type} onChange={(e) => setFormData({ ...formData, emp_type: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs">
                      <option value="FULL_TIME">FULL_TIME (พนักงานประจำ)</option>
                      <option value="CONTRACT">CONTRACT (สัญญาจ้าง)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">สถานะการทำงาน</label>
                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs">
                      <option value="ACTIVE">ACTIVE (ปฏิบัติงาน)</option>
                      <option value="PROBATION">PROBATION (ทดลองงาน)</option>
                      <option value="RESIGNED">RESIGNED (ลาออก)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">เงินเดือนฐาน (บาท)</label>
                    <input type="number" step="0.01" required value={formData.base_salary} onChange={(e) => setFormData({ ...formData, base_salary: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-xs font-semibold" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">ธนาคาร</label>
                    <input type="text" value={formData.bank_name} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">เลขบัญชี</label>
                    <input type="text" value={formData.bank_account_no} onChange={(e) => setFormData({ ...formData, bank_account_no: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs" />
                  </div>
                </div>
              </form>

              <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                <div>
                  {formData.status !== 'RESIGNED' && (
                    <button type="button" disabled={saving} onClick={handleMarkResigned} className="text-amber-600 hover:text-amber-800 text-xs font-medium underline">
                      ทำเรื่องแจ้งลาออก (Mark Resigned)
                    </button>
                  )}
                </div>
                <button type="button" disabled={saving} onClick={handleDelete} className="text-rose-600 hover:text-rose-800 text-xs font-medium hover:underline">
                  ลบพนักงานออกจากระบบ
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium">ปิด</button>
              <button type="submit" form="editEmpForm" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50">บันทึกการแก้ไข</button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: CREATE EMPLOYEE ===================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col my-auto">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-50/50 rounded-t-2xl">
              <h3 className="text-lg font-bold text-slate-900">เพิ่มพนักงานใหม่เข้าระบบ</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {modalMsg.text && <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-xs">{modalMsg.text}</div>}
              <form id="addEmpForm" onSubmit={handleCreateEmployee} className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">อีเมลล็อกอิน *</label>
                    <input type="email" required placeholder="emp031@company.com" value={newEmpData.email} onChange={(e) => setNewEmpData({ ...newEmpData, email: e.target.value })} className="w-full px-3 py-2 bg-white border rounded-lg text-xs" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">รหัสผ่านเริ่มต้น *</label>
                    <input type="password" required placeholder="อย่างน้อย 6 ตัวอักษร" value={newEmpData.password} onChange={(e) => setNewEmpData({ ...newEmpData, password: e.target.value })} className="w-full px-3 py-2 bg-white border rounded-lg text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">รหัสพนักงาน *</label>
                    <input type="text" required value={newEmpData.employee_code} onChange={(e) => setNewEmpData({ ...newEmpData, employee_code: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs font-semibold" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">ชื่อ *</label>
                    <input type="text" required value={newEmpData.first_name} onChange={(e) => setNewEmpData({ ...newEmpData, first_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">นามสกุล *</label>
                    <input type="text" required value={newEmpData.last_name} onChange={(e) => setNewEmpData({ ...newEmpData, last_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">ตำแหน่ง *</label>
                    <input type="text" required value={newEmpData.position} onChange={(e) => setNewEmpData({ ...newEmpData, position: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">แผนก *</label>
                    <select value={newEmpData.department_id} onChange={(e) => setNewEmpData({ ...newEmpData, department_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-xs">
                      {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">เงินเดือนฐาน (บาท) *</label>
                    <input type="number" required value={newEmpData.base_salary} onChange={(e) => setNewEmpData({ ...newEmpData, base_salary: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-xs font-semibold" />
                  </div>
                </div>
              </form>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium">ยกเลิก</button>
              <button type="submit" form="addEmpForm" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50">สร้างพนักงาน</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}