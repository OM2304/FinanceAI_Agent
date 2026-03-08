import pandas as pd
from typing import List, Dict, Union
import json
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

# --- Import Data Processing Utilities ---
# Fix Import
try:
    from supabase_db import get_user_transactions
    from data_processor import load_budget_limits, load_and_clean_data
except ImportError:
    from backend.tools.supabase_db import get_user_transactions
    from backend.tools.data_processor import load_budget_limits, load_and_clean_data

#---------Configuration---------#
# Fix Paths (tools -> backend -> Project Root)
TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(TOOLS_DIR))

DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
OUTPUT_DIR = os.path.join(DATA_DIR, 'reports')
os.makedirs(OUTPUT_DIR, exist_ok=True)

CHART_PATH_BAR = os.path.join(OUTPUT_DIR, 'total_spending_by_category_bar_chart.png')
CHART_PATH_LINE = os.path.join(OUTPUT_DIR, 'monthly_spending_trend_line_chart.png')


# ==================================================================
# A. DATA LOADING FUNCTIONS
# ==================================================================

def load_and_clean_data_from_supabase(user_id: str = None) -> pd.DataFrame:
    """
    Load transaction data from Supabase and convert to DataFrame format
    compatible with existing analytics functions.
    Wrapper for data_processor.load_and_clean_data.
    """
    return load_and_clean_data(user_id)


# ==================================================================
# B. CORE ANALYTICS FUNCTIONS (unchanged)
# ==================================================================

def get_spending_by_category(df: pd.DataFrame) -> List[Dict[str, Union[str, int]]]:
    if df.empty:
        return []
    category_spending = df.groupby('category')['amount'].sum().sort_values(ascending=False).reset_index()
    category_spending.columns = ['Category', 'Total_Spent_INR']
    return category_spending.to_dict('records')


def get_monthly_spending_trend(df: pd.DataFrame) -> List[Dict[str, Union[str, int]]]:
    if df.empty:
        return []
    # Ensure datetime is index
    df = df.copy()
    df.set_index('datetime', inplace=True)
    monthly_spending = df['amount'].resample('ME').sum().reset_index()
    monthly_spending.rename(columns={'datetime': 'Month_Year', 'amount': 'Total_Spent_INR'}, inplace=True)
    monthly_spending['Month_Year'] = monthly_spending['Month_Year'].dt.strftime('%Y-%m')
    return monthly_spending.to_dict('records')


def get_top_n_merchants(df: pd.DataFrame, n: int = 5) -> List[Dict[str, Union[str, int]]]:
    if df.empty:
        return []
    merchant_spending = df.groupby('description')['amount'].sum().sort_values(ascending=False).head(n).reset_index()
    merchant_spending.columns = ['Merchant', 'Total_Spent_INR']
    return merchant_spending.to_dict('records')


def get_spending_patterns(df: pd.DataFrame) -> Dict[str, Union[str, float, dict, list]]:
    if df.empty:
        return {
            "status": "empty",
            "message": "No transactions available for pattern analysis."
        }

    df = df.copy()
    df["date_only"] = df["datetime"].dt.date
    total_spent = float(df["amount"].sum())
    txn_count = int(len(df))
    avg_txn = float(df["amount"].mean()) if txn_count else 0.0

    date_min = df["date_only"].min()
    date_max = df["date_only"].max()
    day_span = max((date_max - date_min).days + 1, 1)
    avg_daily = float(total_spent / day_span)

    category_spend = df.groupby("category")["amount"].sum().sort_values(ascending=False)
    top_category = None
    if not category_spend.empty:
        name = category_spend.index[0]
        amount = float(category_spend.iloc[0])
        pct = round((amount / total_spent) * 100, 2) if total_spent else 0.0
        top_category = {"name": name, "amount": amount, "percent": pct}

    merchant_spend = df.groupby("description")["amount"].sum().sort_values(ascending=False)
    top_merchant = None
    if not merchant_spend.empty:
        top_merchant = {"name": merchant_spend.index[0], "amount": float(merchant_spend.iloc[0])}

    weekday_map = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    df["weekday"] = df["datetime"].dt.weekday
    day_spend = df.groupby("weekday")["amount"].sum()
    busiest_day = None
    if not day_spend.empty:
        idx = int(day_spend.idxmax())
        busiest_day = {"day": weekday_map[idx], "amount": float(day_spend.loc[idx])}

    weekend_mask = df["weekday"].isin([5, 6])
    weekend_total = float(df.loc[weekend_mask, "amount"].sum())
    weekday_total = float(df.loc[~weekend_mask, "amount"].sum())
    weekend_share = round((weekend_total / total_spent) * 100, 2) if total_spent else 0.0

    recurring = (
        df.groupby("description")
        .agg(count=("amount", "count"), total=("amount", "sum"))
        .sort_values(["count", "total"], ascending=False)
    )
    recurring = recurring[recurring["count"] >= 3].head(5)
    recurring_merchants = [
        {"name": idx, "count": int(row["count"]), "total": float(row["total"])}
        for idx, row in recurring.iterrows()
    ]

    # Month over month change (last two months)
    df_month = df.set_index("datetime").sort_index()
    monthly = df_month["amount"].resample("ME").sum()
    mom_change = None
    if len(monthly) >= 2:
        last = float(monthly.iloc[-1])
        prev = float(monthly.iloc[-2])
        diff = last - prev
        pct = round((diff / prev) * 100, 2) if prev else 0.0
        mom_change = {"current": last, "previous": prev, "diff": diff, "percent": pct}

    return {
        "status": "ok",
        "period": {"start": str(date_min), "end": str(date_max), "days": day_span},
        "total_spent": total_spent,
        "transaction_count": txn_count,
        "avg_transaction": round(avg_txn, 2),
        "avg_daily_spend": round(avg_daily, 2),
        "top_category": top_category,
        "top_merchant": top_merchant,
        "busiest_day": busiest_day,
        "weekend_share": weekend_share,
        "weekday_total": weekday_total,
        "weekend_total": weekend_total,
        "recurring_merchants": recurring_merchants,
        "month_over_month": mom_change
    }


def build_budget_recommendations(df: pd.DataFrame, budget_limits: dict = None) -> List[Dict[str, str]]:
    if df.empty:
        return []

    recs: List[Dict[str, str]] = []
    total_spent = float(df["amount"].sum())

    # Top category concentration
    category_spend = df.groupby("category")["amount"].sum().sort_values(ascending=False)
    if not category_spend.empty and total_spent > 0:
        top_name = category_spend.index[0]
        top_amount = float(category_spend.iloc[0])
        top_pct = (top_amount / total_spent) * 100
        if top_pct >= 40:
            recs.append({
                "title": "High category concentration",
                "detail": f"{top_name} accounts for {top_pct:.1f}% of spending. Consider setting a tighter limit or reviewing big purchases."
            })

    # Budget limit alerts
    if budget_limits:
        spending_summary = df.groupby("category")["amount"].sum().to_dict()
        for category, limit in budget_limits.items():
            spent = float(spending_summary.get(category, 0))
            if limit and spent > limit:
                over = spent - float(limit)
                recs.append({
                    "title": f"Over budget: {category}",
                    "detail": f"Spent INR {spent:.2f} vs limit INR {float(limit):.2f}. Over by INR {over:.2f}."
                })

    # Weekend vs weekday split
    df = df.copy()
    df["weekday"] = df["datetime"].dt.weekday
    weekend_total = float(df.loc[df["weekday"].isin([5, 6]), "amount"].sum())
    weekend_share = (weekend_total / total_spent) * 100 if total_spent else 0
    if weekend_share >= 50:
        recs.append({
            "title": "Weekend-heavy spending",
            "detail": f"{weekend_share:.1f}% of spending happens on weekends. Try setting a weekend cap."
        })

    # Recurring merchants
    recurring = (
        df.groupby("description")
        .agg(count=("amount", "count"), total=("amount", "sum"))
        .sort_values(["count", "total"], ascending=False)
    )
    recurring = recurring[recurring["count"] >= 3]
    if not recurring.empty:
        top_rec = recurring.head(1).iloc[0]
        top_name = recurring.head(1).index[0]
        recs.append({
            "title": "Recurring spending detected",
            "detail": f"{top_name} appears {int(top_rec['count'])} times. Review subscriptions or repeat purchases."
        })

    # Month-over-month increase
    df_month = df.set_index("datetime").sort_index()
    monthly = df_month["amount"].resample("ME").sum()
    if len(monthly) >= 2:
        last = float(monthly.iloc[-1])
        prev = float(monthly.iloc[-2])
        if prev > 0:
            change_pct = ((last - prev) / prev) * 100
            if change_pct >= 20:
                recs.append({
                    "title": "Spending increased",
                    "detail": f"Spending rose {change_pct:.1f}% vs last month. Check recent large expenses."
                })

    return recs[:6]


# ==================================================================
# B. BUDGETING & RECOMMENDATION TOOLS
# ==================================================================

def calculate_budget_adherence(df: pd.DataFrame, budget_limits: dict = None) -> List[Dict[str, Union[str, float]]]:
    if df.empty:
        return [{'status': 'Data Empty', 'recommendation': 'No transactions available to calculate budget.'}]
    if budget_limits is None:
        budget_limits = load_budget_limits()
    if not budget_limits:
        return [{'status': 'Budget Missing', 'recommendation': 'Budget limits not defined.'}]
    spending_summary = df.groupby('category')['amount'].sum().to_dict()
    results = []
    for category, budget_amount in budget_limits.items():
        spent_amount = spending_summary.get(category, 0)
        remaining = budget_amount - spent_amount
        status = "On Track" if remaining >= 0 else "OVER BUDGET"
        recommendation = f"Under budget by INR {remaining:.2f}" if remaining >= 0 else f"Over budget by INR {abs(remaining):.2f}"
        results.append({
            'Category': category,
            'Budgeted_INR': budget_amount,
            'Spent_INR': spent_amount,
            'Remaining_INR': remaining,
            'Status': status,
            'Recommendation': recommendation
        })
    return results


# ==================================================================
# C. VISUALIZATION
# ==================================================================

def generate_spending_charts(df: pd.DataFrame, user_id: str = "default") -> List[str]:
    if df.empty:
        return ['Error: Cannot generate charts, data is empty.']
    
    # Define user-specific paths
    user_bar_path = os.path.join(OUTPUT_DIR, f'{user_id}_total_spending_by_category_bar_chart.png')
    user_line_path = os.path.join(OUTPUT_DIR, f'{user_id}_monthly_spending_trend_line_chart.png')
    user_pie_path = os.path.join(OUTPUT_DIR, f'{user_id}_spending_distribution_pie_chart.png')
    user_merchants_path = os.path.join(OUTPUT_DIR, f'{user_id}_top_merchants_chart.png')

    # --- Category Bar Chart ---
    category_data = df.groupby('category')['amount'].sum().sort_values(ascending=False)
    if category_data.empty:
        return ['Error: No category data available for chart generation.']
    
    print(f"Category data:\n{category_data}")
    
    plt.figure(figsize=(12, 7))
    ax = category_data.plot(kind='bar', color='teal', width=0.7, edgecolor='darkblue', linewidth=1.5)
    
    # Format y-axis to show currency
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'₹{x:,.0f}'))
    
    # Set labels and title
    plt.xlabel('Expense Category', fontsize=13, fontweight='bold')
    plt.ylabel('Total Amount (INR)', fontsize=13, fontweight='bold')
    plt.title('Total Spending by Category', fontsize=16, fontweight='bold', pad=20)
    
    # Rotate x-axis labels
    plt.xticks(rotation=45, ha='right')
    
    # Add grid
    plt.grid(True, alpha=0.3, axis='y', linestyle='--')
    
    # Add value labels on top of bars
    for i, (category, value) in enumerate(category_data.items()):
        plt.text(i, value, f'₹{value:,.0f}', 
                ha='center', va='bottom', fontsize=10, fontweight='bold')
    
    # Ensure y-axis starts at 0
    plt.ylim(bottom=0, top=category_data.max() * 1.15)
    
    plt.tight_layout()
    plt.savefig(user_bar_path, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f"✅ Bar chart saved successfully to {user_bar_path}")

    # --- Monthly Trend Line Chart ---
    try:
        # Prepare DataFrame for Line Chart
        df_line = df.copy()
        
        # Ensure datetime column is properly typed
        if 'datetime' in df_line.columns:
            df_line['datetime'] = pd.to_datetime(df_line['datetime'])

        if df_line.empty:
            raise ValueError("No valid datetime data available after filtering")
        
        print(f"Total records for line chart: {len(df_line)}")
        print(f"Date range: {df_line['datetime'].min()} to {df_line['datetime'].max()}")
        print(f"Year range: {df_line['datetime'].dt.year.min()} to {df_line['datetime'].dt.year.max()}")
        
        # Set datetime as index and sort
        df_line = df_line.set_index('datetime').sort_index()
        
        # Resample to monthly data (ME = Month End)
        monthly_data = df_line['amount'].resample('ME').sum()
        
        # Filter out dates that are clearly wrong (before 2000 or after 2100)
        monthly_data = monthly_data[
            (monthly_data.index.year >= 2000) & 
            (monthly_data.index.year <= 2100)
        ]
        
        # Debug: Print info about the data
        print(f"Monthly data points: {len(monthly_data)}")
        if len(monthly_data) > 0:
            print(f"Monthly data:\n{monthly_data}")
            print(f"Monthly data index:\n{monthly_data.index}")
            print(f"Year range: {monthly_data.index.year.min()} to {monthly_data.index.year.max()}")
        
        # Check if we have data
        if monthly_data.empty or len(monthly_data) == 0:
            raise ValueError("No monthly data to plot after resampling and filtering")
        
        # Create the figure
        plt.figure(figsize=(12, 7))
        
        # Plot the line chart
        ax = monthly_data.plot(kind='line', marker='o', linestyle='-', color='purple', 
                               linewidth=3, markersize=10, figsize=(12, 7))
        
        # Format x-axis dates properly
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
        
        # Set locator based on number of months
        num_months = len(monthly_data)
        if num_months <= 6:
            ax.xaxis.set_major_locator(mdates.MonthLocator(interval=1))
        elif num_months <= 12:
            ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
        else:
            ax.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
        
        # Rotate x-axis labels for readability
        plt.xticks(rotation=45, ha='right')
        
        # Set labels and title
        plt.xlabel('Month', fontsize=13, fontweight='bold')
        plt.ylabel('Total Amount (INR)', fontsize=13, fontweight='bold')
        plt.title('Monthly Spending Trend', fontsize=16, fontweight='bold', pad=20)
        
        # Add grid
        plt.grid(True, alpha=0.3, linestyle='--')
        
        # Format y-axis to show currency
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'₹{x:,.0f}'))
        
        # Ensure y-axis starts at 0
        y_min = monthly_data.min()
        y_max = monthly_data.max()
        if y_min > 0:
            plt.ylim(bottom=0, top=y_max * 1.1)
        else:
            plt.ylim(bottom=y_min * 1.1, top=y_max * 1.1)
        
        # Add value labels on points
        for i, (date, value) in enumerate(zip(monthly_data.index, monthly_data.values)):
            plt.annotate(f'₹{value:,.0f}', 
                        (date, value),
                        textcoords="offset points", 
                        xytext=(0,10), 
                        ha='center',
                        fontsize=9,
                        bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.7))
        plt.tight_layout()
        plt.savefig(user_line_path, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close()
        print(f"✅ Line chart saved successfully to {user_line_path}")
        
    except Exception as e:
        print(f"Error generating line chart: {e}")
        # Create a placeholder chart with error message
        plt.figure(figsize=(10, 6))
        plt.text(0.5, 0.5, f'Error generating chart:\n{str(e)}', 
                ha='center', va='center', fontsize=12, 
                transform=plt.gca().transAxes)
        plt.xlabel('Month')
        plt.ylabel('Total Amount (INR)')
        plt.savefig(user_line_path, dpi=100, bbox_inches='tight')
        plt.close()

    # NEW: Pie Chart - Spending Distribution
    if not category_data.empty:
        try:
            plt.figure(figsize=(10, 8))
            colors = plt.cm.Set3.colors
            wedges, texts, autotexts = plt.pie(category_data.values, labels=category_data.index, autopct='%1.1f%%', 
                    colors=colors, startangle=90)
            
            # Make percentage text darker for better visibility
            for autotext in autotexts:
                autotext.set_color('white')
                autotext.set_fontweight('bold')
                autotext.set_fontsize(10)
            
            plt.title('Spending Distribution by Category', fontsize=16, fontweight='bold', pad=20, color='#333333')
            plt.tight_layout()
            plt.savefig(user_pie_path, dpi=150, bbox_inches='tight', facecolor='white')
            plt.close()
            print(f"✅ Pie chart saved successfully to {user_pie_path}")
        except Exception as e:
            print(f"Error generating pie chart: {e}")
            # Create placeholder for pie chart
            plt.figure(figsize=(10, 6))
            plt.text(0.5, 0.5, f'Error generating pie chart:\n{str(e)}', 
                    ha='center', va='center', fontsize=12, 
                    transform=plt.gca().transAxes)
            plt.title('Spending Distribution by Category')
            plt.tight_layout()
            plt.savefig(user_pie_path, dpi=100, bbox_inches='tight')
            plt.close()

    # NEW: Top Merchants Chart
    try:
        merchant_data = df.groupby('description')['amount'].sum().sort_values(ascending=False).head(10)
        if not merchant_data.empty:
            plt.figure(figsize=(12, 8))
            merchant_data.plot(kind='barh', color='orange', edgecolor='darkred', linewidth=1.5)
            plt.title('Top 10 Merchants by Spending', fontsize=16, fontweight='bold', pad=20, color='#333333')
            plt.xlabel('Total Amount (INR)', fontsize=13, fontweight='bold', color='#333333')
            
            # Format x-axis to show currency
            ax = plt.gca()
            ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'₹{x:,.0f}'))
            
            # Add value labels
            for i, (merchant, value) in enumerate(merchant_data.items()):
                plt.text(value, i, f'₹{value:,.0f}', 
                        ha='left', va='center', fontsize=9, fontweight='bold', color='#333333')
            
            plt.tight_layout()
            plt.savefig(user_merchants_path, dpi=150, bbox_inches='tight', facecolor='white')
            plt.close()
            print(f"✅ Merchants chart saved successfully to {user_merchants_path}")
        else:
            print("No merchant data available for chart generation")
    except Exception as e:
        print(f"Error generating merchants chart: {e}")
        # Create placeholder for merchants chart
        plt.figure(figsize=(10, 6))
        plt.text(0.5, 0.5, f'Error generating merchants chart:\n{str(e)}', 
                ha='center', va='center', fontsize=12, 
                transform=plt.gca().transAxes)
        plt.title('Top 10 Merchants by Spending')
        plt.tight_layout()
        plt.savefig(user_merchants_path, dpi=100, bbox_inches='tight')
        plt.close()
    
    return [user_bar_path, user_line_path, user_pie_path, user_merchants_path]

#To redraw charts after data updation
def refresh_analysis(user_id: str):
    """Helper for the Agent: Reloads data and recreates all charts."""
    df = load_and_clean_data(user_id)
    if not df.empty:
        generate_spending_charts(df, user_id)
        print(f"📈 Analytics and Charts Refreshed for user {user_id}!")
        return True
    return False


# ==================================================================
# D. MAIN / DEMO
# ==================================================================

if __name__ == '__main__':
    print("--- Running Analytics Module Test ---")
    # user_id = "test_user" # Provide a valid user ID for testing
    # clean_df = load_and_clean_data(user_id)
    # if clean_df.empty:
    #     print("\nTest failed: No clean data to analyze. Check Supabase connection.")
    # else:
    #     print(f"\nSuccessfully loaded {len(clean_df)} expense records.")

    #     category_summary = get_spending_by_category(clean_df)
    #     monthly_summary = get_monthly_spending_trend(clean_df)
    #     top_merchants = get_top_n_merchants(clean_df, 3)

    #     print("\n--- Category Spending Summary ---")
    #     print(json.dumps(category_summary[:5], indent=2))
    #     print("\n--- Top 3 Merchants ---")
    #     print(json.dumps(top_merchants, indent=2))

    #     budget_results = calculate_budget_adherence(clean_df)
    #     print("\n--- Budget Adherence ---")
    #     print(json.dumps(budget_results[:5], indent=2))

    #     chart_paths = generate_spending_charts(clean_df)
    #     print("\n--- Charts Generated ---")
    #     print(f"Chart files saved at: {chart_paths}")
