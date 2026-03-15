// Indian currency formatting utilities

export function formatINR(amount) {
  if (!amount && amount !== 0) return '₹0';

  const num = Number(amount);

  // For very large amounts, use abbreviated format
  if (num >= 10000000) { // 1 crore
    return `₹${(num / 10000000).toFixed(2)}Cr`;
  } else if (num >= 100000) { // 1 lakh
    return `₹${(num / 100000).toFixed(2)}L`;
  } else {
    // Use Indian number formatting for smaller amounts
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(num);
  }
}

export function formatINRFull(amount) {
  if (!amount && amount !== 0) return '₹0';

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(amount));
}

export function formatINRShort(amount) {
  if (!amount && amount !== 0) return '₹0';

  const num = Number(amount);

  if (num >= 10000000) {
    return `₹${(num / 10000000).toFixed(1)}Cr`;
  } else if (num >= 100000) {
    return `₹${(num / 100000).toFixed(1)}L`;
  } else if (num >= 1000) {
    return `₹${(num / 1000).toFixed(1)}K`;
  } else {
    return `₹${num.toFixed(0)}`;
  }
}