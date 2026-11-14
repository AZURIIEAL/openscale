"""runner.run_in_child against a real child process (tests/fake_jobs.py):
the JSON-lines protocol, crash reporting, and cancellation by flag, SIGTERM
and SIGKILL. No Redis or Postgres -- the log sink and cancel check are plain
callables."""

import time

from runner import run_in_child

FAST = {"poll_seconds": 0.05, "grace_seconds": 0.2, "kill_after_seconds": 0.5}


def _request(job_type: str, params: dict | None = None) -> dict:
    return {
        "type": job_type,
        "module": "tests.fake_jobs",
        "job_id": None,
        "project_id": "proj-1",
        "params": params or {},
    }


def _cancel_after(seconds: float):
    start = time.monotonic()
    return lambda: time.monotonic() - start >= seconds


def test_result_and_live_log_lines():
    live: list[str] = []
    out = run_in_child(_request("t_echo", {"name": "kochi"}), live.append, lambda: False, **FAST)
    assert out.status == "succeeded"
    assert out.error is None
    assert out.rows == 3
    assert out.metrics == {"score": 0.5}
    assert out.log_lines == ["hello kochi in proj-1"]
    assert live == out.log_lines
    # print() goes to stderr, never into the run's log
    assert not any("stray print" in line for line in out.log_lines)


def test_partial_status():
    out = run_in_child(_request("t_partial"), lambda _: None, lambda: False, **FAST)
    assert (out.status, out.error, out.rows) == ("partial", "2024-08: REJECTED", 1)


def test_expected_failure_keeps_its_message():
    out = run_in_child(_request("t_fail"), lambda _: None, lambda: False, **FAST)
    assert out.status == "failed"
    assert out.error == "no data for that month"
    assert out.log_lines == ["about to fail", "no data for that month"]


def test_crash_without_result_reports_exit_code_and_stderr():
    out = run_in_child(_request("t_crash"), lambda _: None, lambda: False, **FAST)
    assert out.status == "failed"
    assert out.exit_code == 3
    assert "exited with code 3" in out.error
    assert "something went badly wrong" in out.error
    assert out.log_lines[0] == "about to crash"


def test_unknown_module_fails_cleanly():
    req = _request("t_echo")
    req["module"] = "tests.no_such_module"
    out = run_in_child(req, lambda _: None, lambda: False, **FAST)
    assert out.status == "failed"
    assert "could not load job" in out.error


def test_cancel_terminates_the_child():
    start = time.monotonic()
    out = run_in_child(_request("t_sleep"), lambda _: None, _cancel_after(0.2), **FAST)
    assert out.status == "cancelled"
    assert time.monotonic() - start < 10
    assert "cancel requested" in out.log_lines
    # SIGTERM became JobCancelled inside the child, which still reported back
    assert out.log_lines[-1] == "cancelled"


def test_child_that_ignores_sigterm_is_killed():
    start = time.monotonic()
    out = run_in_child(_request("t_stubborn"), lambda _: None, _cancel_after(0.2), **FAST)
    assert out.status == "cancelled"
    assert out.exit_code == -9
    assert time.monotonic() - start < 10
    assert any("killing" in line for line in out.log_lines)
