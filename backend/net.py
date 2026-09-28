"""Secure connections that work on any PC.

Python on Windows only trusts the certificate authorities already in the
Windows store, and Windows adds some of them only when a browser first needs
them. So a connection Python has never made before (like Apple's push service)
can fail with CERTIFICATE_VERIFY_FAILED. Every connection here trusts both
the Windows store and Mozilla's standard list (the certifi package), exactly
as a browser would.
"""
import ssl
import urllib.request

_context = None


def ssl_context() -> ssl.SSLContext:
    global _context
    if _context is None:
        ctx = ssl.create_default_context()  # the computer's own certificate store
        try:
            import certifi
            ctx.load_verify_locations(cafile=certifi.where())  # plus Mozilla's list
        except Exception:  # noqa: BLE001 (certifi missing: the computer's store alone)
            pass
        _context = ctx
    return _context


def urlopen(req, timeout: float = 20):
    """urllib.request.urlopen with certificates that work on any PC."""
    return urllib.request.urlopen(req, timeout=timeout, context=ssl_context())
