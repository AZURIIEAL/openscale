# OpenScale - Dataset Analysis Report

## Dataset Information

| Field        | Value                            |
| ------------ | -------------------------------- |
| Dataset      | NYC TLC Yellow Taxi Trip Records |
| Period       | January 2024                     |
| Format       | Apache Parquet                   |
| Rows         | 2,964,624                        |
| Columns      | 19                               |
| Memory Usage | ~398.6 MB                        |

---

# Project Context

The NYC Yellow Taxi dataset was selected as the foundation for the OpenScale platform because it provides a large-scale, real-world transportation dataset containing temporal, geographical, operational, and financial information.

The dataset is suitable for:

* Data Engineering
* ETL Development
* Data Quality Validation
* Lakehouse Architectures
* Streaming Systems
* Feature Engineering
* Machine Learning
* MLOps and Monitoring

The long-term objective is to transform raw taxi trip records into a production-style analytics and AI platform using modern data engineering technologies.

---

# Schema Overview

## Temporal Columns

* tpep_pickup_datetime
* tpep_dropoff_datetime

## Location Columns

* PULocationID
* DOLocationID

## Passenger Columns

* passenger_count

## Financial Columns

* fare_amount
* tip_amount
* tolls_amount
* total_amount
* congestion_surcharge
* Airport_fee
* extra
* mta_tax
* improvement_surcharge

## Operational Columns

* VendorID
* RatecodeID
* payment_type
* store_and_fwd_flag

## Distance Metrics

* trip_distance

---

# Initial Data Quality Assessment

## Missing Values

The following columns contain missing values:

| Column               | Missing Records |
| -------------------- | --------------: |
| passenger_count      |         140,162 |
| RatecodeID           |         140,162 |
| store_and_fwd_flag   |         140,162 |
| congestion_surcharge |         140,162 |
| Airport_fee          |         140,162 |

Approximately 4.73% of all records contain missing values across these fields.

### Observation

The missing-value pattern appears consistently across multiple columns, suggesting that these records may belong to a specific category of trips rather than being random data corruption.

---

# Statistical Findings

## Passenger Count

| Metric  | Value |
| ------- | ----- |
| Minimum | 0     |
| Maximum | 9     |
| Average | 1.34  |

### Observation

Passenger counts of zero exist within the dataset and should be investigated during Silver-layer validation.

---

## Trip Distance

| Metric  | Value     |
| ------- | --------- |
| Minimum | 0.0       |
| Maximum | 312,722.3 |
| Average | 3.65      |

### Observation

The maximum observed distance is clearly unrealistic for a taxi journey and indicates the presence of corrupted or malformed records.

---

## Fare Amount

| Metric  | Value |
| ------- | ----- |
| Minimum | -899  |
| Maximum | 5,000 |
| Average | 18.18 |

### Observation

Negative fare values are present and may represent refunds, adjustments, disputes, or invalid records.

---

## Total Amount

| Metric  | Value |
| ------- | ----- |
| Minimum | -900  |
| Maximum | 5,000 |
| Average | 26.80 |

### Observation

Negative total amounts indicate the need for business-rule validation before analytics processing.

---

# Timestamp Analysis

## Pickup Timestamp

| Metric   | Value               |
| -------- | ------------------- |
| Earliest | 2002-12-31 22:59:39 |
| Latest   | 2024-02-01 00:01:15 |

## Dropoff Timestamp

| Metric   | Value               |
| -------- | ------------------- |
| Earliest | 2002-12-31 23:05:41 |
| Latest   | 2024-02-02 13:56:52 |

### Observation

Although this file represents January 2024 data, records with timestamps from 2002 were identified. These records should be reviewed during data validation and cleansing.

---

# Data Quality Risks Identified

## Critical

* Historical timestamps outside the reporting period
* Extreme trip-distance outliers
* Negative financial values

## Medium

* Missing passenger information
* Missing rate-code information
* Missing surcharge information
* Passenger count equal to zero

## Low

* Unusual RatecodeID values
* Vendor-specific inconsistencies

---

# Proposed Silver Layer Rules (Version 1)

## Timestamp Validation

* Pickup timestamp must not be null
* Dropoff timestamp must not be null
* Dropoff timestamp must occur after pickup timestamp
* Pickup year must match the dataset reporting period

## Distance Validation

* Distance must be greater than or equal to zero
* Distance must be within realistic operational limits

## Passenger Validation

* Passenger count must be greater than zero

## Financial Validation

* Fare amount must be within acceptable limits
* Total amount must be within acceptable limits
* Negative financial records should be flagged for investigation

## Schema Validation

* Required columns must exist
* Data types must match expected schema definitions

---

# Deliverables Produced

## Exploration Notebook

```text
notebooks/01_dataset_exploration.ipynb
```

Purpose:

* Dataset inspection
* Profiling
* Statistical analysis
* Quality assessment

## Dataset Profile

```text
docs/dataset-profile.json
```

Purpose:

* Machine-readable profiling report
* Future automated quality reporting

## Dataset Analysis Report

```text
docs/dataset-analysis.md
```

Purpose:

* Human-readable findings
* Data-quality documentation
* Validation-rule justification

---

# Next Steps

1. Perform duplicate-record analysis.
2. Calculate trip durations.
3. Detect invalid pickup and dropoff sequences.
4. Profile financial anomalies.
5. Investigate extreme distance outliers.
6. Create Bronze-layer ingestion jobs.
7. Implement Silver-layer validation framework.
8. Generate automated data-quality reports.
9. Begin lakehouse architecture implementation.

---

# Conclusion

The January 2024 NYC Yellow Taxi dataset provides a realistic, large-scale foundation for the OpenScale platform. Initial exploration identified several data-quality issues, including missing values, timestamp anomalies, extreme distance outliers, and negative financial records. These findings establish the basis for designing the Silver-layer validation framework and the broader OpenScale data platform architecture.
