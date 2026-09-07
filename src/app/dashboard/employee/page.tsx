'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function EmployeeDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<any>(null);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [selectedSlip, setSelectedSlip] = useState<any>(null);
  const [slipDetails, setSlipDetails] = useState<any[]>([]);

  useEffect(() => {
    fetchEmployeeData();
  }, []);

  const fetchEmployeeData = async () => {
    try {
      setLoading(true);
      // 1. ตรวจสอบ User ที่ล็อกอินอยู่
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // 2. ดึงข้อมูล Profile พนักงาน
      const { data: emp, error: empErr } = await supabase
        .from('employees')
        .select('*, departments(name)')
        .eq('user_id', user.id)
        .single();

      if (empErr) throw empErr;
      setEmployee(emp);

      // 3. ดึงรายการสลิปเงินเดือนของตัวเอง
      const { data: records, error: recErr } = await supabase
        .from('payroll_records')
        .select(`
          *,
          payroll_batches (
            batch_name,
            payroll_periods (period_name, pay_date)
          )
        `)
        .eq('employee_id', emp.id)
        .order('created_at', { ascending: false });

      if (recErr) throw recErr;
      setPayslips(records || []);

      // ถ้ามีสลิป ให้เปิดดูอันล่าสุดอัตโนมัติ
      if (records && records.length > 0) {
        viewSlipDetail(records[0]);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const viewSlipDetail = async (slip: any) => {
    setSelectedSlip(slip);
    // ดึงรายการแจกแจงย่อยในสลิป
    const { data: details } = await supabase
      .from('payroll_record_details')
      .select('*')
      .eq('record_id', slip.id);

    setSlipDetails(details || []);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">กำลังโหลดข้อมูล...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ระบบพนักงาน (Employee Portal)</h1>
          <p className="text-sm text-slate-500">
            {employee?.first_name} {employee?.last_name} ({employee?.employee_code}) | {employee?.position}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
        >
          ออกจากระบบ
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* รายการงวดเงินเดือน */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="font-semibold text-base mb-4 text-slate-800">ประวัติสลิปเงินเดือน</h2>
          <div className="space-y-2">
            {payslips.map((slip) => (
              <button
                key={slip.id}
                onClick={() => viewSlipDetail(slip)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  selectedSlip?.id === slip.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-100 hover:bg-slate-50'
                }`}
              >
                <div className="font-medium text-sm text-slate-900">
                  {slip.payroll_batches?.payroll_periods?.period_name || 'รอบเงินเดือน'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  จ่ายวันที่: {slip.payroll_batches?.payroll_periods?.pay_date || '-'}
                </div>
                <div className="text-sm font-semibold text-emerald-600 mt-1">
                  ฿{Number(slip.net_pay).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ใบแจ้งยอดสลิปเงินเดือน (Payslip View) */}
        <div className="md:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm print:p-0 print:border-none">
          {selectedSlip ? (
            <div>
              <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">ใบแจ้งยอดเงินเดือน (PAYSLIP)</h3>
                  <p className="text-xs text-slate-500">
                    รอบ: {selectedSlip.payroll_batches?.payroll_periods?.period_name}
                  </p>
                </div>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded font-medium transition print:hidden"
                >
                  พิมพ์สลิป (Print)
                </button>
              </div>

              {/* ข้อมูลพนักงานในสลิป */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3 rounded-lg mb-4">
                <div><span className="text-slate-500">ชื่อพนักงาน:</span> {employee?.first_name} {employee?.last_name}</div>
                <div><span className="text-slate-500">รหัสพนักงาน:</span> {employee?.employee_code}</div>
                <div><span className="text-slate-500">แผนก:</span> {employee?.departments?.name}</div>
                <div><span className="text-slate-500">ตำแหน่ง:</span> {employee?.position}</div>
                <div><span className="text-slate-500">ธนาคาร:</span> {employee?.bank_name}</div>
                <div><span className="text-slate-500">เลขที่บัญชี:</span> {employee?.bank_account_no}</div>
              </div>

              {/* ตารางแจกแจง รายได้ - รายการหัก */}
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <tr>
                      <th className="py-2 px-3 text-left">รายการ</th>
                      <th className="py-2 px-3 text-center">ประเภท</th>
                      <th className="py-2 px-3 text-right">จำนวนเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {slipDetails.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3">{item.item_name}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            item.item_type === 'ALLOWANCE' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                          }`}>
                            {item.item_type === 'ALLOWANCE' ? 'เงินได้' : 'รายการหัก'}
                          </span>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-medium ${
                          item.item_type === 'ALLOWANCE' ? 'text-slate-800' : 'text-rose-600'
                        }`}>
                          {item.item_type === 'DEDUCTION' ? '-' : ''}
                          {Number(item.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* สรุปยอดรวม */}
              <div className="bg-slate-50 p-4 rounded-lg space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">รายได้รวม (Gross Pay)</span>
                  <span className="font-semibold">฿{Number(selectedSlip.gross_pay).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>รายการหักรวม (Deductions, Tax, SSO)</span>
                  <span className="font-semibold">-฿{Number(selectedSlip.total_deduction).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                  <span>เงินได้สุทธิ (Net Pay)</span>
                  <span className="text-emerald-600">฿{Number(selectedSlip.net_pay).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 text-sm">ไม่พบข้อมูลสลิปเงินเดือน</div>
          )}
        </div>
      </main>
    </div>
  );
}