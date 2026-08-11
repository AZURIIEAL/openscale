// Package ws relays live job status/log events to whichever browser tabs
// are watching a given run, over WebSocket. This is the only package that
// imports nhooyr.io/websocket.
package ws

import (
	"sync"

	"github.com/AZURIIEAL/openscale/control-plane/internal/redis"
)

// Hub fans Redis pub/sub job events out to per-job-id WebSocket
// subscribers. Safe for concurrent use.
type Hub struct {
	mu    sync.Mutex
	conns map[string][]chan redis.JobEvent
}

func NewHub() *Hub {
	return &Hub{conns: make(map[string][]chan redis.JobEvent)}
}

// Run drains events and fans each one out to every subscriber currently
// watching that job_id. Blocks until events is closed -- run it in its own
// goroutine from main, tied to the Redis subscription's lifetime.
func (h *Hub) Run(events <-chan redis.JobEvent) {
	for event := range events {
		h.mu.Lock()
		subs := append([]chan redis.JobEvent(nil), h.conns[event.JobID]...)
		h.mu.Unlock()

		for _, ch := range subs {
			select {
			case ch <- event:
			default:
				// Slow/stuck subscriber -- drop the event rather than block
				// the relay for every other in-flight job.
			}
		}
	}
}

// Subscribe registers a new listener for job_id's events. The caller must
// call the returned unsubscribe func (e.g. via defer) once done, which
// also closes the returned channel.
func (h *Hub) Subscribe(jobID string) (<-chan redis.JobEvent, func()) {
	ch := make(chan redis.JobEvent, 16)

	h.mu.Lock()
	h.conns[jobID] = append(h.conns[jobID], ch)
	h.mu.Unlock()

	unsubscribe := func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		subs := h.conns[jobID]
		for i, c := range subs {
			if c == ch {
				h.conns[jobID] = append(subs[:i], subs[i+1:]...)
				break
			}
		}
		if len(h.conns[jobID]) == 0 {
			delete(h.conns, jobID)
		}
		close(ch)
	}
	return ch, unsubscribe
}
