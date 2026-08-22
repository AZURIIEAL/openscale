package streaming

import (
	"context"
	"fmt"
	"sort"

	"github.com/segmentio/kafka-go"
)

// Client wraps the Kafka broker address for admin operations (topic
// listing) -- a thin wrapper, not a long-lived connection, mirroring
// internal/redis.Client's shape.
type Client struct {
	Broker string
}

func NewClient(broker string) *Client {
	return &Client{Broker: broker}
}

// ListTopics enumerates every user topic/partition on the broker and
// computes a rough message count per topic (sum of last-offset minus
// first-offset across its partitions). Returns an empty slice, not an
// error, when the broker is reachable but has no topics yet -- a fresh
// stack before any replay has run. A dial failure (broker unreachable) is
// the only case that returns an error; callers (see api.StreamingHandler)
// turn that into a brokerReachable:false response rather than a 500, so a
// Kafka blip reads as a normal UI state, not an error boundary.
func (c *Client) ListTopics(ctx context.Context) ([]TopicInfo, error) {
	conn, err := kafka.DialContext(ctx, "tcp", c.Broker)
	if err != nil {
		return nil, fmt.Errorf("streaming: dial %s: %w", c.Broker, err)
	}
	defer conn.Close()

	partitions, err := conn.ReadPartitions()
	if err != nil {
		return nil, fmt.Errorf("streaming: read partitions: %w", err)
	}

	byTopic := make(map[string][]kafka.Partition)
	for _, p := range partitions {
		if p.Topic == "" || p.Topic[0] == '_' {
			continue // skip Kafka's own internal topics (__consumer_offsets, ...)
		}
		byTopic[p.Topic] = append(byTopic[p.Topic], p)
	}

	topics := make([]TopicInfo, 0, len(byTopic))
	for name, parts := range byTopic {
		topics = append(topics, TopicInfo{
			Name:         name,
			Partitions:   len(parts),
			MessageCount: c.countMessages(ctx, name, parts),
		})
	}
	sort.Slice(topics, func(i, j int) bool { return topics[i].Name < topics[j].Name })
	return topics, nil
}

// countMessages sums (lastOffset - firstOffset) across every partition of
// one topic. A single unreachable partition is skipped rather than failing
// the whole topic listing -- this is a best-effort admin snapshot, not a
// correctness-critical read.
func (c *Client) countMessages(ctx context.Context, topic string, parts []kafka.Partition) int64 {
	var total int64
	for _, p := range parts {
		pc, err := kafka.DialLeader(ctx, "tcp", c.Broker, topic, p.ID)
		if err != nil {
			continue
		}
		first, ferr := pc.ReadFirstOffset()
		last, lerr := pc.ReadLastOffset()
		_ = pc.Close()
		if ferr == nil && lerr == nil && last >= first {
			total += last - first
		}
	}
	return total
}
