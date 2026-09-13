'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function HrDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [batchSummary, setBatchSummary] = useState<any>(null);

  // State สำหรับ Modal แก้ไขข้อมูลพนักงาน
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalMsg, setModalMsg] = useState({ type: '', text: '' });

  // Form State ภายใน Modal
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

      // เช็คสิทธิ์ HR Admin
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

      // 1. ดึงข้อมูลแผนก
      const { data: depts } = await supabase.from('departments').select('*').order('name');
      setDepartments(depts || []);

      // 2. ดึงรายการพนักงานทั้งหมด
      const { data: empList, error: empErr } = await supabase
        .from('employees')
        .select('*, departments(name, code)')
        .order('employee_code', { ascending: true });

      if (empErr) throw empErr;
      setEmployees(empList || []);

      // 3. ดึงยอดสรุป Payroll Batch
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

  // เปิด Modal และโหลดข้อมูลคนนั้นเข้า Form
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
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedEmp(null);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // บันทึกการแก้ไข
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;

    setSaving(true);
    setModalMsg({ type: '', text: '' });

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
      // โหลดข้อมูลในตารางใหม่
      fetchHrData();
    } catch (err: any) {
      setModalMsg({ type: 'error', text: err.message || 'เกิดข้อผิดพลาดในการบันทึก' });
    } finally {
      setSaving(false);
    }
  };

  // ทำเรื่องลาออก
  const handleMarkResigned = async () => {
    if (!selectedEmp) return;
    const ok = window.confirm(`ยืนยันการเปลี่ยนสถานะของ ${selectedEmp.first_name} เป็น "ลาออก (RESIGNED)" หรือไม่?`);
    if (!ok) return;

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

  // ลบพนักงานถาวร
  const handleDelete = async () => {
    if (!selectedEmp) return;
    const confirmInput = window.prompt(
      `⚠️ การลบจะทำลายข้อมูลถาวร!\nพิมพ์รหัส "${selectedEmp.employee_code}" เพื่อยืนยันการลบ:`
    );

    if (confirmInput !== selectedEmp.employee_code) {
      if (confirmInput !== null) alert('รหัสไม่ตรงกัน ยกเลิกการลบ');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('employees').delete().eq('id', selectedEmp.id);
      if (error) throw error;

      alert(`ลบพนักงาน ${selectedEmp.employee_code} สำเร็จ`);
      closeModal();
      fetchHrData();
    } catch (err: any) {
      setModalMsg({
        type: 'error',
        text: 'ไม่สามารถลบได้เนื่องจากมีข้อมูลประวัติเงินเดือนเชื่อมโยงอยู่ แนะนำให้เปลี่ยนสถานะเป็น RESIGNED แทน',
      });
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
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
        >
          ออกจากระบบ
        </button>
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

        {/* ตารางพนักงาน */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-slate-800 text-sm">รายชื่อพนักงานทั้งหมด ({employees.length} รายการ)</h2>
              <p className="text-xs text-slate-400">💡 คลิกที่ชื่อพนักงานเพื่อเปิดดูรายละเอียดและแก้ไขข้อมูล</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3">รหัส</th>
                  <th className="p-3">ชื่อ-นามสกุล (คลิกเพื่อแก้ไข)</th>
                  <th className="p-3">ตำแหน่ง</th>
                  <th className="p-3">แผนก</th>
                  <th className="p-3 text-center">ประเภท</th>
                  <th className="p-3 text-center">สถานะ</th>
                  <th className="p-3 text-right">เงินเดือนฐาน</th>
                  <th className="p-3 text-center">สิทธิ์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
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
                            : emp.status === 'PROBATION'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL กล่องเด้งดูรายละเอียดและแก้ไขข้อมูลพนักงาน */}
      {isModalOpen && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {formData.first_name} {formData.last_name} ({selectedEmp.employee_code})
                </h3>
                <p className="text-xs text-slate-500">อีเมลล็อกอิน: {selectedEmp.email}</p>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {modalMsg.text && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium ${
                    modalMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {modalMsg.text}
                </div>
              )}

              <form id="editEmpForm" onSubmit={handleUpdate} className="space-y-4">
                {/* ข้อมูลพื้นฐาน */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">ชื่อ</label>
                    <input
                      type="text"
                      required
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">นามสกุล</label>
                    <input
                      type="text"
                      required
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs"
                    />
                  </div>
                </div>

                {/* ตำแหน่งและแผนก */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">ตำแหน่ง</label>
                    <input
                      type="text"
                      required
                      name="position"
                      value={formData.position}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">แผนก</label>
                    <select
                      name="department_id"
                      value={formData.department_id}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* สถานะและประเภทงาน */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">ประเภทการจ้างงาน</label>
                    <select
                      name="emp_type"
                      value={formData.emp_type}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs"
                    >
                      <option value="FULL_TIME">FULL_TIME (พนักงานประจำ)</option>
                      <option value="CONTRACT">CONTRACT (สัญญาจ้าง)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">สถานะการทำงาน</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs"
                    >
                      <option value="ACTIVE">ACTIVE (ปฏิบัติงาน)</option>
                      <option value="PROBATION">PROBATION (ทดลองงาน)</option>
                      <option value="RESIGNED">RESIGNED (ลาออก)</option>
                      <option value="TERMINATED">TERMINATED (เลิกจ้าง)</option>
                    </select>
                  </div>
                </div>

                {/* เงินเดือนและบัญชี */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">เงินเดือนฐาน (บาท)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      name="base_salary"
                      value={formData.base_salary}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">ธนาคาร</label>
                    <input
                      type="text"
                      name="bank_name"
                      value={formData.bank_name}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">เลขบัญชี</label>
                    <input
                      type="text"
                      name="bank_account_no"
                      value={formData.bank_account_no}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs"
                    />
                  </div>
                </div>

                {/* สิทธิ์ HR Admin */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <input
                    type="checkbox"
                    id="modal_is_hr"
                    name="is_hr_admin"
                    checked={formData.is_hr_admin}
                    onChange={handleFormChange}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <label htmlFor="modal_is_hr" className="text-slate-700 font-medium">
                    ให้สิทธิ์ HR Admin (สามารถเข้าถึงแผงควบคุมนี้ได้)
                  </label>
                </div>
              </form>

              {/* การจัดการสถานะขั้นสูง (Resign / Delete) */}
              <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                <div>
                  {formData.status !== 'RESIGNED' && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleMarkResigned}
                      className="text-amber-600 hover:text-amber-800 text-xs font-medium underline"
                    >
                      ทำเรื่องแจ้งลาออก (Mark Resigned)
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDelete}
                  className="text-rose-600 hover:text-rose-800 text-xs font-medium hover:underline"
                >
                  ลบพนักงานออกจากระบบ
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium transition"
              >
                ปิดหน้าต่าง
              </button>
              <button
                type="submit"
                form="editEmpForm"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}