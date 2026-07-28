# OpenScale Silver Layer Specification (v1)

## Document Information

| Field   | Value               |
| ------- | ------------------- |
| Project | OpenScale           |
| Layer   | Silver              |
| Version | 1.0                 |
| Dataset | NYC TLC Yellow Taxi |
| Period  | January 2024        |
| Status  | Draft               |

---

# Purpose

The Silver Layer is responsible for transforming raw Bronze data into a validated, standardized, and analytics-ready dataset.

The primary objectives of the Silver Layer are:

* Improve data quality
* Remove invalid records
* Standardize schema definitions
* Apply business validation rules
* Generate quality metrics
* Produce trusted datasets for Gold-layer analytics

The Silver Layer must preserve data lineage while ensuring downstream consumers receive reliable data.

---

# Architecture

```text
Raw Parquet Files
        │
        ▼
 Bronze Layer
        │
        ▼
 Validation Engine
        │
        ▼
 Quality Rules
        │
        ▼
 Silver Layer
        │
        ├── Valid Records
        │
        └── Quarantined Records
```

---

# Input Dataset

## Source

```text
data/raw/yellow_taxi/
```

Example:

```text
2024-01.parquet
2024-02.parquet
2024-03.parquet
```

---

# Output Dataset

## Valid Records

```text
data/silver/trips/
```

Example:

```text
silver_trips_2024_01.parquet
```

## Quarantined Records

```text
data/silver/quarantine/
```

Examples:

```text
negative_fares.parquet

invalid_passenger_count.parquet

invalid_timestamps.parquet

distance_outliers.parquet
```

---

# Validation Categories

## Critical Rules

Critical rules determine whether a record is valid.

Records failing these checks are rejected from the Silver dataset.

---

### SLV-001

#### Rule

```text
Pickup timestamp must not be null
```

#### Validation

```python
pickup_time IS NOT NULL
```

#### Severity

```text
CRITICAL
```

#### Action

```text
REJECT
```

---

### SLV-002

#### Rule

```text
Dropoff timestamp must not be null
```

#### Validation

```python
dropoff_time IS NOT NULL
```

#### Severity

```text
CRITICAL
```

#### Action

```text
REJECT
```

---

### SLV-003

#### Rule

```text
Dropoff time must occur after pickup time
```

#### Validation

```python
dropoff_time > pickup_time
```

#### Severity

```text
CRITICAL
```

#### Action

```text
REJECT
```

---

### SLV-004

#### Rule

```text
Trip distance must be non-negative
```

#### Validation

```python
trip_distance >= 0
```

#### Severity

```text
CRITICAL
```

#### Action

```text
REJECT
```

---

### SLV-005

#### Rule

```text
Passenger count must be greater than zero
```

#### Validation

```python
passenger_count > 0
```

#### Severity

```text
CRITICAL
```

#### Action

```text
QUARANTINE
```

---

# Financial Validation Rules

Financial anomalies may be legitimate business events and should not be immediately discarded.

---

### SLV-006

#### Rule

```text
Fare amount must be non-negative
```

#### Validation

```python
fare_amount >= 0
```

#### Severity

```text
WARNING
```

#### Action

```text
QUARANTINE
```

#### Notes

Negative fares may represent:

* Refunds
* Payment disputes
* Billing corrections
* Reversed transactions

---

### SLV-007

#### Rule

```text
Total amount must be non-negative
```

#### Validation

```python
total_amount >= 0
```

#### Severity

```text
WARNING
```

#### Action

```text
QUARANTINE
```

---

# Temporal Validation Rules

---

### SLV-008

#### Rule

```text
Pickup year must match reporting period
```

#### Validation

```python
pickup_year == dataset_year
```

#### Severity

```text
WARNING
```

#### Action

```text
FLAG
```

---

### SLV-009

#### Rule

```text
Dropoff year must match reporting period
```

#### Validation

```python
dropoff_year >= dataset_year
```

#### Severity

```text
WARNING
```

#### Action

```text
FLAG
```

---

# Distance Outlier Rules

Outlier detection identifies records that are technically valid but statistically unusual.

---

### SLV-010

#### Rule

```text
Trip distance should not exceed 100 miles
```

#### Validation

```python
trip_distance <= 100
```

#### Severity

```text
WARNING
```

#### Action

```text
QUARANTINE
```

#### Rationale

January 2024 analysis showed:

```text
95th Percentile   = 13.69 miles
99th Percentile   = 20.00 miles
99.9th Percentile = 29.50 miles
```

A threshold of 100 miles provides a conservative upper limit while still identifying extreme outliers.

---

# Missing Value Monitoring

The following fields contain known missing values.

These records should be monitored but not immediately rejected.

| Column               | Strategy |
| -------------------- | -------- |
| passenger_count      | Monitor  |
| RatecodeID           | Monitor  |
| store_and_fwd_flag   | Monitor  |
| congestion_surcharge | Monitor  |
| Airport_fee          | Monitor  |

---

# Data Quality Metrics

Each pipeline execution must generate:

```json
{
  "records_processed": 0,
  "records_accepted": 0,
  "records_rejected": 0,
  "records_quarantined": 0,
  "duplicate_records": 0,
  "invalid_timestamps": 0,
  "negative_fares": 0,
  "invalid_passenger_counts": 0,
  "distance_outliers": 0
}
```

---

# Expected Outputs

The Silver Layer must produce:

## Clean Dataset

```text
data/silver/trips/
```

## Quarantine Dataset

```text
data/silver/quarantine/
```

## Quality Report

```text
docs/quality-reports/
```

Example:

```text
quality-report-2024-01.json
```

---

# Future Enhancements

Planned improvements for Version 2:

* Dynamic outlier detection
* Geospatial validation
* Duplicate trip detection
* Statistical anomaly scoring
* Rule configuration from JSON
* Automated data-quality dashboards
* Data lineage tracking
* Great Expectations integration

---

# Conclusion

The Silver Layer serves as the quality gateway between raw Bronze data and business-facing Gold datasets. All records entering the Silver Layer must undergo validation, standardization, and quality assessment. Records that fail validation are either rejected or quarantined, ensuring that downstream analytics, machine learning models, and business reports are built on trusted and consistent data.
