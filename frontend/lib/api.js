const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchExpenses(token) {
  try {
    const res = await fetch(`${API_URL}/expenses`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.status === 401) {
      throw new Error("Unauthorized");
    }
    
    // If the table is empty, Supabase might return an empty array or a 404
    if (res.status === 404) return []; 
    
    if (!res.ok) throw new Error("Failed to fetch expenses");
    return await res.json();
  } catch (error) {
    console.error("Fetch error:", error);
    if (error.message === "Unauthorized") throw error;
    return []; // Return empty array so the UI doesn't crash
  }
}

export async function deleteTransactionAPI(id, token) {
  const res = await fetch(`${API_URL}/expenses/${id}`, { 
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to delete expense");
  return res.json();
}

export async function refreshCharts(token) {
  const res = await fetch(`${API_URL}/reports/refresh`, { 
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to refresh charts");
  return res.json();
}

export async function confirmTransaction(transactionData, token) {
  const res = await fetch(`${API_URL}/transactions/confirm`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(transactionData),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to save transaction");
  }
  return res.json();
}
