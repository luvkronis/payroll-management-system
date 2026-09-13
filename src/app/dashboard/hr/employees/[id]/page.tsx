'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const employeeId = resolvedParams.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    employee_code: '',
    first_name: '',
    last_name: '',
    email: '',
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
    fetchData();
  }, [employeeId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. ตรวจสอบสิทธิ์ HR Admin ก่อนเข้าถึง
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: currentUser } = await supabase
        .from('employees')
        .select('is_hr_admin')
        .eq('user_id', user.id)
        .single();

      if (!currentUser?.is_hr_admin) {
        alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
        router.push('/dashboard/employee');
        return;
      }

      // 2. ดึงรายชื่อแผนกทั้งหมด
      const { data: depts } = await supabase.from('departments').select('*').order('name');
      setDepartments(depts || []);

      // 3. ดึงข้อมูลพนักงานคนปัจจุบัน
      const { data: emp, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', employeeId)
        .single();

      if (error) throw error;

      if (emp) {
        setFormData({
          employee_code: emp.employee_code || '',
          first_name: emp.first_name || '',
          last_name: emp.last_name || '',
          email: emp.email || '',
          position: emp.position || '',
          department_id: emp.department_id || '',
          emp_type: emp.emp_type || 'FULL_TIME',
          status: emp.status || 'ACTIVE',
          base_salary: emp.base_salary || 0,
          bank_name: emp.bank_name || '',
          bank_account_no: emp.bank_account_no || '',
          hire_date: emp.hire_date || '',
          is_hr_admin: emp.is_hr_admin || false,
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // 1. ฟังก์ชันบันทึกการแก้ไขข้อมูลทั่วไป
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

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
        .eq('id', employeeId);

      if (error) throw error;
      setSuccessMsg('บันทึกข้อมูลพนักงานเรียบร้อยแล้ว');
    } catch (err: any) {
      setErrorMsg(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  // 2. ฟังก์ชันปรับสถานะเป็นลาออก (Mark as Resigned)
  const handleMarkResigned = async () => {
    const confirmed = window.confirm(
      `คุณต้องการปรับสถานะของ ${formData.first_name} ${formData.last_name} เป็น "ลาออก (RESIGNED)" ใช่หรือไม่?`
    );
    if (!confirmed) return;

    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const { error } = await supabase
        .from('employees')
        .update({
          status: 'RESIGNED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', employeeId);

      if (error) throw error;

      setFormData((prev) => ({ ...prev, status: 'RESIGNED' }));
      setSuccessMsg('เปลี่ยนสถานะพนักงานเป็น "ลาออก (RESIGNED)" เรียบร้อยแล้ว');
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ');
    } finally {
      setSaving(false);
    }
  };

  // 3. ฟังก์ชันลบพนักงานออกจากระบบถาวร (Delete)
  const handleDeleteEmployee = async () => {
    const promptValue = window.prompt(
      `⚠️ คำเตือน: การลบจะทำให้ข้อมูลหายไปถาวร\nพิมพ์รหัสพนักงาน "${formData.employee_code}" เพื่อยืนยันการลบ:`
    );

    if (promptValue !== formData.employee_code) {
      if (promptValue !== null) {
        alert('รหัสพนักงานไม่ตรงกัน ยกเลิกการลบ');
      }
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', employeeId);

      if (error) throw error;

      alert(`ลบพนักงานรหัส ${formData.employee_code} เรียบร้อยแล้ว`);
      router.push('/dashboard/hr');
    } catch (err: any) {
      setErrorMsg(
        err.message || 'ไม่สามารถลบได้ เนื่องจากพนักงานมีประวัติการทำรายการในระบบเงินเดือน'
      );
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">กำลังโหลดข้อมูล...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Navigation / Top Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.push('/dashboard/hr')}
              className="text-sm text-blue-600 hover:underline mb-1 inline-flex items-center gap-1"
            >
              &larr; กลับหน้ารวมพนักงาน
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {formData.first_name} {formData.last_name} ({formData.employee_code})
              </h1>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  formData.status === 'ACTIVE'
                    ? 'bg-emerald-100 text-emerald-700'
                    : formData.status === 'RESIGNED'
                    ? 'bg-slate-200 text-slate-600'
                    : formData.status === 'PROBATION'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {formData.status}
              </span>
            </div>
          </div>

          {/* Quick Action Button: Mark Resigned */}
          {formData.status !== 'RESIGNED' && (
            <button
              type="button"
              disabled={saving}
              onClick={handleMarkResigned}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition shadow-sm disabled:opacity-50"
            >
              ทำเรื่องลาออก (Mark Resigned)
            </button>
          )}
        </div>

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">
            {successMsg}
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* 1. ข้อมูลส่วนบุคคล */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              1. ข้อมูลส่วนบุคคลและบัญชีผู้ใช้
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">รหัสพนักงาน</label>
                <input
                  type="text"
                  disabled
                  value={formData.employee_code}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">อีเมลบริษัท (บัญชีล็อกอิน)</label>
                <input
                  type="text"
                  disabled
                  value={formData.email}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">ชื่อ</label>
                <input
                  type="text"
                  required
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">นามสกุล</label>
                <input
                  type="text"
                  required
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 2. ตำแหน่งและสังกัดการทำงาน */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              2. ตำแหน่งและสังกัดการทำงาน
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">ตำแหน่งงาน</label>
                <input
                  type="text"
                  required
                  name="position"
                  value={formData.position}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">แผนก</label>
                <select
                  name="department_id"
                  value={formData.department_id}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">ประเภทการจ้างงาน</label>
                <select
                  name="emp_type"
                  value={formData.emp_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="FULL_TIME">พนักงานประจำ (Full-Time)</option>
                  <option value="CONTRACT">พนักงานสัญญาจ้าง (Contract)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">สถานะการทำงาน</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ACTIVE">ปฏิบัติงานปกติ (Active)</option>
                  <option value="PROBATION">ทดลองงาน (Probation)</option>
                  <option value="RESIGNED">ลาออก (Resigned)</option>
                  <option value="TERMINATED">เลิกจ้าง (Terminated)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">วันที่เริ่มงาน</label>
                <input
                  type="date"
                  name="hire_date"
                  value={formData.hire_date}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 3. ข้อมูลการเงินและธนาคาร */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              3. ข้อมูลบัญชีธนาคารและเงินเดือน
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">เงินเดือนฐาน (Base Salary)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  name="base_salary"
                  value={formData.base_salary}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">ธนาคาร</label>
                <input
                  type="text"
                  name="bank_name"
                  value={formData.bank_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">เลขที่บัญชี</label>
                <input
                  type="text"
                  name="bank_account_no"
                  value={formData.bank_account_no}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 4. สิทธิ์ในระบบ */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="is_hr_admin"
                name="is_hr_admin"
                checked={formData.is_hr_admin}
                onChange={handleChange}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <label htmlFor="is_hr_admin" className="text-sm font-medium text-slate-800 cursor-pointer">
                กำหนดสิทธิ์ HR Admin (สามารถเข้าถึงแผงควบคุมและจัดการระบบเงินเดือนได้)
              </label>
            </div>
          </div>

          {/* ปุ่มบันทึกการแก้ไข */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard/hr')}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
            </button>
          </div>
        </form>

        {/* Danger Zone: โซนอันตรายสำหรับการลบพนักงาน */}
        <div className="mt-10 border border-rose-200 bg-rose-50/50 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-rose-800">Danger Zone (การลบข้อมูลพนักงาน)</h3>
              <p className="text-xs text-rose-600 mt-0.5">
                การลบพนักงานจะลบข้อมูลออกจากระบบอย่างถาวร หากพนักงานเคยมีการประมวลผลสลิปเงินเดือนแล้ว แนะนำให้ใช้การเปลี่ยนสถานะเป็น "ลาออก (RESIGNED)" แทน
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={handleDeleteEmployee}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap transition disabled:opacity-50"
            >
              ลบพนักงานออกจากระบบ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}