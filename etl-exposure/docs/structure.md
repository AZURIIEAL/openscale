> This is the target layout. For which parts exist today vs. are still planned, see `docs/implementation-plan.md`.

openscale-platform/

├── services/
│
├── infrastructure/
│   ├── docker/
│   ├── kafka/
│   ├── minio/
│   ├── clickhouse/
│   ├── postgres/
│   └── monitoring/
│
├── ingestion/
│   ├── downloader/
│   ├── validator/
│   └── uploader/
│
├── spark/
│   ├── bronze/
│   ├── silver/
│   ├── gold/
│   └── common/
│
├── streaming/
│   ├── replay-service/
│   ├── kafka-producer/
│   └── spark-streaming/
│
├── feature-store/
│   ├── redis/
│   ├── postgres/
│   └── feature-jobs/
│
├── ml/
│   ├── training/
│   ├── inference/
│   ├── experiments/
│   └── mlflow/
│
├── api/
│   └── fastapi/
│
├── observability/
│   ├── grafana/
│   ├── prometheus/
│   └── opentelemetry/
│
├── benchmarks/
│
├── docs/
│
└── docker-compose.yml