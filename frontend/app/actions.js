// 'use server'
// 
// // This file is currently disabled because it depends on modules that are missing in the frontend environment.
// // import db from '@/lib/db';
// // import { ocrSpace, parseTransaction, categorizeTransaction } from '@/lib/utils';
// // import { revalidatePath } from 'next/cache';
// 
// // export async function uploadImage(formData) {
// //   const file = formData.get('file');
// //   if (!file) return { success: false, message: "No file uploaded" };
// // 
// //   const arrayBuffer = await file.arrayBuffer();
// //   const buffer = Buffer.from(arrayBuffer);
// // 
// //   const rawText = await ocrSpace(buffer);
// //   if (!rawText) return { success: false, message: "OCR Failed" };
// // 
// //   let tx = parseTransaction(rawText);
// //   tx.category = categorizeTransaction(tx);
// // 
// //   // === UPDATED SQL TO STORE ALL FIELDS ===
// //   const stmt = db.prepare(`
// //     INSERT INTO expenses (sender, receiver, amount, date, time, transaction_id, category)
// //     VALUES (?, ?, ?, ?, ?, ?, ?)
// //   `);
// //   
// //   stmt.run(tx.sender, tx.receiver, tx.amount, tx.date, tx.time, tx.transaction_id, tx.category);
// // 
// //   revalidatePath('/');
// //   return { success: true, data: tx };
// // }
// 
// // export async function deleteTransaction(id) {
// //   const stmt = db.prepare('DELETE FROM expenses WHERE id = ?');
// //   stmt.run(id);
// //   revalidatePath('/'); // Refreshes the dashboard to show the item is gone
// // }
