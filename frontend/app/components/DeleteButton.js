'use client'
import { useRouter } from 'next/navigation';
import { deleteTransactionAPI } from '../../lib/api.js';
import { createClient } from '../../lib/supabase/client.js';

export function DeleteButton({ id }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleDelete() {
    if(!confirm("Are you sure?")) return;
    
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            alert("Please login first");
            return;
        }
        
        await deleteTransactionAPI(id, session.access_token);
        router.refresh(); // Refresh the list
    } catch(e) {
        console.error(e);
        alert("Failed to delete");
    }
  }

  return (
    <button onClick={handleDelete} className="text-red-500 hover:text-red-700">
      🗑️
    </button>
  )
}
