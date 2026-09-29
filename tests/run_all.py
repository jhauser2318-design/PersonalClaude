"""Run every test in this folder, each in its own process (each one uses a fresh
temporary database). Usage:  python tests/run_all.py
Exits with an error if any test fails, so GitHub can block a broken update."""
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> int:
    failed = []
    for test in sorted(HERE.glob("test_*.py")):
        start = time.time()
        result = subprocess.run([sys.executable, str(test)], capture_output=True, text=True, timeout=600)
        ok = result.returncode == 0
        print(f"{'PASS' if ok else 'FAIL'}  {test.name}  ({time.time() - start:.1f}s)")
        if not ok:
            failed.append(test.name)
            print((result.stdout + result.stderr)[-3000:])
    print(f"\n{len(failed)} failed" if failed else "\nAll tests passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
