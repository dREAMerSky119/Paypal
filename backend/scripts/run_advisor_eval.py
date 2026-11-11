"""Run the 20-request advisor eval and print a table.

  python scripts/run_advisor_eval.py            offline, scripted Gemini (same as CI)
  python scripts/run_advisor_eval.py --live     real Gemini (needs GEMINI_API_KEY); scripted-only cases skipped

Exit code 1 if the pass rate is below ADVISOR_EVAL_THRESHOLD (default 0.9). Live runs use a few dozen
Gemini calls and count toward LLM_MONTHLY_CAP.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402  (MonkeyPatch is the safest way to undo the eval's patches)

from evals import advisor_eval as ev  # noqa: E402
from app.services import llm  # noqa: E402


def main() -> int:
    live = "--live" in sys.argv
    if live and not llm.is_configured():
        print("--live needs GEMINI_API_KEY (see backend/.env.example)")
        return 2
    with pytest.MonkeyPatch.context() as mp:
        results = ev.run_all(mp, live=live)
    for r in results:
        mark = "skip" if r.skipped else "PASS" if r.passed else "FAIL"
        print(f"{mark}  {r.group:<12} {r.id:<32} {r.reason}")
    rate = ev.pass_rate(results)
    print(f"\npass rate {rate:.0%} (threshold {ev.threshold():.0%}) · mode {'live' if live else 'offline'}")
    return 0 if rate >= ev.threshold() else 1


if __name__ == "__main__":
    raise SystemExit(main())
