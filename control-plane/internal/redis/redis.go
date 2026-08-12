// Package redis adapts go-redis into the job-queue's two concerns: the
// dispatch Stream (exactly-once, consumer-group semantics) and the events
// Pub/Sub channel (ephemeral live-tail relay for internal/ws). This is the
// only package in the control-plane that imports go-redis, same isolation
// convention as internal/docker for the Docker SDK.
package redis

import (
	"context"
	"encoding/json"
	"fmt"

	goredis "github.com/redis/go-redis/v9"
)

const (
	requestsStream = "openscale:jobs:requests"
	eventsChannel  = "openscale:jobs:events"
)

// JobRequest is enqueued onto the dispatch stream for a worker to pick up.
type JobRequest struct {
	JobID       string          `json:"job_id"`
	JobType     string          `json:"job_type"`
	Params      json.RawMessage `json:"params"`
	SubmittedAt string          `json:"submitted_at"`
}

// JobEvent is a live status/log update relayed from the worker to
// whichever WebSocket connections are watching that job.
type JobEvent struct {
	JobID  string `json:"job_id"`
	Type   string `json:"type"` // "status" | "log"
	Status string `json:"status,omitempty"`
	Line   string `json:"line,omitempty"`
	At     string `json:"at"`
}

type Client struct {
	rdb *goredis.Client
}

func NewClient(addr string) *Client {
	return &Client{rdb: goredis.NewClient(&goredis.Options{Addr: addr})}
}

func (c *Client) Close() error {
	return c.rdb.Close()
}

// EnqueueJob adds a job request onto the dispatch stream. The payload is
// carried as a single JSON field ("payload") rather than flat stream
// fields, since JobRequest.Params is itself a nested object.
func (c *Client) EnqueueJob(ctx context.Context, req JobRequest) error {
	payload, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("redis: marshal job request: %w", err)
	}
	return c.rdb.XAdd(ctx, &goredis.XAddArgs{
		Stream: requestsStream,
		Values: map[string]any{"payload": payload},
	}).Err()
}

// PublishJobEvent publishes a status/log event onto the same events channel
// the worker publishes to -- lets the control-plane itself push a live
// update (e.g. a cancel-all's synthetic "cancelled" status) through the
// existing ws.Hub relay, which fans out by JobID regardless of publisher.
func (c *Client) PublishJobEvent(ctx context.Context, event JobEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("redis: marshal job event: %w", err)
	}
	return c.rdb.Publish(ctx, eventsChannel, payload).Err()
}

// SubscribeJobEvents subscribes to the events channel and decodes each
// message into a JobEvent, closing the returned channel when ctx is done.
func (c *Client) SubscribeJobEvents(ctx context.Context) (<-chan JobEvent, error) {
	pubsub := c.rdb.Subscribe(ctx, eventsChannel)
	if _, err := pubsub.Receive(ctx); err != nil {
		return nil, fmt.Errorf("redis: subscribe %s: %w", eventsChannel, err)
	}

	out := make(chan JobEvent)
	go func() {
		defer close(out)
		defer pubsub.Close()
		ch := pubsub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				var event JobEvent
				if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
					continue // malformed event, skip rather than crash the relay
				}
				select {
				case out <- event:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return out, nil
}
