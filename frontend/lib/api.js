const API_URL = "http://localhost:8000";

export async function fetchExpenses(token) {
  try {
    const res = await fetch('http://localhost:8000/expenses', {
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

export async function uploadCsvTransactions(file, token) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_URL}/transactions/import-csv`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to import CSV");
  }
  return res.json();
}

export async function fetchBudgetLimits(token) {
  const res = await fetch(`${API_URL}/budget/limits`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch budget limits");
  return res.json();
}

export async function saveBudgetLimits(limits, token) {
  const res = await fetch(`${API_URL}/budget/limits`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(limits),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to save budget limits");
  }
  return res.json();
}

export async function fetchBudgetSummary(token) {
  const res = await fetch(`${API_URL}/budget/summary`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch budget summary");
  return res.json();
}

export async function fetchSpendingPatterns(token) {
  const res = await fetch(`${API_URL}/insights/patterns`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch spending patterns");
  return res.json();
}

export async function uploadGuruDocument({ file, guru, title }, token) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('guru', guru);
  if (title) formData.append('title', title);

  const res = await fetch(`${API_URL}/guru/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to upload guru document");
  }
  return res.json();
}

export async function fetchGuruDocuments(token, guru) {
  const url = guru ? `${API_URL}/guru/content?guru=${encodeURIComponent(guru)}` : `${API_URL}/guru/content`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch guru documents");
  return res.json();
}

export async function fetchSplitwiseGroups(token) {
  const res = await fetch(`${API_URL}/splitwise/groups`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch Splitwise groups");
  return res.json();
}

export async function fetchSplitwiseGroupSummary(token, groupId) {
  const res = await fetch(`${API_URL}/splitwise/group-summary/${groupId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch Splitwise group summary");
  return res.json();
}

export async function fetchSplitwiseGroup(token, groupId) {
  const res = await fetch(`${API_URL}/splitwise/group/${groupId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch Splitwise group");
  return res.json();
}

export async function fetchSplitwiseMe(token) {
  const res = await fetch(`${API_URL}/splitwise/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch Splitwise user");
  return res.json();
}

export async function createSplitwiseExpense(token, payload) {
  const res = await fetch(`${API_URL}/splitwise/expenses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to create Splitwise expense");
  }
  return res.json();
}

export async function getSplitwiseAuthorizeUrl(token, redirectUri) {
  const res = await fetch(`${API_URL}/splitwise/oauth/start?redirect_uri=${encodeURIComponent(redirectUri)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to start Splitwise OAuth");
  return res.json();
}

export async function exchangeSplitwiseCode(token, code, redirectUri) {
  const res = await fetch(`${API_URL}/splitwise/oauth/exchange`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to exchange Splitwise code");
  }
  return res.json();
}
