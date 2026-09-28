"""Finances module: bank and credit card accounts (via SimpleFIN), cash flow, budgets and AI reports."""
from .routes import router


def on_startup(conn):
    # Refresh in the background if the last sync is a few hours old.
    from .sync import sync_in_background
    sync_in_background(only_if_stale=True)
