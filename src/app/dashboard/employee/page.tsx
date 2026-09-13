'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function EmployeeDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<any>(null);
  const [latestRecord, setLatestRecord] = useState<any>(null);

  useEffect(() => {
    fetchEmployeeData();
  }, []);

  const fetchEmployeeData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // ดึงข้อมูลโปรไฟล์พนักงาน
      const { data: emp, error: empErr } = await supabase
        .from('employees')
        .select('*, departments(name, code)')
        .eq('user_id', user.id)
        .single();

      if (empErr) throw empErr;
      setEmployee(emp);

      // ดึงประวัติสลิปเงินเดือนรอบล่าสุด
      if (emp) {
        const { data: record } = await supabase
          .from('payroll_records')
          .select('*, payroll_batches(payroll_periods(period_name))')
          .eq('employee_id', emp.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        setLatestRecord(record);
      }
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

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">กำลังโหลดข้อมูลพนักงาน...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Navbar (ซ่อนตอนกด Print) */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ระบบบริการพนักงาน (Employee Portal)</h1>
          <p className="text-xs text-slate-500">ตรวจสอบและพิมพ์สลิปเงินเดือนประจำงวด</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5"
          >
            <span>🖨️</span>
            <span>พิมพ์สลิปเงินเดือน (PDF)</span>
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* สลิปเงินเดือน (รองรับการพิมพ์ Print Friendly) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-none print:p-0">
          {/* Slip Header */}
          <div className="border-b border-slate-200 pb-6 mb-6 flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">ใบแจ้งยอดเงินเดือน (PAYSLIP)</h2>
              <p className="text-sm font-medium text-blue-600 mt-1">
                {latestRecord?.payroll_batches?.payroll_periods?.period_name || 'งวดประจำเดือน มีนาคม 2026'}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500 space-y-1">
              <div className="font-bold text-slate-900 text-sm">COMPANY SYSTEM CO., LTD.</div>
              <div>วันที่ออกเอกสาร: {new Date().toLocaleDateString('th-TH')}</div>
              <div>สถานะ: <span className="text-emerald-600 font-bold">จ่ายเรียบร้อย (PAID)</span></div>
            </div>
          </div>

          {/* Employee Information */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl text-xs mb-6 border border-slate-100">
            <div>
              <span className="text-slate-400 block mb-0.5">รหัสพนักงาน</span>
              <span className="font-bold text-slate-900">{employee?.employee_code}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">ชื่อ-นามสกุล</span>
              <span className="font-bold text-slate-900">{employee?.first_name} {employee?.last_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">ตำแหน่ง</span>
              <span className="font-bold text-slate-900">{employee?.position}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">สังกัดแผนก</span>
              <span className="font-bold text-slate-900">{employee?.departments?.name}</span>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs mb-8">
            {/* รายได้ (Earnings) */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100/70 px-4 py-2.5 font-bold text-slate-800 border-b border-slate-200 flex justify-between">
                <span>รายการได้ (Earnings)</span>
                <span>จำนวนเงิน (บาท)</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">เงินเดือนฐาน (Base Salary)</span>
                  <span className="font-medium text-slate-900">
                    ฿{Number(latestRecord?.gross_pay || employee?.base_salary || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">ค่าครองชีพ / เบี้ยเลี้ยง</span>
                  <span className="font-medium text-slate-900">฿0.00</span>
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between font-bold text-slate-900">
                  <span>รวมเงินได้ (Total Earnings)</span>
                  <span className="text-blue-600">
                    ฿{Number(latestRecord?.gross_pay || employee?.base_salary || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* รายการหัก (Deductions) */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100/70 px-4 py-2.5 font-bold text-slate-800 border-b border-slate-200 flex justify-between">
                <span>รายการหัก (Deductions)</span>
                <span>จำนวนเงิน (บาท)</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">กองทุนประกันสังคม (SSO 5%)</span>
                  <span className="font-medium text-rose-600">
                    ฿{Number(latestRecord?.sso_deduction || 750).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">ภาษีเงินได้หัก ณ ที่จ่าย (WHT)</span>
                  <span className="font-medium text-rose-600">
                    ฿{Number(latestRecord?.tax_deduction || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between font-bold text-slate-900">
                  <span>รวมรายการหัก (Total Deductions)</span>
                  <span className="text-rose-600">
                    ฿{(Number(latestRecord?.sso_deduction || 750) + Number(latestRecord?.tax_deduction || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Payment Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex justify-between items-center">
            <div>
              <span className="text-xs text-emerald-800 font-semibold uppercase tracking-wider block">เงินได้สุทธิ (Net Payment)</span>
              <span className="text-xs text-emerald-600">โอนเข้าบัญชี {employee?.bank_name} เลขที่ {employee?.bank_account_no || 'xxx-x-xxxxx-x'}</span>
            </div>
            <div className="text-3xl font-bold text-emerald-700">
              ฿{Number(latestRecord?.net_pay || ((employee?.base_salary || 0) - 750)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}