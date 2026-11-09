import api from './api';

/** หมวดหมู่ + เมนู + ตัวเลือก (sizes/toppings) สำหรับหน้าขาย */
export const getPosCatalog = async () => (await api.get('/pos/catalog')).data.data;
