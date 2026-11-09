import api from './api';

/** { shopName, shopAddress, shopPhone, taxId, promptpayId, receiptFooter } */
export const getSettings = async () => (await api.get('/settings')).data.data;

export const updateSettings = async (payload) => (await api.put('/settings', payload)).data;
