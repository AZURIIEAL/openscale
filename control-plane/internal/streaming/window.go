package streaming

import "time"

// windowAccumulator collects trip events between ticks and produces one
// WindowAggregate per flush -- the rolling summary the Streaming screen's
// live chart plots. Every tick is flushed, including empty ones (all
// zeros): a flat "0 messages/sec" line while nothing is replaying is the
// honest current state, not a gap to hide.
type windowAccumulator struct {
	count         int
	totalRevenue  float64
	totalFare     float64
	totalDistance float64
	windowStart   time.Time
}

func newWindowAccumulator() *windowAccumulator {
	return &windowAccumulator{windowStart: time.Now()}
}

func (w *windowAccumulator) add(trip TripEvent) {
	w.count++
	w.totalRevenue += trip.TotalAmount
	w.totalFare += trip.FareAmount
	w.totalDistance += trip.TripDistance
}

// flush produces this window's aggregate and resets the accumulator for
// the next one.
func (w *windowAccumulator) flush() WindowAggregate {
	now := time.Now()
	elapsed := now.Sub(w.windowStart).Seconds()
	if elapsed <= 0 {
		elapsed = 0.001
	}

	agg := WindowAggregate{
		TripCount:         w.count,
		MessagesPerSecond: float64(w.count) / elapsed,
		TotalRevenue:      w.totalRevenue,
		WindowEndedAt:     now,
	}
	if w.count > 0 {
		agg.AvgFare = w.totalFare / float64(w.count)
		agg.AvgDistance = w.totalDistance / float64(w.count)
	}

	*w = windowAccumulator{windowStart: now}
	return agg
}
