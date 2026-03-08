import os
import requests
from typing import Optional, Dict, Any

BASE_URL = "https://secure.splitwise.com/api/v3.0"
OAUTH_AUTHORIZE_URL = "https://secure.splitwise.com/oauth/authorize"
OAUTH_TOKEN_URL = "https://secure.splitwise.com/oauth/token"


def _get_client_id() -> str:
    client_id = os.getenv("SPLITWISE_CLIENT_ID")
    if not client_id:
        raise RuntimeError("Missing SPLITWISE_CLIENT_ID in environment")
    return client_id


def _get_client_secret() -> str:
    client_secret = os.getenv("SPLITWISE_CLIENT_SECRET")
    if not client_secret:
        raise RuntimeError("Missing SPLITWISE_CLIENT_SECRET in environment")
    return client_secret


def _get_token_fallback() -> str:
    token = os.getenv("SPLITWISE_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("Missing SPLITWISE_ACCESS_TOKEN in environment")
    return token


def _headers(token: Optional[str] = None) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token or _get_token_fallback()}",
    }


def _get(path: str, params: Optional[Dict[str, Any]] = None, token: Optional[str] = None) -> Dict[str, Any]:
    url = f"{BASE_URL}{path}"
    resp = requests.get(url, headers=_headers(token), params=params, timeout=20)
    if resp.status_code >= 400:
        raise RuntimeError(f"Splitwise API error {resp.status_code}: {resp.text}")
    return resp.json()


def _post_form(path: str, payload: Dict[str, Any], token: Optional[str] = None) -> Dict[str, Any]:
    url = f"{BASE_URL}{path}"
    resp = requests.post(url, headers=_headers(token), data=payload, timeout=20)
    if resp.status_code >= 400:
        raise RuntimeError(f"Splitwise API error {resp.status_code}: {resp.text}")
    return resp.json()


def get_groups(token: Optional[str] = None) -> Dict[str, Any]:
    return _get("/get_groups", token=token)


def get_group(group_id: int, token: Optional[str] = None) -> Dict[str, Any]:
    return _get(f"/get_group/{group_id}", token=token)


def get_current_user(token: Optional[str] = None) -> Dict[str, Any]:
    return _get("/get_current_user", token=token)


def get_expenses(group_id: Optional[int] = None, limit: int = 20, offset: int = 0, token: Optional[str] = None) -> Dict[str, Any]:
    params: Dict[str, Any] = {"limit": limit, "offset": offset}
    if group_id is not None:
        params["group_id"] = group_id
    return _get("/get_expenses", params=params, token=token)


def create_expense(payload: Dict[str, Any], token: Optional[str] = None) -> Dict[str, Any]:
    return _post_form("/create_expense", payload=payload, token=token)


def build_authorize_url(redirect_uri: str, state: str) -> str:
    return (
        f"{OAUTH_AUTHORIZE_URL}"
        f"?response_type=code&client_id={_get_client_id()}"
        f"&redirect_uri={redirect_uri}&state={state}"
    )


def exchange_code_for_token(code: str, redirect_uri: str) -> Dict[str, Any]:
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": _get_client_id(),
        "client_secret": _get_client_secret(),
        "redirect_uri": redirect_uri,
    }
    resp = requests.post(OAUTH_TOKEN_URL, data=data, timeout=20)
    if resp.status_code >= 400:
        raise RuntimeError(f"Splitwise token error {resp.status_code}: {resp.text}")
    return resp.json()
