"""
The generic `sql_transform` job: one SELECT over the project's datasets,
saved as a new dataset. Every ready dataset is a view named after it, as in
the SQL editor. DuckDB by default; Spark for inputs too big for one
machine's memory, reusing worker/spark/common/spark_session.py.

The datasets the query reads are recorded on the output's source -- the
table-level lineage the plan asks for.
"""

import os
import re

import db
from datasets.outputs import clear_output_files, derived_source, finish_output
from jobs.outcome import format_exception
from openscale import paths
from openscale.duck import DatasetView, attach_views, connect, lockdown
from openscale.sqlguard import RejectedSQL, check_single_select, referenced_tables
from registry import JobCancelled, JobContext, JobFailed, Param, job

MEMORY_LIMIT = os.environ.get("DUCKDB_MEMORY_LIMIT", "2GB")


def _strip_sql(sql: str) -> str:
    """COPY (...) can't take a trailing semicolon, which people often type."""
    return re.sub(r"[;\s]+$", "", sql.strip())


@job(
    "sql_transform",
    "SQL transform",
    "Run one SELECT over the project's datasets and save the result as a dataset.",
    params_schema=[
        Param("output", "dataset_name", "Output dataset", required=True),
        Param(
            "sql",
            "text",
            "SQL",
            required=True,
            description="One SELECT. Every ready dataset in the project is a view named after it; "
            "the output dataset itself is not.",
        ),
        Param("layer", "enum", "Layer", options=("bronze", "silver", "gold"), default="silver"),
        Param(
            "engine",
            "enum",
            "Engine",
            options=("duckdb", "spark"),
            default="duckdb",
            description="Spark for inputs larger than memory; the SQL must also parse as standard SQL.",
        ),
    ],
    stage="Transform",
    order=110,
)
def sql_transform(ctx: JobContext) -> None:
    project_id = ctx.project_id
    output = ctx.params["output"]
    sql = _strip_sql(ctx.params["sql"])
    layer = ctx.params.get("layer") or "silver"
    engine = ctx.params.get("engine") or "duckdb"

    conn = db.get_connection()
    try:
        existing = db.get_dataset(conn, project_id, output)
        if existing is not None and (existing["source"] or {}).get("kind") != "derived":
            raise JobFailed(f"dataset {output!r} already exists and was not produced by a job; choose another output name")
        datasets = [d for d in db.list_ready_datasets(conn, project_id) if d["name"] != output]
        con = connect(project_id=project_id, memory_limit=MEMORY_LIMIT)
        attach_views(con, [DatasetView(d["name"], paths.data_glob(project_id, d["id"])) for d in datasets])
        lockdown(con)

        # Everything that can be checked is checked before the output row is
        # touched, so a typo never leaves a failed dataset behind.
        try:
            check_single_select(con, sql)
            referenced = referenced_tables(con, sql)
            if output in referenced:
                raise JobFailed(f"the query can't read its own output dataset {output!r}")
            inputs = sorted(referenced & {d["name"] for d in datasets})
            if engine == "duckdb":
                con.execute(f"SELECT * FROM ({sql}) LIMIT 0").fetchall()
        except JobFailed:
            raise
        except RejectedSQL as exc:
            raise JobFailed(str(exc)) from exc
        except Exception as exc:  # binder errors: unknown table or column
            raise JobFailed(format_exception(exc)) from exc
        ctx.log(f"reads {', '.join(inputs) or 'no datasets'}; engine {engine}")

        try:
            out_id = db.claim_output_dataset(
                conn, project_id, output, layer, derived_source("sql_transform", ctx.job_id, inputs, engine=engine)
            )
        except db.OutputConflict as exc:
            raise JobFailed(str(exc)) from exc

        try:
            clear_output_files(project_id, out_id)
            if engine == "spark":
                _run_spark(ctx, project_id, out_id, sql, datasets)
            else:
                con.execute(
                    f"COPY ({sql}) TO '{paths.data_part(project_id, out_id, 0)}' (FORMAT PARQUET, COMPRESSION ZSTD)"
                )
            summary = finish_output(conn, con, project_id, out_id, ctx.log)
        except JobCancelled:
            db.mark_dataset_failed(conn, out_id, "transform cancelled")
            raise
        except Exception as exc:
            db.mark_dataset_failed(conn, out_id, format_exception(exc))
            raise
    finally:
        conn.close()

    ctx.log(f"dataset {output} is ready: {summary.result.row_count} rows, {len(summary.result.columns)} columns")
    ctx.set_rows(summary.result.row_count)
    ctx.set_metrics({"output": output, "inputs": inputs, "engine": engine, "size_bytes": summary.size_bytes})


def _run_spark(ctx: JobContext, project_id: str, out_id: str, sql: str, datasets: list[dict]) -> None:
    from spark.common.spark_session import get_spark, lake_path

    spark = get_spark("sql-transform")
    try:
        # Only the registered views are readable: no `parquet.`s3a://...``
        # queries straight against other projects' files.
        spark.conf.set("spark.sql.runSQLOnFiles", "false")
        for d in datasets:
            spark.read.parquet(lake_path(paths.data_prefix(project_id, d["id"]).rstrip("/"))).createOrReplaceTempView(
                d["name"]
            )
        ctx.check_cancelled()
        out_dir = lake_path(paths.data_prefix(project_id, out_id).rstrip("/"))
        ctx.log(f"spark: writing {out_dir}")
        spark.sql(sql).write.mode("overwrite").parquet(out_dir)
    finally:
        spark.stop()
