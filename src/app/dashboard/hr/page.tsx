'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function HrDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [batchSummary, setBatchSummary] = useState<any>(null);

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

      // ดึงรายการพนักงานทั้ง 30 คน
      const { data: empList, error: empErr } = await supabase
        .from('employees')
        .select('*, departments(name)')
        .order('employee_code', { ascending: true });

      if (empErr) throw empErr;
      setEmployees(empList || []);

      // ดึงข้อมูลสรุปยอด Payroll Batch ล่าสุด
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
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ระบบบริหารจัดการเงินเดือน (HR Portal)</h1>
          <p className="text-sm text-slate-500">ภาพรวมพนักงานและการจ่ายเงินเดือนทั้งองค์กร</p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
        >
          ออกจากระบบ
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* KPI Cards สรุปยอดการจ่าย */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs text-slate-500">จำนวนพนักงานทั้งหมด</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{employees.length} คน</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs text-slate-500">งบประมาณเงินเดือนรวม (Gross)</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              ฿{Number(batchSummary?.total_gross || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs text-slate-500">ยอดหักรวม (ภาษี/ประกันสังคม)</div>
            <div className="text-2xl font-bold text-rose-600 mt-1">
              ฿{Number(batchSummary?.total_deductions || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs text-slate-500">ยอดจ่ายสุทธิรอบล่าสุด (Net)</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">
              ฿{Number(batchSummary?.total_net || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* ตารางพนักงาน 30 คน */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 font-semibold text-slate-800">
            รายชื่อพนักงานทั้งหมด ({employees.length} รายการ)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="p-3">รหัส</th>
                  <th className="p-3">ชื่อ-นามสกุล</th>
                  <th className="p-3">ตำแหน่ง</th>
                  <th className="p-3">แผนก</th>
                  <th className="p-3">ประเภท</th>
                  <th className="p-3 text-right">เงินเดือนฐาน</th>
                  <th className="p-3 text-center">สิทธิ์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-slate-900">{emp.employee_code}</td>
                    <td className="p-3">{emp.first_name} {emp.last_name}</td>
                    <td className="p-3">{emp.position}</td>
                    <td className="p-3">{emp.departments?.name}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700">
                        {emp.emp_type}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium">
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
    </div>
  );
}