// Package streaming relays the Kafka "yellow-taxi-trips" topic (fed by the
// worker's replay job, see worker/jobs/replay.py) to WebSocket subscribers,
// and reports basic topic metadata for the Streaming screen's admin panel.
// This is the only package that imports segmentio/kafka-go, same isolation
// convention as internal/redis for go-redis and internal/docker for the
// Docker SDK.
package streaming

import "time"

// TopicInfo describes one Kafka topic's shape -- enough for an admin
// snapshot panel, not a full topic-config dump.
type TopicInfo struct {
	Name         string `json:"name"`
	Partitions   int    `json:"partitions"`
	MessageCount int64  `json:"messageCount"`
}

// TripEvent is one trip record read off the yellow-taxi-trips topic,
// decoded from the JSON the worker's replay job produces (pandas'
// row.to_json(date_format="iso") over a Silver trip row -- see
// worker/jobs/replay.py). Only the fields the frontend needs are declared
// here; json.Unmarshal silently ignores the rest of the Silver schema
// (VendorID, RatecodeID, store_and_fwd_flag, the tax/surcharge columns,
// etc). json tags match the original TLC column names verbatim -- the
// frontend's httpStreamingGateway is where these get translated to
// camelCase, not here.
type TripEvent struct {
	PickupAt       string  `json:"tpep_pickup_datetime"`
	DropoffAt      string  `json:"tpep_dropoff_datetime"`
	PULocationID   int     `json:"PULocationID"`
	DOLocationID   int     `json:"DOLocationID"`
	PassengerCount float64 `json:"passenger_count"`
	TripDistance   float64 `json:"trip_distance"`
	FareAmount     float64 `json:"fare_amount"`
	TipAmount      float64 `json:"tip_amount"`
	TotalAmount    float64 `json:"total_amount"`
	PaymentType    float64 `json:"payment_type"`
}

// WindowAggregate is a rolling ~2s summary of recent trip events, flushed
// on a ticker by Consumer -- gives the Streaming screen a live
// messages/sec + revenue view without the frontend needing to do its own
// windowing math over every individual trip event.
type WindowAggregate struct {
	TripCount         int       `json:"tripCount"`
	MessagesPerSecond float64   `json:"messagesPerSecond"`
	TotalRevenue      float64   `json:"totalRevenue"`
	AvgFare           float64   `json:"avgFare"`
	AvgDistance       float64   `json:"avgDistance"`
	WindowEndedAt     time.Time `json:"windowEndedAt"`
}

// Frame is a tagged union broadcast to every WebSocket subscriber --
// either a single trip as it arrives ("trip") or a rolling window flush
// ("window"). Exactly one of Trip/Window is set, matching which Type is set.
type Frame struct {
	Type   string           `json:"type"`
	Trip   *TripEvent       `json:"trip,omitempty"`
	Window *WindowAggregate `json:"window,omitempty"`
}
