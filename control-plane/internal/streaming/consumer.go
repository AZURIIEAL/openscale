package streaming

import (
	"context"
	"encoding/json"
	"time"

	"github.com/rs/zerolog"
	"github.com/segmentio/kafka-go"
)

const (
	tripsTopic     = "yellow-taxi-trips"
	windowPeriod   = 2 * time.Second
	readErrBackoff = 2 * time.Second
)

// Consumer tails the yellow-taxi-trips topic from "now" (no consumer
// group, StartOffset: LastOffset -- a fresh browser tab shouldn't replay
// old backlog) and broadcasts each decoded trip, plus a rolling window
// aggregate on a ~2s ticker, to hub. Started once at server boot and run
// for the process lifetime, same pattern as cmd/server/main.go's existing
// `go hub.Run(jobEvents)` goroutine for the Redis-backed job-events hub.
type Consumer struct {
	broker string
	hub    *StreamHub
	logger zerolog.Logger
}

func NewConsumer(broker string, hub *StreamHub, logger zerolog.Logger) *Consumer {
	return &Consumer{broker: broker, hub: hub, logger: logger}
}

// Run blocks until ctx is done. It deliberately never panics or returns
// early on a Kafka error -- a fresh stack with no topic created yet, or a
// broker that's briefly unreachable, both just keep retrying rather than
// taking the control-plane's HTTP server down with them.
func (c *Consumer) Run(ctx context.Context) {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     []string{c.broker},
		Topic:       tripsTopic,
		StartOffset: kafka.LastOffset,
		MinBytes:    1,
		MaxBytes:    10e6,
	})
	defer reader.Close()

	window := newWindowAccumulator()
	ticker := time.NewTicker(windowPeriod)
	defer ticker.Stop()

	messages := make(chan kafka.Message)
	errs := make(chan error, 1)
	go c.readLoop(ctx, reader, messages, errs)

	for {
		select {
		case <-ctx.Done():
			return

		case <-ticker.C:
			agg := window.flush()
			c.hub.Broadcast(Frame{Type: "window", Window: &agg})

		case msg := <-messages:
			var trip TripEvent
			if err := json.Unmarshal(msg.Value, &trip); err != nil {
				c.logger.Warn().Err(err).Msg("streaming: malformed trip event on yellow-taxi-trips, skipping")
				continue
			}
			window.add(trip)
			c.hub.Broadcast(Frame{Type: "trip", Trip: &trip})

		case err := <-errs:
			c.logger.Warn().Err(err).Msg("streaming: kafka reader error, backing off")
			time.Sleep(readErrBackoff)
		}
	}
}

// readLoop continuously reads messages off reader, forwarding each one (or
// a transient error) onto its channel. kafka-go's Reader already retries
// internally for "topic doesn't exist yet" / leader-not-available, so this
// loop's only job is to not let any single error be fatal.
func (c *Consumer) readLoop(ctx context.Context, reader *kafka.Reader, messages chan<- kafka.Message, errs chan<- error) {
	for {
		msg, err := reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			select {
			case errs <- err:
			case <-ctx.Done():
				return
			}
			time.Sleep(readErrBackoff)
			continue
		}
		select {
		case messages <- msg:
		case <-ctx.Done():
			return
		}
	}
}
