"""
Kafka producer for the OpenScale trip-event stream.

Local dev only -- points at the Kafka broker in docker-compose.yml
(KRaft mode, single node, localhost:9092).
"""

import json

from kafka import KafkaProducer

BOOTSTRAP_SERVERS = "localhost:9092"
TRIPS_TOPIC = "yellow-taxi-trips"


def get_producer() -> KafkaProducer:
    return KafkaProducer(
        bootstrap_servers=BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )


def send_trip(producer: KafkaProducer, trip: dict) -> None:
    producer.send(TRIPS_TOPIC, trip)
