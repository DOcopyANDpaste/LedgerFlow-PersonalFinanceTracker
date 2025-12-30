import { GoogleGenAI } from "@google/genai";
import { Transaction, Account } from "../types";

export const analyzeFinances = async (
  transactions: Transaction[], 
  accounts: Account[],
  question?: string
): Promise<string> => {
  // Use process.env.API_KEY directly as per guidelines
  const client = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Prepare context
  const accountSummary = accounts
    .map(a => `${a.name} (${a.type}): Budget ${a.budget || 0}`)
    .join('\n');
    
  const recentTransactions = transactions.slice(0, 50).map(t => 
    `${t.date}: ${t.payee ? t.payee + ' - ' : ''}${t.description || 'No description'} -> ${t.splits.map(s => s.amount).join(', ')}`
  ).join('\n');

  const prompt = `
    You are a professional accountant and financial analyst. 
    Here is the user's ledger structure:
    ${accountSummary}

    Here are the recent transactions:
    ${recentTransactions}

    User Question: ${question || "Please analyze my spending habits, specifically looking at my budget vs actuals. Identify any transactions that might be split incorrectly or suggest budget adjustments."}

    Provide a concise, markdown-formatted analysis.
  `;

  try {
    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini API Error", error);
    return "Failed to generate analysis. Please try again later.";
  }
};