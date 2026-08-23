/** Sürücü ve yolcu telefon numaraları arayüzde tam gösterilmez; yalnızca ülke kodu ve son iki rakam kalır. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 7) return '••• ••• •••';
  const head = digits.slice(0, digits.length - 8);
  const tail = digits.slice(-2);
  return `+${head} ••• ••• ••${tail}`;
}
