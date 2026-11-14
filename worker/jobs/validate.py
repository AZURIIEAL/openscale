"""
The generic `validate` job: applies a dataset's quality rules
(datasets.rules, see libs/openscale/openscale/rules.py) and writes the kept
rows as a new dataset, plus one quarantine file per rule that removed rows.
The per-rule report goes to the run's metrics.
"""

import os

import db
from datasets.outputs import clear_output_files, derived_source, finish_output
from jobs.outcome import format_exception
from openscale import paths
from openscale.duck import connect, lockdown
from openscale.rules import InvalidRule, apply_rules, parse_rules
from registry import JobCancelled, JobContext, JobFailed, Param, job

MEMORY_LIMIT = os.environ.get("DUCKDB_MEMORY_LIMIT", "2GB")


@job(
    "validate",
    "Validate",
    "Apply a dataset's quality rules: keep the clean rows as a new dataset and set the rest aside per rule.",
    params_schema=[
        Param("dataset", "dataset", "Dataset", required=True),
        Param("output", "dataset_name", "Output dataset", required=True),
    ],
    stage="Quality",
    order=100,
)
def validate(ctx: JobContext) -> None:
    project_id = ctx.project_id
    name, output = ctx.params["dataset"], ctx.params["output"]
    if name == output:
        raise JobFailed("the output must be a new dataset, not the one being validated")

    conn = db.get_connection()
    try:
        source = db.get_dataset(conn, project_id, name)
        if source is None:
            raise JobFailed(f"no dataset named {name!r} in this project")
        if source["status"] != "ready":
            raise JobFailed(f"dataset {name!r} is {source['status']}, not ready")
        try:
            rules = parse_rules(source["rules"])
        except InvalidRule as exc:
            raise JobFailed(str(exc)) from exc

        # Clean data moves up a layer: bronze -> silver; silver and gold stay.
        layer = "silver" if source["layer"] == "bronze" else source["layer"]
        try:
            out_id = db.claim_output_dataset(
                conn, project_id, output, layer, derived_source("validate", ctx.job_id, [name])
            )
        except db.OutputConflict as exc:
            raise JobFailed(str(exc)) from exc

        try:
            clear_output_files(project_id, out_id)
            con = connect(project_id=project_id, memory_limit=MEMORY_LIMIT)
            lockdown(con)
            ctx.log(f"validating {name} with {len(rules)} rule(s) into {output}")
            run = apply_rules(
                con,
                rules,
                f"read_parquet('{paths.data_glob(project_id, source['id'])}')",
                paths.data_part(project_id, out_id, 0),
                lambda rule: paths.quarantine_part(project_id, out_id, rule.id),
            )
            for r in run.rules:
                kept = f", removed {r.assigned}" if r.assigned is not None else ""
                ctx.log(f"  {r.id} [{r.tier}] hit {r.hits}{kept}")
            ctx.log(
                f"{run.rows_in} rows in: {run.rows_out} kept, {run.rejected} rejected, {run.quarantined} quarantined"
            )
            finish_output(conn, con, project_id, out_id, ctx.log)
        except JobCancelled:
            db.mark_dataset_failed(conn, out_id, "validate cancelled")
            raise
        except InvalidRule as exc:
            db.mark_dataset_failed(conn, out_id, str(exc))
            raise JobFailed(str(exc)) from exc
        except Exception as exc:
            db.mark_dataset_failed(conn, out_id, format_exception(exc))
            raise
    finally:
        conn.close()

    ctx.log(f"dataset {output} is ready")
    ctx.set_rows(run.rows_in)
    ctx.set_metrics({"input": name, "output": output, **run.report()})
