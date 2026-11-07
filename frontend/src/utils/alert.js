import Swal from 'sweetalert2';

const PRIMARY = '#166534';
const DANGER = '#dc2626';

/** ยืนยันก่อนลบ — คืน true ถ้าผู้ใช้กดยืนยัน */
export async function confirmDelete(title, text) {
  const { isConfirmed } = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: DANGER,
    reverseButtons: true,
    focusCancel: true,
  });
  return isConfirmed;
}

export function toastSuccess(title) {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title,
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true,
  });
}

export function showError(text, title = 'ไม่สำเร็จ') {
  return Swal.fire({ icon: 'error', title, text, confirmButtonColor: PRIMARY, confirmButtonText: 'ตกลง' });
}
