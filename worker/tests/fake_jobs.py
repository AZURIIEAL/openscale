"""Jobs that tests/test_runner.py runs in a real child process. Imported only
by that child (job_child imports the module named in the request), so these
never land in the test process's own registry."""

import os
import signal
import time

from registry import JobContext, JobFailed, job


@job("t_echo", "Echo", "Logs its params and reports rows and metrics.", listed=False)
def t_echo(ctx: JobContext) -> None:
    print("a stray print that must not reach the protocol")
    ctx.log(f"hello {ctx.params.get('name')} in {ctx.project_id}")
    ctx.set_rows(3)
    ctx.set_metrics({"score": 0.5})


@job("t_partial", "Partial", "Finishes partial.", listed=False)
def t_partial(ctx: JobContext) -> None:
    ctx.set_rows(1)
    ctx.set_partial("2024-08: REJECTED")


@job("t_fail", "Fail", "Fails on purpose.", listed=False)
def t_fail(ctx: JobContext) -> None:
    ctx.log("about to fail")
    raise JobFailed("no data for that month")


@job("t_crash", "Crash", "Dies without reporting a result.", listed=False)
def t_crash(ctx: JobContext) -> None:
    ctx.log("about to crash")
    os.write(2, b"segfault-ish: something went badly wrong\n")
    os._exit(3)


@job("t_sleep", "Sleep", "Runs until cancelled.", listed=False)
def t_sleep(ctx: JobContext) -> None:
    ctx.log("sleeping")
    time.sleep(60)


@job("t_stubborn", "Stubborn", "Ignores SIGTERM, so only SIGKILL stops it.", listed=False)
def t_stubborn(ctx: JobContext) -> None:
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    ctx.log("ignoring SIGTERM")
    time.sleep(60)
