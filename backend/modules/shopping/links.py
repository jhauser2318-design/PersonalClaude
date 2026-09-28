"""Best-effort product details from a store link: name, description and price.

Many shops put this in standard tags on their pages (Open Graph, product
schema). Some big stores block automated requests, so this can come back
empty; you can always type the details yourself.
"""
import html
import json
import re
import urllib.error
import urllib.request

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


def _meta(page: str, *names: str) -> str | None:
    for name in names:
        for pattern in (
            rf'<meta[^>]+(?:property|name|itemprop)=["\']{re.escape(name)}["\'][^>]*content=["\']([^"\']*)["\']',
            rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name|itemprop)=["\']{re.escape(name)}["\']',
        ):
            m = re.search(pattern, page, re.I)
            if m and m.group(1).strip():
                return html.unescape(m.group(1).strip())
    return None


def _price_from_jsonld(page: str) -> tuple[str | None, float | None, str | None]:
    """(name, price, description) from schema.org Product data, if present."""
    for block in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', page, re.S | re.I):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                if "@graph" in node:
                    stack.extend(node["@graph"] if isinstance(node["@graph"], list) else [node["@graph"]])
                kind = node.get("@type")
                kinds = kind if isinstance(kind, list) else [kind]
                if "Product" in kinds:
                    offers = node.get("offers") or {}
                    offers = offers[0] if isinstance(offers, list) and offers else offers
                    price = None
                    if isinstance(offers, dict):
                        price = offers.get("price") or offers.get("lowPrice")
                        if price is None and isinstance(offers.get("priceSpecification"), dict):
                            price = offers["priceSpecification"].get("price")
                    try:
                        price = float(str(price).replace(",", "")) if price is not None else None
                    except ValueError:
                        price = None
                    return node.get("name"), price, node.get("description")
            elif isinstance(node, list):
                stack.extend(node)
    return None, None, None


def fetch_details(url: str) -> dict:
    """{"name", "description", "price", "ok", "error"}; missing values are None."""
    result = {"name": None, "description": None, "price": None, "ok": False, "error": None}
    if not url.lower().startswith(("http://", "https://")):
        url = "https://" + url
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            page = resp.read(2_000_000).decode(resp.headers.get_content_charset() or "utf-8", "replace")
    except urllib.error.HTTPError as e:
        result["error"] = f"The store's website refused the request ({e.code}). Enter the details yourself."
        return result
    except Exception as e:
        result["error"] = f"Couldn't open that link ({getattr(e, 'reason', e)})."
        return result

    name, price, description = _price_from_jsonld(page)
    name = name or _meta(page, "og:title", "twitter:title")
    if not name:
        m = re.search(r"<title[^>]*>(.*?)</title>", page, re.S | re.I)
        name = html.unescape(re.sub(r"\s+", " ", m.group(1))).strip() if m else None
    description = description or _meta(page, "og:description", "description", "twitter:description")
    if price is None:
        raw = _meta(page, "product:price:amount", "og:price:amount", "price")
        try:
            price = float(raw.replace(",", "").replace("$", "")) if raw else None
        except ValueError:
            price = None
    if name:
        name = re.split(r"\s+[|–—]\s+", name)[0].strip()[:120]  # drop " | Store name"
    if description:
        description = re.sub(r"\s+", " ", html.unescape(description)).strip()[:240]
    result.update(name=name or None, description=description or None,
                  price=round(price, 2) if isinstance(price, float) else None,
                  ok=bool(name or price))
    if not result["ok"]:
        result["error"] = "That page didn't include product details the app can read. Enter them yourself."
    return result
