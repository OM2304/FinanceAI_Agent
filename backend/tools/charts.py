from __future__ import annotations

from typing import Dict, List
import os

import pandas as pd
import matplotlib
from matplotlib import cycler

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

try:
    from tools.data_processor import load_and_clean_data
except ImportError:
    from backend.tools.data_processor import load_and_clean_data


# --------- Paths --------- #
TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(TOOLS_DIR))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
OUTPUT_DIR = os.path.join(DATA_DIR, "reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)


# --------- Theme --------- #
NAVY = "#1e293b"    # Deep Navy
INDIGO = "#4f46e5"  # Indigo
SLATE = "#94a3b8"   # Slate
GRID = "#e2e8f0"    # Border slate
GRID_LIGHT = "#f1f5f9"  # Faint gray grid
COLOR_CYCLE = ["#1e293b", "#334155", "#475569", "#64748b"]


def _apply_mpl_theme() -> None:
    plt.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["Inter", "DejaVu Sans", "Arial", "Liberation Sans"],
        "text.color": NAVY,
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "axes.edgecolor": GRID,
        "axes.labelcolor": NAVY,
        "axes.labelsize": 11,
        "axes.titlesize": 15,
        "axes.titleweight": "semibold",
        "xtick.color": NAVY,
        "ytick.color": NAVY,
        "grid.color": GRID_LIGHT,
        "grid.alpha": 1.0,
        "grid.linestyle": "-",
        "axes.prop_cycle": cycler(color=COLOR_CYCLE),
    })


def _style_axes(ax) -> None:
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(GRID)
    ax.spines["bottom"].set_color(GRID)
    ax.set_axisbelow(True)


def _format_currency_axis(ax) -> None:
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f"₹{x:,.0f}"))


def _ensure_parent_dir_writable(file_path: str) -> None:
    parent = os.path.dirname(os.path.abspath(file_path))
    os.makedirs(parent, exist_ok=True)
    if not os.access(parent, os.W_OK):
        raise PermissionError(f"Charts directory is not writable: {parent}")


def _savefig(output_path: str, *, dpi: int = 150) -> None:
    _ensure_parent_dir_writable(output_path)
    plt.savefig(output_path, dpi=dpi, bbox_inches="tight", facecolor="white")
    plt.close("all")


def _purge_dates(df: pd.DataFrame) -> pd.DataFrame:
    local = df.copy()
    if "date" not in local.columns:
        if "datetime" in local.columns:
            local["date"] = local["datetime"]
        else:
            local["date"] = pd.NaT

    local["date"] = pd.to_datetime(local["date"], dayfirst=True, errors="coerce")
    local = local.dropna(subset=["date"])
    local = local[local["date"].dt.year >= 2025]
    return local


def generate_category_bar(df: pd.DataFrame, output_path: str) -> str:
    _apply_mpl_theme()

    category_data = df.groupby("category")["amount"].sum().sort_values(ascending=False)
    plt.figure(figsize=(12, 7))
    ax = category_data.plot(kind="bar", color=NAVY, width=0.68, edgecolor="none", linewidth=0)
    _style_axes(ax)
    _format_currency_axis(ax)
    plt.grid(True, axis="y")
    plt.xlabel("Expense Category", fontweight="semibold")
    plt.ylabel("Total Amount (INR)", fontweight="semibold")
    plt.title("Total Spending by Category", pad=14, color=NAVY)
    plt.xticks(rotation=45, ha="right")
    plt.ylim(bottom=0, top=float(category_data.max() or 0) * 1.15 if len(category_data) else 1)
    plt.tight_layout()
    _savefig(output_path, dpi=150)
    return output_path


def generate_monthly_trend(df: pd.DataFrame, output_path: str) -> str:
    _apply_mpl_theme()

    local = _purge_dates(df)
    if local.empty:
        raise ValueError("No valid dates available for monthly trend.")

    # Keep the axis focused and prevent Unix-epoch defaults.
    local = local[local["date"].dt.year.between(2025, 2026)]
    if local.empty:
        raise ValueError("No dates in 2025-2026 available for monthly trend.")

    local = local.set_index("date").sort_index()
    monthly = local["amount"].resample("M").sum()
    if monthly.empty:
        raise ValueError("No monthly data available for trend chart.")

    # Fill missing months inside the 2025-2026 range for clean axis labeling.
    idx_min = max(monthly.index.min(), pd.Timestamp(2025, 1, 31))
    idx_max = min(monthly.index.max(), pd.Timestamp(2026, 12, 31) + pd.offsets.MonthEnd(0))
    full_index = pd.date_range(idx_min, idx_max, freq="M")
    monthly = monthly.reindex(full_index, fill_value=0.0)

    plt.figure(figsize=(12, 7))
    ax = monthly.plot(
        kind="line",
        marker="o",
        linestyle="-",
        color=INDIGO,
        linewidth=2.6,
        markersize=6,
        figsize=(12, 7),
    )
    _style_axes(ax)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f"₹{x:,.0f}"))

    num_months = len(monthly)
    interval = 1 if num_months <= 8 else 2 if num_months <= 16 else 3
    ax.xaxis.set_major_locator(mdates.MonthLocator(interval=interval))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %y"))
    ax.set_xlim(monthly.index.min(), monthly.index.max())

    plt.grid(True, axis="y")
    plt.xlabel("Month", fontweight="semibold")
    plt.ylabel("Total Amount (INR)", fontweight="semibold")
    plt.title("Monthly Spending Trend", pad=14, color=NAVY)
    plt.xticks(rotation=45, ha="right")

    y_max = float(monthly.max() or 0)
    plt.ylim(bottom=0, top=y_max * 1.1 if y_max > 0 else 1)

    plt.tight_layout()
    _savefig(output_path, dpi=150)
    return output_path


def generate_spending_pie(df: pd.DataFrame, output_path: str) -> str:
    _apply_mpl_theme()
    category_data = df.groupby("category")["amount"].sum().sort_values(ascending=False)
    colors = [NAVY, INDIGO, SLATE, "#64748b", "#cbd5e1"]

    plt.figure(figsize=(10, 8))
    plt.pie(
        category_data.values,
        labels=category_data.index,
        autopct="%1.1f%%",
        colors=[colors[i % len(colors)] for i in range(len(category_data))],
        startangle=90,
        wedgeprops=dict(linewidth=0),
        textprops=dict(color=NAVY, fontsize=9),
    )
    plt.title("Spending Distribution by Category", pad=14, color=NAVY, fontweight="semibold")
    plt.tight_layout()
    _savefig(output_path, dpi=150)
    return output_path


def generate_top_merchants(df: pd.DataFrame, output_path: str) -> str:
    _apply_mpl_theme()
    merchant_data = df.groupby("description")["amount"].sum().sort_values(ascending=False).head(10)

    plt.figure(figsize=(12, 8))
    ax = merchant_data.plot(kind="barh", color=NAVY, edgecolor="none", linewidth=0)
    _style_axes(ax)
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f"₹{x:,.0f}"))
    plt.grid(True, axis="x")
    plt.xlabel("Total Amount (INR)", fontweight="semibold")
    plt.title("Top 10 Merchants by Spending", pad=14, color=NAVY)
    plt.tight_layout()
    _savefig(output_path, dpi=150)
    return output_path


def generate_all_charts(df: pd.DataFrame, user_id: str) -> List[str]:
    paths: Dict[str, str] = {
        "bar": os.path.join(OUTPUT_DIR, f"{user_id}_total_spending_by_category_bar_chart.png"),
        "line": os.path.join(OUTPUT_DIR, f"{user_id}_monthly_spending_trend_line_chart.png"),
        "pie": os.path.join(OUTPUT_DIR, f"{user_id}_spending_distribution_pie_chart.png"),
        "merchants": os.path.join(OUTPUT_DIR, f"{user_id}_top_merchants_chart.png"),
    }

    generate_category_bar(df, paths["bar"])
    generate_monthly_trend(df, paths["line"])
    generate_spending_pie(df, paths["pie"])
    generate_top_merchants(df, paths["merchants"])
    return [paths["bar"], paths["line"], paths["pie"], paths["merchants"]]


def refresh_analysis(user_id: str) -> bool:
    df = load_and_clean_data(user_id)
    if df is None or df.empty:
        return False

    # Keep charts tied to the current year range if user data is sparse/invalid.
    try:
        generate_all_charts(df, user_id)
    except Exception:
        # Never fall back to Unix epoch; generate what we can.
        paths = {
            "bar": os.path.join(OUTPUT_DIR, f"{user_id}_total_spending_by_category_bar_chart.png"),
            "pie": os.path.join(OUTPUT_DIR, f"{user_id}_spending_distribution_pie_chart.png"),
            "merchants": os.path.join(OUTPUT_DIR, f"{user_id}_top_merchants_chart.png"),
        }
        try:
            generate_category_bar(df, paths["bar"])
        except Exception:
            pass
        try:
            generate_spending_pie(df, paths["pie"])
        except Exception:
            pass
        try:
            generate_top_merchants(df, paths["merchants"])
        except Exception:
            pass

    return True
