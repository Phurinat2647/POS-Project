/**
 * สร้างข้อความสำหรับ QR PromptPay (มาตรฐาน EMVCo / Thai QR Payment)
 * id: เบอร์มือถือ 10 หลัก, เลขประจำตัว 13 หลัก หรือ e-Wallet 15 หลัก
 * amount: ยอดเงิน (บาท) — ถ้าไม่ระบุ ลูกค้ากรอกยอดเอง
 * คืน null ถ้า id ไม่ถูกต้อง
 */
const field = (tag, value) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) */
export function crc16(text) {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function promptPayPayload(id, amount) {
  const digits = String(id || '').replace(/\D/g, '');
  let account;
  if (digits.length === 10 && digits.startsWith('0')) account = field('01', `0066${digits.slice(1)}`);
  else if (digits.length === 13) account = field('02', digits);
  else if (digits.length === 15) account = field('03', digits);
  else return null;

  const hasAmount = Number(amount) > 0;
  const payload =
    field('00', '01') +
    field('01', hasAmount ? '12' : '11') +
    field('29', field('00', 'A000000677010111') + account) +
    field('58', 'TH') +
    field('53', '764') +
    (hasAmount ? field('54', Number(amount).toFixed(2)) : '') +
    '6304';
  return payload + crc16(payload);
}
