'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function EmployeeDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

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

      // 1. ดึงข้อมูลพนักงาน
      const { data: emp, error: empErr } = await supabase
        .from('employees')
        .select('*, departments(name, code)')
        .eq('user_id', user.id)
        .single();

      if (empErr) throw empErr;
      setEmployee(emp);

      // 2. ดึงประวัติเงินเดือนย้อนหลังทั้งหมดของพนักงานคนนี้
      if (emp) {
        const { data: recordsData, error: recErr } = await supabase
          .from('payroll_records')
          .select('*, payroll_batches(batch_name, payroll_periods(period_name, pay_date))')
          .eq('employee_id', emp.id)
          .order('created_at', { ascending: false });

        if (recErr) throw recErr;

        setRecords(recordsData || []);
        // ตั้งค่างวดล่าสุดเป็นสลิปเริ่มต้นที่จะแสดงผล
        if (recordsData && recordsData.length > 0) {
          setSelectedRecord(recordsData[0]);
        }
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
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        กำลังโหลดข้อมูลพนักงาน...
      </div>
    );
  }

  // คำนวณยอดรายการของสลิปที่เลือก
  const grossPay = Number(selectedRecord?.gross_pay || employee?.base_salary || 0);
  const baseSalary = Number(selectedRecord?.base_salary || employee?.base_salary || 0);
  const allowance = Number(selectedRecord?.total_allowance || 0);
  const ssoDeduction = Number(selectedRecord?.sso_amount || 750);
  const taxDeduction = Number(selectedRecord?.tax_amount || 0);
  const totalDeductions = Number(selectedRecord?.total_deduction || (ssoDeduction + taxDeduction));
  const netPay = Number(selectedRecord?.net_pay || (grossPay - totalDeductions));
  const periodName =
    selectedRecord?.payroll_batches?.payroll_periods?.period_name ||
    'งวดประจำเดือนล่าสุด';
  const payDate = selectedRecord?.payroll_batches?.payroll_periods?.pay_date;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      {/* Top Navbar (ซ่อนตอนพิมพ์) */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center print:hidden sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ระบบบริการพนักงาน (Employee Portal)</h1>
          <p className="text-xs text-slate-500">ตรวจสอบประวัติและพิมพ์ใบแจ้งยอดเงินเดือน</p>
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
        {/* ==================== 1. ใบแจ้งยอดเงินเดือน (PAYSLIP) ==================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-none print:p-0">
          {/* Slip Header */}
          <div className="border-b border-slate-200 pb-6 mb-6 flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">ใบแจ้งยอดเงินเดือน (PAYSLIP)</h2>
              <p className="text-sm font-semibold text-blue-600 mt-1">{periodName}</p>
            </div>
            <div className="text-right text-xs text-slate-500 space-y-1">
              <div className="font-bold text-slate-900 text-sm">COMPANY SYSTEM CO., LTD.</div>
              <div>
                วันที่จ่าย: {payDate ? new Date(payDate).toLocaleDateString('th-TH') : new Date().toLocaleDateString('th-TH')}
              </div>
              <div>
                สถานะ:{' '}
                <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  จ่ายแล้ว (PAID)
                </span>
              </div>
            </div>
          </div>

          {/* ข้อมูลพนักงาน */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl text-xs mb-6 border border-slate-100">
            <div>
              <span className="text-slate-400 block mb-0.5">รหัสพนักงาน</span>
              <span className="font-bold text-slate-900">{employee?.employee_code}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">ชื่อ-นามสกุล</span>
              <span className="font-bold text-slate-900">
                {employee?.first_name} {employee?.last_name}
              </span>
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

          {/* ตารางแสดงรายการได้และรายการหัก */}
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
                    ฿{baseSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">ค่าครองชีพ / เงินเพิ่มพิเศษ</span>
                  <span className="font-medium text-slate-900">
                    ฿{allowance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between font-bold text-slate-900">
                  <span>รวมเงินได้ (Gross Pay)</span>
                  <span className="text-blue-600">
                    ฿{grossPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
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
                  <span className="text-slate-600">กองทุนประกันสังคม (SSO)</span>
                  <span className="font-medium text-rose-600">
                    ฿{ssoDeduction.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">ภาษีหัก ณ ที่จ่าย (Withholding Tax)</span>
                  <span className="font-medium text-rose-600">
                    ฿{taxDeduction.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between font-bold text-slate-900">
                  <span>รวมรายการหัก (Total Deductions)</span>
                  <span className="text-rose-600">
                    ฿{totalDeductions.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* แถบสรุปเงินได้สุทธิ (Net Payment) */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex justify-between items-center">
            <div>
              <span className="text-xs text-emerald-800 font-semibold uppercase tracking-wider block">
                เงินได้สุทธิ (Net Payment)
              </span>
              <span className="text-xs text-emerald-600">
                โอนเข้าบัญชี {employee?.bank_name} เลขที่ {employee?.bank_account_no || 'xxx-x-xxxxx-x'}
              </span>
            </div>
            <div className="text-3xl font-bold text-emerald-700">
              ฿{netPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* ==================== 2. ตารางประวัติการรับเงินเดือนย้อนหลัง (ซ่อนตอนกดพิมพ์) ==================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">ประวัติการจ่ายเงินเดือนย้อนหลัง</h3>
              <p className="text-xs text-slate-500">คลิก "ดูสลิป" ในงวดที่ต้องการ เพื่อแสดงและสั่งพิมพ์รายละเอียดด้านบน</p>
            </div>
            <span className="text-xs bg-slate-200 text-slate-700 font-semibold px-2.5 py-1 rounded-full">
              ทั้งหมด {records.length} งวด
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3">รอบประจำเดือน</th>
                  <th className="p-3">วันที่จ่าย</th>
                  <th className="p-3 text-right">เงินได้รวม (Gross)</th>
                  <th className="p-3 text-right">หัก ปกส. (SSO)</th>
                  <th className="p-3 text-right">หักภาษี (Tax)</th>
                  <th className="p-3 text-right">รับสุทธิ (Net)</th>
                  <th className="p-3 text-center">สลิป</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      ยังไม่พบประวัติการจ่ายเงินเดือนในระบบ
                    </td>
                  </tr>
                ) : (
                  records.map((rec) => {
                    const isSelected = selectedRecord?.id === rec.id;
                    const rPeriod = rec.payroll_batches?.payroll_periods;

                    return (
                      <tr
                        key={rec.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-blue-50/70 font-semibold' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-3 text-slate-900">
                          {rPeriod?.period_name || 'งวดเงินเดือน'}
                          {isSelected && (
                            <span className="ml-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">
                              กำลังดู
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-500">
                          {rPeriod?.pay_date
                            ? new Date(rPeriod.pay_date).toLocaleDateString('th-TH')
                            : '-'}
                        </td>
                        <td className="p-3 text-right text-slate-800">
                          ฿{Number(rec.gross_pay).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right text-rose-600">
                          -฿{Number(rec.sso_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right text-rose-600">
                          -฿{Number(rec.tax_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-600">
                          ฿{Number(rec.net_pay).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => setSelectedRecord(rec)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            ดูสลิป
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}