package streaming

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/segmentio/kafka-go"
)

// ProjectTopicPrefix is how a project's topics are named: `{slug}.{dataset}`
// (the worker's stream_dataset job writes them). A project may only list
// and tail topics with its own prefix.
func ProjectTopicPrefix(slug string) string { return slug + "." }

// TopicAllowed reports whether topic belongs to the project with this slug.
func TopicAllowed(slug, topic string) bool {
	prefix := ProjectTopicPrefix(slug)
	return len(topic) > len(prefix) && strings.HasPrefix(topic, prefix)
}

// TailFrame is one frame of a generic topic tail: a message as it arrives
// ("message", Value is its JSON, or a JSON string when it isn't JSON), or a
// ~2s rate summary ("window").
type TailFrame struct {
	Type              string          `json:"type"`
	Offset            int64           `json:"offset,omitempty"`
	Value             json.RawMessage `json:"value,omitempty"`
	Count             int             `json:"count"`
	MessagesPerSecond float64         `json:"messagesPerSecond"`
}

// messageValue passes JSON through as-is and wraps anything else as a JSON
// string, so the browser always receives valid JSON.
func messageValue(raw []byte) json.RawMessage {
	if json.Valid(raw) {
		return raw
	}
	quoted, _ := json.Marshal(string(raw))
	return quoted
}

// Tail relays topic from its newest offset to send until ctx ends or send
// fails: each message, plus a window frame every windowPeriod. One reader
// per caller (no consumer group), so each browser tab gets its own tail.
//
// shortcut: a reader per WebSocket; share one per topic through a hub if
// many viewers watch the same topic.
func (c *Client) Tail(ctx context.Context, topic string, send func(TailFrame) error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  []string{c.Broker},
		Topic:    topic,
		MinBytes: 1,
		MaxBytes: 10e6,
	})
	defer reader.Close()
	// StartOffset only applies with a consumer group; without one the reader
	// starts at the oldest message unless told otherwise.
	if err := reader.SetOffset(kafka.LastOffset); err != nil {
		return
	}

	messages := make(chan kafka.Message)
	go func() {
		for {
			msg, err := reader.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
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
	}()

	ticker := time.NewTicker(windowPeriod)
	defer ticker.Stop()
	count, start := 0, time.Now()
	for {
		var frame TailFrame
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			frame = TailFrame{Type: "window", Count: count, MessagesPerSecond: float64(count) / now.Sub(start).Seconds()}
			count, start = 0, now
		case msg := <-messages:
			count++
			frame = TailFrame{Type: "message", Offset: msg.Offset, Value: messageValue(msg.Value)}
		}
		if send(frame) != nil {
			return
		}
	}
}
