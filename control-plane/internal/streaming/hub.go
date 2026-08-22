package streaming

import "sync"

// StreamHub fans out Frames to every currently-connected WebSocket
// subscriber. Simpler than internal/ws.Hub since there's no per-job-id
// routing here -- every subscriber gets every frame, the same live feed.
type StreamHub struct {
	mu   sync.Mutex
	subs map[chan Frame]struct{}
}

func NewStreamHub() *StreamHub {
	return &StreamHub{subs: make(map[chan Frame]struct{})}
}

// Subscribe registers a new listener. The caller must call the returned
// unsubscribe func (e.g. via defer) once done, which also closes the
// returned channel.
func (h *StreamHub) Subscribe() (<-chan Frame, func()) {
	ch := make(chan Frame, 32)

	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()

	unsubscribe := func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if _, ok := h.subs[ch]; ok {
			delete(h.subs, ch)
			close(ch)
		}
	}
	return ch, unsubscribe
}

// Broadcast fans frame out to every current subscriber, dropping it for
// any subscriber whose channel is full rather than blocking the relay for
// every other connected tab.
func (h *StreamHub) Broadcast(frame Frame) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- frame:
		default:
		}
	}
}
