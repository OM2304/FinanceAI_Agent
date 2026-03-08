from collections import defaultdict
from typing import Dict, Any, List, Optional


def _to_float(value) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def summarize_group_expenses(expenses: List[Dict[str, Any]], user_map: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    total_cost = 0.0
    paid_by = defaultdict(float)
    owed_by = defaultdict(float)
    user_map = user_map or {}

    for exp in expenses:
        total_cost += _to_float(exp.get("cost"))
        for u in exp.get("users", []):
            user = u.get("user") or {}
            user_id = str(user.get("id") or u.get("user_id") or "")
            name = user.get("name") or user.get("email") or user_map.get(user_id) or "Unknown"
            paid_by[name] += _to_float(u.get("paid_share"))
            owed_by[name] += _to_float(u.get("owed_share"))

    balances = {}
    for name in set(list(paid_by.keys()) + list(owed_by.keys())):
        balances[name] = round(paid_by[name] - owed_by[name], 2)

    return {
        "total_cost": round(total_cost, 2),
        "paid_by": dict(paid_by),
        "owed_by": dict(owed_by),
        "net_balances": balances,
    }
