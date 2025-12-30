
# LedgerFlow
**LedgerFlow** is a professional, double-entry personal accounting application designed to run as a **standalone web app** or an **Obsidian Plugin**. It combines the rigor of traditional accounting with modern visualizations and AI-powered insights.
All data is stored locally in human-readable formats (JSON and CSV), making it easy to import into Google Sheets or Excel for further analysis.

## 🌟 Key Features
 **LedgerFlow** is simple to use personal finance tracking tool, it ensures the books are always balance. 
### 1. ⚙️Set Up Accounts
- **Chart of Accounts:** Fully customizable, hierarchical structure accounts  (Assets, Liabilities, Income, Expenses, Starting Balance), with budget property for setting up your budget.
- Starting Balance and Transactions
- [[#1. Setting up Accounts|HOWTO?]]
### 2. ⌨️ Data Entry And Viewing
##### 2.1. 📝 Transactions
**Log Transaction**: Every transaction has a debit and a credit. and can be split across differnent account if needed, but it always need to be balanced. [[#2. Recording Transactions|Details]]
![[New Transaction.png|500x249]]
**Review Transactions**:
![[Journal.png|500x147]]
- Support simple sorting and filtering
- you can also modify and delete of entries.
##### 2.2. 🔄 Recurring Transactions
Automate recurring transactions by setting up recurring rules:
![[recurring manager.png|500x310]]
- Supports Daily, Weekly, Monthly, and Yearly frequencies.
- Automatically generates transactions when they are due.
- Dashboard notifications for due payments.
###  3. 📊 Interactive Dashboards
- **Expense Dashboard:**
	![[expense dashabord.png|500x424]]
  - View "Budget vs. Actual" progress bars.
  - Drill down into categories to see sub-category performance.
  - Visualize spending trends.
- **Net Worth Dashboard:**
	 ![[Net Worth dashboard.png|500x437]]
  - Track Assets vs. Liabilities.
  - View historical Net Worth trends over the years.
  - Analyze asset allocation via interactive pie charts.

### 4. 💾 Data Ownership (CSV & JSON)
all data will be saved locally, within your specified folder:
- `Transaction.csv`: Contains all financial moves. 
- `Accounts.json`: Defines your account hierarchy and budgets.
- `Recurring.json`: Stores your automation rules.

### 5. 🤖 AI Financial Analyst (hmmm...)
Integrated with **Google Gemini**, LedgerFlow can analyze your transaction history to:
- Identify spending patterns.
- Suggest budget adjustments.
- Detect anomalies or potential categorization errors.
- Answer natural language questions about your finances.
---

## 🚀 Getting Started

### Installation (Developer Mode)
1. **Clone the repository.**
2. **Install dependencies:**
```bash
   npm install
 ```
3. **Configure API Key:**
   To use the AI features, you need a Google Gemini API Key.
   *Set `process.env.API_KEY` in your environment or update `esbuild.config.mjs`.*
4. **Build:**
```bash
   npm run build
```
### Usage
#### 1. Setting up Accounts
Navigate to the **Chart of Accounts** tab.
- Click `+` on a parent group (e.g., "Expenses") to add a new category (e.g., "Food").
- Set a monthly budget for the category.
#### 2. Recording Transactions
Click the **"New Transaction"** button in the header.
- **Expense Mode:** Simple entry for daily spending.
- **Income Mode:** For recording salary or refunds.
- **Transfer Mode:** Moving money between assets (e.g., Checking to Savings) or paying off credit cards.
- **Journal Mode:** Advanced mode for complex splits (e.g., a paycheck with tax deductions).
#### 3. Analyzing Data
- Go to **Expense Dashboard** to check if you are under budget.
- Click **"Analyze Overview"** to let the AI summarize your month.
#### 4. Obsidian Commands
- New Transaction
- New Recurring Transaction
- Open LedgerFlow

---
## 📁 Data Structure

**Transaction.csv Columns:**
`Transaction ID, Date, Created At, Payee, Description, Account ID, Amount`

**Accounts.json Structure:**
Hierarchical tree object containing `id`, `name`, `type`, `budget`, and `children`.

---
## 🛠 Tech Stack

- **Frontend:** React 19, Tailwind CSS, Lucide Icons
- **Visualization:** Recharts
- **AI:** Google GenAI SDK (Gemini 1.5/2.5)
- **Platform:** Obsidian API / Web File System Access API